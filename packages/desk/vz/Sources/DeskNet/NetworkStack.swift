import Darwin
import Dispatch

public struct NetworkConfiguration: Sendable {
  public var guestAddress: IPv4
  public var gatewayAddress: IPv4
  public var prefixLength: Int
  /// Resolvers handed to the guest over DHCP. The first also answers DNS sent
  /// to the gateway address, for guests configured to use it.
  public var dns: [IPv4]
  /// The guest NIC's address, when known up front; otherwise learned.
  public var guestMAC: MAC?
  public var allowLan: Bool

  public init(
    guestAddress: IPv4 = IPv4(10, 0, 2, 15), gatewayAddress: IPv4 = IPv4(10, 0, 2, 2),
    prefixLength: Int = 24, dns: [IPv4] = [IPv4(1, 1, 1, 1), IPv4(9, 9, 9, 9)], guestMAC: MAC? = nil,
    allowLan: Bool = false
  ) {
    self.guestAddress = guestAddress
    self.gatewayAddress = gatewayAddress
    self.prefixLength = prefixLength
    self.dns = dns
    self.guestMAC = guestMAC
    self.allowLan = allowLan
  }
}

public func monotonicMilliseconds() -> UInt64 {
  DispatchTime.now().uptimeNanoseconds / 1_000_000
}

/// A NAT between one guest and the Mac's own sockets.
///
/// Frames from the guest arrive through `receiveFrame`; frames for the guest
/// leave through `sendFrame`. In between, the gateway answers ARP and DHCP on
/// the link, and every TCP connection, UDP exchange and ICMP echo the guest
/// starts is re-originated from a socket on the Mac — after the fence has
/// approved its destination. Nothing the guest sends is ever forwarded as a
/// packet, so nothing it sends can reach a destination the fence refused.
///
/// The Mac reaches guest TCP ports through `connectToGuest`, which opens a
/// connection from the gateway address to the guest.
@MainActor
public final class NetworkStack {
  public let configuration: NetworkConfiguration
  public var onGuestAddress: ((IPv4) -> Void)?
  public let now: () -> UInt64

  private let dialer: Dialer
  private let fence: EgressFence
  private let hostAddresses: () -> Set<IPv4>
  private let sendFrame: ([UInt8]) -> Void
  private let dhcp: DHCPServer
  private var guestMAC: MAC?
  private var announcedGuest = false
  private var tcpFlows: [FlowKey: TCPFlow] = [:]
  private var udpFlows: [FlowKey: UDPFlow] = [:]
  private var echoFlows: [EchoKey: EchoFlow] = [:]
  private var nextEphemeralPort: UInt16 = 49_152
  private var timer: DispatchSourceTimer?
  private var identification: UInt16 = 0

  static let maximumTCPFlows = 4_096
  static let maximumUDPFlows = 1_024
  static let maximumEchoFlows = 64

  public init(
    configuration: NetworkConfiguration, dialer: Dialer = SystemDialer(),
    now: @escaping () -> UInt64 = monotonicMilliseconds,
    hostAddresses: @escaping () -> Set<IPv4> = Socket.hostAddresses,
    sendFrame: @escaping ([UInt8]) -> Void
  ) {
    self.configuration = configuration
    self.dialer = dialer
    self.now = now
    self.hostAddresses = hostAddresses
    self.sendFrame = sendFrame
    fence = EgressFence(allowLan: configuration.allowLan)
    guestMAC = configuration.guestMAC
    dhcp = DHCPServer(
      guest: configuration.guestAddress, gateway: configuration.gatewayAddress,
      prefixLength: configuration.prefixLength, dns: configuration.dns)
  }

  public var flowCount: Int { tcpFlows.count + udpFlows.count + echoFlows.count }

  // MARK: Inbound frames

  public func receiveFrame(_ bytes: [UInt8]) {
    guard let frame = EthernetFrame(parsing: bytes) else { return }
    guard frame.destination == .gateway || frame.destination.isBroadcast else { return }
    if guestMAC == nil { guestMAC = frame.source }
    switch frame.type {
    case EtherType.arp:
      if let arp = ARPPacket(parsing: frame.payload) { receiveARP(arp, from: frame.source) }
    case EtherType.ipv4:
      if let packet = IPv4Packet(parsing: frame.payload) { receiveIPv4(packet, from: frame.source) }
    default:
      // IPv6 and everything else stop here: the guest gets no route for it.
      break
    }
  }

