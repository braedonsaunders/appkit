import Darwin
import Testing

@testable import DeskNet

// MARK: - Pure codecs and policy

@Test func parsesAddressesStrictly() {
  #expect(IPv4("10.0.2.15") == IPv4(10, 0, 2, 15))
  #expect(IPv4("256.0.0.1") == nil)
  #expect(IPv4("1.2.3") == nil)
  #expect(IPv4("1.2.3.4 ") == nil)
  #expect(IPv4("01.2.3.4.5") == nil)
  #expect(MAC("06:00:00:00:00:64")?.description == "06:00:00:00:00:64")
  #expect(MAC("06:00:00:00:00") == nil)
  #expect(CIDR("100.64.0.0/10")?.contains(IPv4(100, 127, 255, 255)) == true)
  #expect(CIDR("100.64.0.0/10")?.contains(IPv4(100, 128, 0, 0)) == false)
}

@Test func fencesLocalSpaceAndTheMacUnlessTheLanIsAllowed() {
  let fence = EgressFence(allowLan: false)
  let mac: Set<IPv4> = [IPv4(151, 101, 1, 69)]
  for fenced in ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.100.100.100", "151.101.1.69"] {
    #expect(fence.verdict(for: IPv4(fenced)!, hostAddresses: mac) == .fenced, "\(fenced)")
  }
  for open in ["1.1.1.1", "9.9.9.9", "172.32.0.1", "100.128.0.1"] {
    #expect(fence.verdict(for: IPv4(open)!, hostAddresses: mac) == .allowed, "\(open)")
  }
  for invalid in ["127.0.0.1", "0.1.2.3", "224.0.0.251", "255.255.255.255", "240.0.0.1"] {
    #expect(fence.verdict(for: IPv4(invalid)!, hostAddresses: mac) == .invalid, "\(invalid)")
  }
  let lan = EgressFence(allowLan: true)
  #expect(lan.verdict(for: IPv4(192, 168, 1, 1), hostAddresses: mac) == .allowed)
  #expect(lan.verdict(for: IPv4(151, 101, 1, 69), hostAddresses: mac) == .allowed)
  #expect(lan.verdict(for: IPv4(127, 0, 0, 1), hostAddresses: mac) == .invalid)
}

@Test func documentationNetworksRemainBlockedWhenLanIsAllowed() {
  for allowLan in [false, true] {
    let fence = EgressFence(allowLan: allowLan)
    for address in ["192.0.2.0", "192.0.2.1", "192.0.2.255", "198.51.100.0", "198.51.100.255", "203.0.113.0", "203.0.113.255"] {
      #expect(fence.verdict(for: IPv4(address)!, hostAddresses: []) == .invalid, "\(address)")
    }
    for address in ["192.0.1.255", "192.0.3.0", "198.51.99.255", "198.51.101.0", "203.0.112.255", "203.0.114.0"] {
      #expect(fence.verdict(for: IPv4(address)!, hostAddresses: []) == .allowed, "\(address)")
    }
  }
}

@Test func computesTheInternetChecksum() {
  // The worked example from RFC 1071-style references: a real IPv4 header.
  let header: [UInt8] = [
    0x45, 0x00, 0x00, 0x73, 0x00, 0x00, 0x40, 0x00, 0x40, 0x11, 0x00, 0x00, 0xc0, 0xa8, 0x00, 0x01,
    0xc0, 0xa8, 0x00, 0xc7,
  ]
  #expect(internetChecksum(header) == 0xb861)
}

@Test func roundTripsTCPWithAValidChecksum() throws {
  let source = IPv4(10, 0, 2, 15)
  let destination = IPv4(1, 1, 1, 1)
  let segment = TCPSegment(
    sourcePort: 40_000, destinationPort: 443, sequence: 0xffff_fff0, acknowledgement: 7,
    flags: [.syn], window: 64_240, mss: 1460, payload: [])
  let bytes = segment.encoded(source: source, destination: destination)
  let sum = pseudoHeaderSum(source: source, destination: destination, protocol: IPProtocol.tcp, length: bytes.count)
  #expect(internetChecksum(bytes, initial: sum) == 0)
  let parsed = try #require(TCPSegment(parsing: bytes))
  #expect(parsed.mss == 1460)
  #expect(parsed.sequence == 0xffff_fff0)
  #expect(parsed.flags == [.syn])
  #expect(parsed.sequenceLength == 1)
  #expect(seqLT(0xffff_fff0, 5))
}

@Test func parsesConnectLines() {
  #expect(PendingHandshake.parse("CONNECT 5252") == 5252)
  #expect(PendingHandshake.parse("CONNECT 14500\r") == 14500)
  #expect(PendingHandshake.parse("CONNECT") == nil)
  #expect(PendingHandshake.parse("CONNECT  1") == nil)
  #expect(PendingHandshake.parse("connect 1") == nil)
  #expect(PendingHandshake.parse("CONNECT -1") == nil)
}

// MARK: - A guest on the other end of the stack

let guestIP = IPv4(10, 0, 2, 15)
let gatewayIP = IPv4(10, 0, 2, 2)
let guestMAC = MAC([0x06, 0, 0, 0, 0, 0x64])

/// Dials socket pairs instead of the internet and keeps the far ends.
final class PairDialer: Dialer, @unchecked Sendable {
  var tcpPeers: [Int32] = []
  var udpPeers: [Int32] = []
  var dialed: [(IPv4, UInt16)] = []
  var refuse = false

  func tcp(to ip: IPv4, port: UInt16) throws -> Int32 {
    dialed.append((ip, port))
    if refuse { throw POSIXFailure("connect", ECONNREFUSED) }
    let (mine, theirs) = try Self.pair(SOCK_STREAM)
    tcpPeers.append(theirs)
    return mine
  }

  func udp(to ip: IPv4, port: UInt16) throws -> Int32 {
    dialed.append((ip, port))
    let (mine, theirs) = try Self.pair(SOCK_DGRAM)
    udpPeers.append(theirs)
    return mine
  }

  func icmp() throws -> Int32 { throw POSIXFailure("socket", EPERM) }

  static func pair(_ type: Int32) throws -> (Int32, Int32) {
    var fds: [Int32] = [0, 0]
    guard socketpair(AF_UNIX, type, 0, &fds) == 0 else { throw POSIXFailure("socketpair") }
    Socket.setNonBlocking(fds[0])
    Socket.setNonBlocking(fds[1])
    Socket.setNoSigPipe(fds[0])
    Socket.setNoSigPipe(fds[1])
    return (fds[0], fds[1])
  }
}

@MainActor
final class Harness {
  var frames: [[UInt8]] = []
  let dialer = PairDialer()
  var stack: NetworkStack!
  var announced: [IPv4] = []

  init(allowLan: Bool = false, hostAddresses: Set<IPv4> = [], dns: [IPv4] = [IPv4(1, 1, 1, 1), IPv4(9, 9, 9, 9)]) {
    stack = NetworkStack(
      configuration: NetworkConfiguration(dns: dns, guestMAC: guestMAC, allowLan: allowLan), dialer: dialer,
      hostAddresses: { hostAddresses }, sendFrame: { [unowned self] in self.frames.append($0) })
    stack.onGuestAddress = { [unowned self] in self.announced.append($0) }
  }

  func send(ip payload: [UInt8], proto: UInt8, to destination: IPv4, from source: IPv4 = guestIP) {
    let packet = IPv4Packet.encode(source: source, destination: destination, proto: proto, payload: payload)
    stack.receiveFrame(EthernetFrame(destination: .gateway, source: guestMAC, type: EtherType.ipv4, payload: packet).encoded)
  }

  func send(tcp segment: TCPSegment, to destination: IPv4) {
    send(ip: segment.encoded(source: guestIP, destination: destination), proto: IPProtocol.tcp, to: destination)
  }

  /// Every IPv4 packet sent to the guest since the last call.
  func takePackets() -> [IPv4Packet] {
    defer { frames.removeAll() }
    return frames.compactMap { EthernetFrame(parsing: $0) }.filter { $0.type == EtherType.ipv4 }
      .compactMap { IPv4Packet(parsing: $0.payload) }
  }