  private func receiveARP(_ arp: ARPPacket, from source: MAC) {
    guard arp.operation == ARPPacket.request else { return }
    // Answer for every address but the guest's own. The guest then sends all
    // its traffic to the gateway whether it thinks a destination is on-link
    // or not, and the fence judges it there. Probes from 0.0.0.0 are the
    // guest checking its own address is free, and must go unanswered.
    guard arp.senderIP != .zero, arp.targetIP != arp.senderIP,
      arp.targetIP != configuration.guestAddress
    else { return }
    let reply = ARPPacket(
      operation: ARPPacket.reply, senderMAC: .gateway, senderIP: arp.targetIP,
      targetMAC: arp.senderMAC, targetIP: arp.senderIP)
    sendFrame(EthernetFrame(destination: source, source: .gateway, type: EtherType.arp, payload: reply.encoded).encoded)
  }

  private func receiveIPv4(_ packet: IPv4Packet, from source: MAC) {
    if packet.proto == IPProtocol.udp, let udp = UDPDatagram(parsing: packet.payload),
      udp.destinationPort == 67, udp.sourcePort == 68
    {
      receiveDHCP(udp, from: source)
      return
    }
    // One guest, one address: anything else is spoofed or misconfigured.
    guard packet.source == configuration.guestAddress, !packet.isFragment else { return }
    announceGuest()
    let destination = packet.destination
    if destination == configuration.gatewayAddress {
      receiveForGateway(packet)
      return
    }
    switch fence.verdict(for: destination, hostAddresses: hostAddresses()) {
    case .allowed:
      break
    case .invalid:
      return
    case .fenced:
      sendUnreachable(ICMPMessage.administrativelyProhibited, quoting: packet)
      return
    }
    switch packet.proto {
    case IPProtocol.tcp:
      if let segment = TCPSegment(parsing: packet.payload) { receiveTCP(segment, packet: packet) }
    case IPProtocol.udp:
      if let datagram = UDPDatagram(parsing: packet.payload) { receiveUDP(datagram, packet: packet, upstream: destination) }
    case IPProtocol.icmp:
      if let message = ICMPMessage(parsing: packet.payload), message.type == ICMPMessage.echoRequest {
        receiveEcho(message, destination: destination)
      }
    default:
      sendUnreachable(ICMPMessage.administrativelyProhibited, quoting: packet)
    }
  }

  private func announceGuest() {
    guard !announcedGuest else { return }
    announcedGuest = true
    onGuestAddress?(configuration.guestAddress)
  }

  private func receiveDHCP(_ datagram: UDPDatagram, from source: MAC) {
    guard let reply = dhcp.respond(to: datagram.payload) else { return }
    let udp = UDPDatagram(sourcePort: 67, destinationPort: 68, payload: reply.payload)
    let ip = IPv4Packet.encode(
      source: configuration.gatewayAddress, destination: .broadcast, proto: IPProtocol.udp,
      payload: udp.encoded(source: configuration.gatewayAddress, destination: .broadcast),
      identification: nextIdentification())
    sendFrame(EthernetFrame(destination: reply.clientMAC, source: .gateway, type: EtherType.ipv4, payload: ip).encoded)
    if reply.assigned { announceGuest() }
  }

  /// The gateway is the Mac's face on the link, so it offers nothing but a
  /// ping reply and a DNS forwarder: no port on it reaches a Mac service.
  private func receiveForGateway(_ packet: IPv4Packet) {
    switch packet.proto {
    case IPProtocol.icmp:
      guard let message = ICMPMessage(parsing: packet.payload), message.type == ICMPMessage.echoRequest else { return }
      let reply = ICMPMessage(type: ICMPMessage.echoReply, code: 0, rest: message.rest, payload: message.payload)
      sendIPv4(reply.encoded, proto: IPProtocol.icmp, from: configuration.gatewayAddress)
    case IPProtocol.tcp:
      if let segment = TCPSegment(parsing: packet.payload) {
        let key = FlowKey(guestPort: segment.sourcePort, remote: packet.destination, remotePort: segment.destinationPort)
        if let flow = tcpFlows[key] {
          flow.receive(segment)
        } else {
          sendReset(answering: segment, key: key)
        }
      }
    case IPProtocol.udp:
      guard let datagram = UDPDatagram(parsing: packet.payload) else { return }
      if datagram.destinationPort == 53, let resolver = configuration.dns.first {
        guard fence.verdict(for: resolver, hostAddresses: hostAddresses()) == .allowed else {
          sendUnreachable(ICMPMessage.administrativelyProhibited, quoting: packet)
          return
        }
        receiveUDP(datagram, packet: packet, upstream: resolver)
      } else {
        sendUnreachable(ICMPMessage.portUnreachable, quoting: packet)
      }
    default:
      return
    }
  }

  // MARK: TCP

  private func receiveTCP(_ segment: TCPSegment, packet: IPv4Packet) {
    let key = FlowKey(guestPort: segment.sourcePort, remote: packet.destination, remotePort: segment.destinationPort)
    if let flow = tcpFlows[key] {
      flow.receive(segment)
      return
    }
    guard segment.flags.contains(.syn), !segment.flags.contains(.ack), !segment.flags.contains(.rst) else {
      sendReset(answering: segment, key: key)
      return
    }
    guard tcpFlows.count < Self.maximumTCPFlows else {
      sendReset(answering: segment, key: key)
      return
    }
    let fd: Int32
    do {
      fd = try dialer.tcp(to: packet.destination, port: segment.destinationPort)
    } catch let failure as POSIXFailure {
      reportUpstreamFailure(failure.code, key: key, quoting: packet, segment: segment)
      return
    } catch {
      sendUnreachable(ICMPMessage.hostUnreachable, quoting: packet)
      return
    }
    let flow = TCPFlow(stack: self, key: key, guest: configuration.guestAddress, syn: segment, hostFD: fd)
    pendingSYNs[ObjectIdentifier(flow)] = packet
    tcpFlows[key] = flow
    startTimer()
  }

  /// The SYN each connecting flow came from, for quoting in an ICMP error.
  private var pendingSYNs: [ObjectIdentifier: IPv4Packet] = [:]

  func upstreamFailed(_ flow: TCPFlow, errno code: Int32) {
    guard let packet = pendingSYNs.removeValue(forKey: ObjectIdentifier(flow)),
      let segment = TCPSegment(parsing: packet.payload)
    else { return }
    reportUpstreamFailure(code, key: flow.key, quoting: packet, segment: segment)
  }

  private func reportUpstreamFailure(_ code: Int32, key: FlowKey, quoting packet: IPv4Packet, segment: TCPSegment) {
    if code == ECONNREFUSED {
      sendReset(answering: segment, key: key)
    } else {
      sendUnreachable(ICMPMessage.hostUnreachable, quoting: packet)
    }
  }

  func sendReset(answering segment: TCPSegment, key: FlowKey) {
    guard !segment.flags.contains(.rst) else { return }
    let reset: TCPSegment
    if segment.flags.contains(.ack) {
      reset = TCPSegment(
        sourcePort: key.remotePort, destinationPort: key.guestPort, sequence: segment.acknowledgement,
        acknowledgement: 0, flags: [.rst], window: 0)
    } else {
      reset = TCPSegment(
        sourcePort: key.remotePort, destinationPort: key.guestPort, sequence: 0,
        acknowledgement: segment.sequence &+ segment.sequenceLength, flags: [.rst, .ack], window: 0)
    }
    sendTCP(reset, from: key.remote, to: configuration.guestAddress)
  }

  func sendTCP(_ segment: TCPSegment, from source: IPv4, to destination: IPv4) {
    sendIPv4(segment.encoded(source: source, destination: destination), proto: IPProtocol.tcp, from: source)
  }

  func flowClosed(_ flow: TCPFlow) {
    pendingSYNs.removeValue(forKey: ObjectIdentifier(flow))
    if tcpFlows[flow.key] === flow { tcpFlows.removeValue(forKey: flow.key) }
  }

  /// Open a TCP connection from the gateway to `port` on the guest, relayed to
  /// `clientFD`. Once the guest accepts, `OK <local port>\n` is written to the
  /// client and the descriptor carries the connection; a refusal or a guest
  /// that never answers closes it with nothing written. `early` is client data
  /// that arrived with the request and is delivered first.
  public func connectToGuest(port: UInt16, clientFD: Int32, early: [UInt8] = []) {
    guard tcpFlows.count < Self.maximumTCPFlows, let localPort = allocateEphemeralPort() else {
      Darwin.close(clientFD)
      return
    }
    let key = FlowKey(guestPort: port, remote: configuration.gatewayAddress, remotePort: localPort)
    Socket.setNonBlocking(clientFD)
    Socket.setNoSigPipe(clientFD)
    let flow = TCPFlow(
      stack: self, key: key, guest: configuration.guestAddress, clientFD: clientFD,
      ready: Array("OK \(localPort)\n".utf8), early: early)
    if flow.state != .closed { tcpFlows[key] = flow }
    startTimer()
  }