  func takeSegments() -> [TCPSegment] {
    takePackets().filter { $0.proto == IPProtocol.tcp }.compactMap { TCPSegment(parsing: $0.payload) }
  }

  func waitFor(_ condition: () -> Bool) async {
    for _ in 0..<200 where !condition() {
      try? await Task.sleep(for: .milliseconds(10))
    }
  }
}

func readAll(_ fd: Int32) -> [UInt8]? {
  var buffer = [UInt8](repeating: 0, count: 65_536)
  let count = buffer.withUnsafeMutableBytes { read(fd, $0.baseAddress, $0.count) }
  if count < 0 { return nil }
  return Array(buffer[0..<count])
}

func writeAll(_ fd: Int32, _ bytes: [UInt8]) {
  _ = bytes.withUnsafeBytes { write(fd, $0.baseAddress, bytes.count) }
}

@MainActor @Test func answersARPForEveryAddressButTheGuests() throws {
  let harness = Harness()
  let request = ARPPacket(
    operation: ARPPacket.request, senderMAC: guestMAC, senderIP: guestIP, targetMAC: MAC([0, 0, 0, 0, 0, 0]),
    targetIP: gatewayIP)
  harness.stack.receiveFrame(EthernetFrame(destination: .broadcast, source: guestMAC, type: EtherType.arp, payload: request.encoded).encoded)
  let first = try #require(harness.frames.first)
  let frame = try #require(EthernetFrame(parsing: first))
  let reply = try #require(ARPPacket(parsing: frame.payload))
  #expect(reply.operation == ARPPacket.reply)
  #expect(reply.senderMAC == .gateway)
  #expect(reply.senderIP == gatewayIP)
  harness.frames.removeAll()
  // A duplicate-address probe for the guest's own address goes unanswered.
  let probe = ARPPacket(
    operation: ARPPacket.request, senderMAC: guestMAC, senderIP: .zero, targetMAC: MAC([0, 0, 0, 0, 0, 0]),
    targetIP: guestIP)
  harness.stack.receiveFrame(EthernetFrame(destination: .broadcast, source: guestMAC, type: EtherType.arp, payload: probe.encoded).encoded)
  #expect(harness.frames.isEmpty)
}

@MainActor @Test func leasesTheGuestItsAddressOverDHCP() throws {
  let harness = Harness()
  func dhcp(_ type: UInt8) -> [UInt8] {
    var bootp = [UInt8](repeating: 0, count: 240)
    bootp[0] = 1
    bootp[1] = 1
    bootp[2] = 6
    bootp[4...7] = [1, 2, 3, 4]
    bootp[28..<34] = guestMAC.bytes[0..<6]
    bootp[236..<240] = [99, 130, 83, 99]
    return bootp + [53, 1, type, 255]
  }
  for (type, expected) in [(UInt8(1), UInt8(2)), (UInt8(3), UInt8(5))] {
    let udp = UDPDatagram(sourcePort: 68, destinationPort: 67, payload: dhcp(type))
    harness.send(ip: udp.encoded(source: .zero, destination: .broadcast), proto: IPProtocol.udp, to: .broadcast, from: .zero)
    let packet = try #require(harness.takePackets().first)
    let reply = try #require(UDPDatagram(parsing: packet.payload))
    #expect(reply.destinationPort == 68)
    #expect(IPv4(bytes: reply.payload, at: 16) == guestIP)
    let options = DHCPServer.options(reply.payload)
    #expect(options[53] == [expected])
    #expect(options[3] == gatewayIP.bytes)
    #expect(options[6] == [1, 1, 1, 1, 9, 9, 9, 9])
  }
  #expect(harness.announced == [guestIP])
}