  private func allocateEphemeralPort() -> UInt16? {
    for _ in 0..<16_384 {
      let port = nextEphemeralPort
      nextEphemeralPort = nextEphemeralPort == 65_535 ? 49_152 : nextEphemeralPort + 1
      let inUse = tcpFlows.keys.contains { $0.remote == configuration.gatewayAddress && $0.remotePort == port }
      if !inUse { return port }
    }
    return nil
  }

  // MARK: UDP

  private func receiveUDP(_ datagram: UDPDatagram, packet: IPv4Packet, upstream: IPv4) {
    let key = FlowKey(guestPort: datagram.sourcePort, remote: packet.destination, remotePort: datagram.destinationPort)
    let flow: UDPFlow
    if let existing = udpFlows[key] {
      flow = existing
    } else {
      if udpFlows.count >= Self.maximumUDPFlows, let oldest = udpFlows.values.min(by: { $0.lastActive < $1.lastActive }) {
        oldest.close()
      }
      let fd: Int32
      do {
        fd = try dialer.udp(to: upstream, port: datagram.destinationPort)
      } catch {
        sendUnreachable(ICMPMessage.hostUnreachable, quoting: packet)
        return
      }
      flow = UDPFlow(stack: self, key: key, fd: fd)
      udpFlows[key] = flow
      startTimer()
    }
    flow.send(datagram.payload, quoting: packet)
  }

  func sendUDP(_ payload: [UInt8], key: FlowKey) {
    let datagram = UDPDatagram(sourcePort: key.remotePort, destinationPort: key.guestPort, payload: payload)
    sendIPv4(
      datagram.encoded(source: key.remote, destination: configuration.guestAddress), proto: IPProtocol.udp,
      from: key.remote)
  }

  func udpFlowClosed(_ flow: UDPFlow) {
    if udpFlows[flow.key] === flow { udpFlows.removeValue(forKey: flow.key) }
  }

  // MARK: ICMP

  private func receiveEcho(_ message: ICMPMessage, destination: IPv4) {
    let key = EchoKey(remote: destination, identifier: message.identifier)
    let flow: EchoFlow
    if let existing = echoFlows[key] {
      flow = existing
    } else {
      guard echoFlows.count < Self.maximumEchoFlows else { return }
      let fd: Int32
      do {
        fd = try dialer.icmp()
      } catch {
        return
      }
      flow = EchoFlow(stack: self, key: key, fd: fd)
      echoFlows[key] = flow
      startTimer()
    }
    flow.send(message)
  }

  func sendEchoReply(_ message: ICMPMessage, key: EchoKey) {
    sendIPv4(message.encoded, proto: IPProtocol.icmp, from: key.remote)
  }

  func echoFlowClosed(_ flow: EchoFlow) {
    if echoFlows[flow.key] === flow { echoFlows.removeValue(forKey: flow.key) }
  }

  func sendUnreachable(_ code: UInt8, quoting packet: IPv4Packet) {
    let quoted = packet.header + Array(packet.payload.prefix(8))
    let message = ICMPMessage(type: ICMPMessage.destinationUnreachable, code: code, rest: 0, payload: quoted)
    sendIPv4(message.encoded, proto: IPProtocol.icmp, from: configuration.gatewayAddress)
  }

  // MARK: Output

  private func nextIdentification() -> UInt16 {
    identification &+= 1
    return identification
  }

  private func sendIPv4(_ payload: [UInt8], proto: UInt8, from source: IPv4) {
    let packet = IPv4Packet.encode(
      source: source, destination: configuration.guestAddress, proto: proto, payload: payload,
      identification: nextIdentification())
    let destination = guestMAC ?? .broadcast
    sendFrame(EthernetFrame(destination: destination, source: .gateway, type: EtherType.ipv4, payload: packet).encoded)
  }

  // MARK: Timers

  /// Retransmissions and idle expiry. Runs only while there are flows, so an
  /// idle guest costs the Mac no wakeups.
  public func tick() {
    let current = now()
    for flow in Array(tcpFlows.values) { flow.tick(now: current) }
    for flow in Array(udpFlows.values) where flow.expired(now: current) { flow.close() }
    for flow in Array(echoFlows.values) where flow.expired(now: current) { flow.close() }
    if flowCount == 0 { stopTimer() }
  }