@MainActor @Test func refusesFencedDestinationsWithAdministrativelyProhibited() throws {
  let harness = Harness(hostAddresses: [IPv4(151, 101, 1, 69)])
  for target in ["192.168.1.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "151.101.1.69"] {
    let syn = TCPSegment(sourcePort: 40_000, destinationPort: 80, sequence: 1, acknowledgement: 0, flags: [.syn], window: 64_240)
    harness.send(tcp: syn, to: IPv4(target)!)
    let packet = try #require(harness.takePackets().first, "\(target)")
    let icmp = try #require(ICMPMessage(parsing: packet.payload))
    #expect(icmp.type == ICMPMessage.destinationUnreachable)
    #expect(icmp.code == ICMPMessage.administrativelyProhibited)
    // The quote carries the original header, so the guest maps it to its socket.
    #expect(IPv4(bytes: icmp.payload, at: 16) == IPv4(target)!)
  }
  #expect(harness.dialer.dialed.isEmpty)
}

@MainActor @Test func lanAccessLiftsTheFence() async throws {
  let harness = Harness(allowLan: true)
  let syn = TCPSegment(sourcePort: 40_000, destinationPort: 80, sequence: 1, acknowledgement: 0, flags: [.syn], window: 64_240)
  harness.send(tcp: syn, to: IPv4(192, 168, 1, 1))
  #expect(harness.dialer.dialed.count == 1)
  await harness.waitFor { !harness.frames.isEmpty }
  #expect(harness.takeSegments().first?.flags == [.syn, .ack])
  harness.stack.shutdown()
}

@MainActor @Test func resetsAGuestWhoseUpstreamRefuses() throws {
  let harness = Harness()
  harness.dialer.refuse = true
  let syn = TCPSegment(sourcePort: 40_000, destinationPort: 81, sequence: 99, acknowledgement: 0, flags: [.syn], window: 64_240)
  harness.send(tcp: syn, to: IPv4(1, 1, 1, 1))
  let reset = try #require(harness.takeSegments().first)
  #expect(reset.flags == [.rst, .ack])
  #expect(reset.acknowledgement == 100)
}

@MainActor @Test func relaysAGuestTCPConnectionBothWaysWithHalfClose() async throws {
  let harness = Harness()
  let remote = IPv4(1, 1, 1, 1)
  var seq: UInt32 = 1_000
  harness.send(tcp: TCPSegment(sourcePort: 40_000, destinationPort: 443, sequence: seq, acknowledgement: 0, flags: [.syn], window: 64_240, mss: 1460), to: remote)
  await harness.waitFor { !harness.frames.isEmpty }
  let synAck = try #require(harness.takeSegments().first)
  #expect(synAck.flags == [.syn, .ack])
  #expect(synAck.acknowledgement == seq + 1)
  #expect(synAck.mss == 1460)
  seq += 1
  var theirs = synAck.sequence &+ 1
  let peer = try #require(harness.dialer.tcpPeers.first)

  // Guest -> upstream.
  harness.send(tcp: TCPSegment(sourcePort: 40_000, destinationPort: 443, sequence: seq, acknowledgement: theirs, flags: [.ack, .psh], window: 64_240, payload: Array("hello".utf8)), to: remote)
  seq += 5
  #expect(harness.takeSegments().last?.acknowledgement == seq)
  #expect(readAll(peer) == Array("hello".utf8))

  // Upstream -> guest, segmented to the guest's MSS.
  let big = [UInt8](repeating: 0x61, count: 4_000)
  writeAll(peer, big)
  var received: [UInt8] = []
  await harness.waitFor {
    for segment in harness.takeSegments() where !segment.payload.isEmpty {
      #expect(segment.sequence == theirs)
      #expect(segment.payload.count <= 1460)
      received += segment.payload
      theirs &+= UInt32(segment.payload.count)
    }
    return received.count == big.count
  }
  #expect(received == big)
  harness.send(tcp: TCPSegment(sourcePort: 40_000, destinationPort: 443, sequence: seq, acknowledgement: theirs, flags: [.ack], window: 64_240), to: remote)

  // Guest half-closes: the upstream reads end of stream but can still write.
  harness.send(tcp: TCPSegment(sourcePort: 40_000, destinationPort: 443, sequence: seq, acknowledgement: theirs, flags: [.ack, .fin], window: 64_240), to: remote)
  seq += 1
  #expect(harness.takeSegments().last?.acknowledgement == seq)
  #expect(readAll(peer) == [])
  writeAll(peer, Array("bye".utf8))
  await harness.waitFor { harness.frames.count >= 1 }
  let tail = try #require(harness.takeSegments().first)
  #expect(tail.payload == Array("bye".utf8))
  theirs &+= 3
  harness.send(tcp: TCPSegment(sourcePort: 40_000, destinationPort: 443, sequence: seq, acknowledgement: theirs, flags: [.ack], window: 64_240), to: remote)

  // Upstream closes: the guest gets a FIN, acknowledges it, and the flow ends.
  close(peer)
  await harness.waitFor { !harness.frames.isEmpty }
  let fin = try #require(harness.takeSegments().first)
  #expect(fin.flags.contains(.fin))
  #expect(fin.sequence == theirs)
  harness.send(tcp: TCPSegment(sourcePort: 40_000, destinationPort: 443, sequence: seq, acknowledgement: theirs &+ 1, flags: [.ack], window: 64_240), to: remote)
  #expect(harness.stack.flowCount == 0)
}

@MainActor @Test func retransmitsWhatTheGuestDidNotAcknowledge() async throws {
  var clock: UInt64 = 0
  var frames: [[UInt8]] = []
  let dialer = PairDialer()
  let stack = NetworkStack(
    configuration: NetworkConfiguration(guestMAC: guestMAC), dialer: dialer, now: { clock },
    hostAddresses: { [] }, sendFrame: { frames.append($0) })
  let remote = IPv4(1, 1, 1, 1)
  let syn = TCPSegment(sourcePort: 40_001, destinationPort: 80, sequence: 1, acknowledgement: 0, flags: [.syn], window: 64_240)
  func deliver(_ segment: TCPSegment) {
    let packet = IPv4Packet.encode(source: guestIP, destination: remote, proto: IPProtocol.tcp, payload: segment.encoded(source: guestIP, destination: remote))
    stack.receiveFrame(EthernetFrame(destination: .gateway, source: guestMAC, type: EtherType.ipv4, payload: packet).encoded)
  }
  func segments() -> [TCPSegment] {
    defer { frames.removeAll() }
    return frames.compactMap { EthernetFrame(parsing: $0) }.compactMap { IPv4Packet(parsing: $0.payload) }
      .compactMap { TCPSegment(parsing: $0.payload) }
  }
  deliver(syn)
  for _ in 0..<200 where frames.isEmpty { try? await Task.sleep(for: .milliseconds(10)) }
  let synAck = try #require(segments().first)
  deliver(TCPSegment(sourcePort: 40_001, destinationPort: 80, sequence: 2, acknowledgement: synAck.sequence &+ 1, flags: [.ack], window: 64_240))
  writeAll(try #require(dialer.tcpPeers.first), Array("payload".utf8))
  for _ in 0..<200 where frames.isEmpty { try? await Task.sleep(for: .milliseconds(10)) }
  let first = try #require(segments().first)
  #expect(first.payload == Array("payload".utf8))
  // No acknowledgement arrives: the timer resends the same bytes.
  clock += 300
  stack.tick()
  let again = try #require(segments().first)
  #expect(again.sequence == first.sequence)
  #expect(again.payload == first.payload)
  stack.shutdown()
}

@MainActor @Test func connectsTheMacToAGuestPort() async throws {
  let harness = Harness()
  let (client, mine) = try PairDialer.pair(SOCK_STREAM)
  writeAll(client, [])
  harness.stack.connectToGuest(port: 14_500, clientFD: mine, early: Array("GET".utf8))
  let syn = try #require(harness.takeSegments().first)
  #expect(syn.flags == [.syn])
  #expect(syn.destinationPort == 14_500)
  // Nothing reaches the client before the guest accepts.
  #expect(readAll(client) == nil)
  harness.send(tcp: TCPSegment(sourcePort: 14_500, destinationPort: syn.sourcePort, sequence: 5_000, acknowledgement: syn.sequence &+ 1, flags: [.syn, .ack], window: 64_240, mss: 1460), to: gatewayIP)
  await harness.waitFor { harness.frames.count >= 2 }
  let segments = harness.takeSegments()
  #expect(segments.first?.flags == [.ack])
  #expect(segments.contains { $0.payload == Array("GET".utf8) })
  try? await Task.sleep(for: .milliseconds(50))
  let banner = try #require(readAll(client))
  #expect(String(decoding: banner, as: UTF8.self) == "OK \(syn.sourcePort)\n")
  harness.send(tcp: TCPSegment(sourcePort: 14_500, destinationPort: syn.sourcePort, sequence: 5_001, acknowledgement: syn.sequence &+ 4, flags: [.ack, .psh], window: 64_240, payload: Array("200".utf8)), to: gatewayIP)
  try? await Task.sleep(for: .milliseconds(50))
  #expect(readAll(client) == Array("200".utf8))
  close(client)
  harness.stack.shutdown()
}

@MainActor @Test func closesTheClientWhenTheGuestRefusesThePort() async throws {
  let harness = Harness()
  let (client, mine) = try PairDialer.pair(SOCK_STREAM)
  harness.stack.connectToGuest(port: 9, clientFD: mine)
  let syn = try #require(harness.takeSegments().first)
  harness.send(tcp: TCPSegment(sourcePort: 9, destinationPort: syn.sourcePort, sequence: 0, acknowledgement: syn.sequence &+ 1, flags: [.rst, .ack], window: 0), to: gatewayIP)
  await harness.waitFor { readAll(client) != nil }
  // End of stream with no reply line: a refusal, as a refused vsock port reads.
  #expect(readAll(client) == [])
  #expect(harness.stack.flowCount == 0)
  close(client)
}

@MainActor @Test func natsUDPAndForwardsGatewayDNS() async throws {
  let harness = Harness()
  let query = UDPDatagram(sourcePort: 5_353, destinationPort: 53, payload: [1, 2, 3])
  harness.send(ip: query.encoded(source: guestIP, destination: gatewayIP), proto: IPProtocol.udp, to: gatewayIP)
  #expect(harness.dialer.dialed.first?.0 == IPv4(1, 1, 1, 1))
  let peer = try #require(harness.dialer.udpPeers.first)
  #expect(readAll(peer) == [1, 2, 3])
  writeAll(peer, [4, 5])
  await harness.waitFor { !harness.frames.isEmpty }
  let packet = try #require(harness.takePackets().first)
  #expect(packet.source == gatewayIP)
  let answer = try #require(UDPDatagram(parsing: packet.payload))
  #expect(answer.sourcePort == 53)
  #expect(answer.destinationPort == 5_353)
  #expect(answer.payload == [4, 5])
  harness.stack.shutdown()
}

@MainActor @Test func dropsTrafficFromAnyAddressButTheGuests() {
  let harness = Harness()
  let syn = TCPSegment(sourcePort: 1, destinationPort: 80, sequence: 1, acknowledgement: 0, flags: [.syn], window: 1)
  harness.send(ip: syn.encoded(source: IPv4(10, 0, 2, 99), destination: IPv4(1, 1, 1, 1)), proto: IPProtocol.tcp, to: IPv4(1, 1, 1, 1), from: IPv4(10, 0, 2, 99))
  #expect(harness.frames.isEmpty)
  #expect(harness.dialer.dialed.isEmpty)
}

@MainActor @Test func gatewayDNSCannotBypassTheLanFence() {
  let harness = Harness(dns: [IPv4(192, 168, 1, 1)])
  let query = UDPDatagram(sourcePort: 5353, destinationPort: 53, payload: [1, 2, 3])
  harness.send(ip: query.encoded(source: guestIP, destination: gatewayIP), proto: IPProtocol.udp, to: gatewayIP)
  #expect(harness.dialer.dialed.isEmpty)
  let packets = harness.takePackets()
  #expect(packets.contains { $0.proto == IPProtocol.icmp })
  harness.stack.shutdown()
}