  private func startTimer() {
    guard timer == nil else { return }
    let source = DispatchSource.makeTimerSource(queue: .main)
    source.schedule(deadline: .now() + .milliseconds(50), repeating: .milliseconds(50), leeway: .milliseconds(10))
    source.setEventHandler { @Sendable [weak self] in Task { @MainActor in self?.tick() } }
    source.resume()
    timer = source
  }

  private func stopTimer() {
    timer?.cancel()
    timer = nil
  }

  /// Drop every connection, resetting the host side of each.
  public func shutdown() {
    for flow in Array(tcpFlows.values) { flow.abort() }
    for flow in Array(udpFlows.values) { flow.close() }
    for flow in Array(echoFlows.values) { flow.close() }
    stopTimer()
  }
}

// MARK: - UDP and ICMP flows

@MainActor
final class UDPFlow {
  let key: FlowKey
  private(set) var lastActive: UInt64
  private unowned let stack: NetworkStack
  private let socket: FDWatcher
  private var lastQuote: IPv4Packet?

  init(stack: NetworkStack, key: FlowKey, fd: Int32) {
    self.stack = stack
    self.key = key
    socket = FDWatcher(fd: fd)
    lastActive = stack.now()
    socket.onReadable = { [weak self] in self?.readable() }
    socket.wantRead(true)
  }

  /// DNS answers come back at once or not at all; anything else may be a
  /// long-lived exchange such as QUIC.
  private var idleLimit: UInt64 { key.remotePort == 53 ? 15_000 : 120_000 }

  func expired(now: UInt64) -> Bool { now - lastActive > idleLimit }

  func send(_ payload: [UInt8], quoting packet: IPv4Packet) {
    lastActive = stack.now()
    lastQuote = packet
    _ = payload.withUnsafeBytes { Darwin.send(socket.fd, $0.baseAddress, payload.count, 0) }
  }

  private func readable() {
    var buffer = [UInt8](repeating: 0, count: 65_536)
    while true {
      let count = buffer.withUnsafeMutableBytes { Darwin.recv(socket.fd, $0.baseAddress, $0.count, 0) }
      if count < 0 {
        if errno == ECONNREFUSED, let quote = lastQuote {
          stack.sendUnreachable(ICMPMessage.portUnreachable, quoting: quote)
          continue
        }
        return
      }
      lastActive = stack.now()
      stack.sendUDP(Array(buffer[0..<count]), key: key)
    }
  }

  func close() {
    socket.close()
    stack.udpFlowClosed(self)
  }
}

struct EchoKey: Hashable {
  let remote: IPv4
  let identifier: UInt16
}

@MainActor
final class EchoFlow {
  let key: EchoKey
  private var lastActive: UInt64
  private unowned let stack: NetworkStack
  private let socket: FDWatcher

  init(stack: NetworkStack, key: EchoKey, fd: Int32) {
    self.stack = stack
    self.key = key
    socket = FDWatcher(fd: fd)
    lastActive = stack.now()
    socket.onReadable = { [weak self] in self?.readable() }
    socket.wantRead(true)
  }

  func expired(now: UInt64) -> Bool { now - lastActive > 10_000 }

  func send(_ message: ICMPMessage) {
    lastActive = stack.now()
    let bytes = message.encoded
    var address = Socket.address(key.remote, 0)
    _ = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
        bytes.withUnsafeBytes {
          Darwin.sendto(socket.fd, $0.baseAddress, bytes.count, 0, sockaddrPointer, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
    }
  }

  private func readable() {
    var buffer = [UInt8](repeating: 0, count: 65_536)
    while true {
      let count = buffer.withUnsafeMutableBytes { Darwin.recv(socket.fd, $0.baseAddress, $0.count, 0) }
      if count <= 0 { return }
      var bytes = Array(buffer[0..<count])
      // Darwin hands datagram ICMP sockets the IP header too.
      if bytes.count >= 20, bytes[0] >> 4 == 4 {
        let headerLength = Int(bytes[0] & 0x0f) * 4
        guard bytes.count >= headerLength + 8 else { continue }
        bytes = Array(bytes[headerLength...])
      }
      guard let reply = ICMPMessage(parsing: bytes), reply.type == ICMPMessage.echoReply else { continue }
      lastActive = stack.now()
      // The kernel may have chosen its own identifier; the guest gets its own back.
      let rest = UInt32(key.identifier) << 16 | UInt32(reply.sequenceNumber)
      stack.sendEchoReply(ICMPMessage(type: ICMPMessage.echoReply, code: 0, rest: rest, payload: reply.payload), key: key)
    }
  }

  func close() {
    socket.close()
    stack.echoFlowClosed(self)
  }
}
