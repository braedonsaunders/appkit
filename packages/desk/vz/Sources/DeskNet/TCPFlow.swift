import Darwin

@inline(__always) func seqLT(_ a: UInt32, _ b: UInt32) -> Bool { Int32(bitPattern: a &- b) < 0 }
@inline(__always) func seqLE(_ a: UInt32, _ b: UInt32) -> Bool { Int32(bitPattern: a &- b) <= 0 }
@inline(__always) func seqGT(_ a: UInt32, _ b: UInt32) -> Bool { Int32(bitPattern: a &- b) > 0 }

/// A TCP connection as the guest sees it: the guest's port, and the address
/// and port of whatever it believes is on the other end.
public struct FlowKey: Hashable, Sendable, CustomStringConvertible {
  public let guestPort: UInt16
  public let remote: IPv4
  public let remotePort: UInt16

  public var description: String { "guest:\(guestPort) <-> \(remote):\(remotePort)" }
}

/// One terminated TCP connection: a real TCP endpoint facing the guest, and a
/// host descriptor (an internet socket, or a client of the port socket) facing
/// the Mac. Bytes are relayed between the two with flow control in both
/// directions.
///
/// The endpoint is deliberately small. The link is a lossless, in-memory
/// virtual wire with microsecond round trips, so it negotiates no window
/// scaling, SACK or timestamps, acknowledges every segment immediately, and
/// recovers the rare dropped frame (a full socket buffer) with go-back-N
/// retransmission on a timer. What it must get right is the state machine:
/// handshakes in both directions, half-close in both directions, resets, and
/// never holding more than a bounded amount of either side's data.
@MainActor
final class TCPFlow {
  enum State: Equatable {
    /// The guest sent a SYN; the host socket is still connecting.
    case connecting
    /// The upstream connected and the SYN-ACK went to the guest.
    case synReceived
    /// The Mac opened this (port socket): our SYN is with the guest.
    case synSent
    case established
    case closed
  }

  static let ourMSS: UInt16 = 1460
  static let receiveCapacity = 256 * 1024
  static let sendCapacity = 256 * 1024
  static let maximumWindow = 65_535
  static let initialRTOms: UInt64 = 250
  static let maximumRTOms: UInt64 = 4_000
  static let maximumRetries = 10
  static let handshakeRetries = 5

  let key: FlowKey
  let guestAddress: IPv4
  let fromGuest: Bool
  private unowned let stack: NetworkStack
  private let host: FDWatcher
  private(set) var state: State

  // Toward the guest.
  private let iss: UInt32
  private var sndUna: UInt32
  private var sndNxt: UInt32
  private var sndWnd: UInt32 = 0
  /// Bytes read from the host, starting at `sndUna`; the FIN is not in here.
  private var sendBuffer: [UInt8] = []
  private var hostEOF = false
  private var finSent = false
  private(set) var finAcked = false
  private var guestMSS = 536

  // From the guest.
  private var rcvNxt: UInt32 = 0
  private var toHost: [UInt8] = []
  private(set) var guestFin = false
  private var hostWriteShut = false
  private var advertisedWindow = 0

  // Timers, in the stack's milliseconds.
  private var rtoDeadline: UInt64?
  private var rto: UInt64 = TCPFlow.initialRTOms
  private var retries = 0
  private var duplicateAcks = 0

  /// A flow the guest opened: answer its SYN once the upstream connects.
  init(stack: NetworkStack, key: FlowKey, guest: IPv4, syn: TCPSegment, hostFD: Int32) {
    self.stack = stack
    self.key = key
    guestAddress = guest
    fromGuest = true
    host = FDWatcher(fd: hostFD)
    state = .connecting
    iss = UInt32.random(in: 0...UInt32.max)
    sndUna = iss
    sndNxt = iss
    rcvNxt = syn.sequence &+ 1
    sndWnd = UInt32(syn.window)
    guestMSS = Int(min(syn.mss ?? 536, TCPFlow.ourMSS))
    host.onWritable = { [weak self] in self?.hostWritable() }
    host.onReadable = { [weak self] in self?.hostReadable() }
    host.wantWrite(true)
  }

  /// A flow the Mac opened through the port socket: send the guest a SYN.
  /// `ready` is written to the client before any guest byte, once the guest
  /// accepts; `early` is client data that arrived with the request.
  init(stack: NetworkStack, key: FlowKey, guest: IPv4, clientFD: Int32, ready: [UInt8], early: [UInt8]) {
    self.stack = stack
    self.key = key
    guestAddress = guest
    fromGuest = false
    host = FDWatcher(fd: clientFD)
    state = .synSent
    iss = UInt32.random(in: 0...UInt32.max)
    sndUna = iss
    sndNxt = iss &+ 1
    sendBuffer = early
    toHost = ready
    host.onWritable = { [weak self] in self?.hostWritable() }
    host.onReadable = { [weak self] in self?.hostReadable() }
    sendControl([.syn], sequence: iss, mss: TCPFlow.ourMSS)
    armRetransmit()
  }

  // MARK: Guest side

  func receive(_ segment: TCPSegment) {
    if segment.flags.contains(.rst) {
      // A reset to a SYN we sent is the guest refusing the port: the client
      // gets a close with no reply line, exactly like a refused vsock port.
      close(resetHost: state != .synSent)
      return
    }
    switch state {
    case .closed:
      return
    case .connecting:
      // The guest is retransmitting its SYN while the upstream connects.
      return
    case .synSent:
      guard segment.flags.contains([.syn, .ack]), segment.acknowledgement == iss &+ 1 else {
        if segment.flags.contains(.ack) { stack.sendReset(answering: segment, key: key) }
        return
      }
      rcvNxt = segment.sequence &+ 1
      sndUna = iss &+ 1
      sndWnd = UInt32(segment.window)
      guestMSS = Int(min(segment.mss ?? 536, TCPFlow.ourMSS))
      becomeEstablished()
      sendAck()
      flushToHost()
      pumpToGuest()
      return
    case .synReceived:
      if segment.flags.contains(.syn) && !segment.flags.contains(.ack) {
        // Our SYN-ACK was lost; the guest asked again.
        sendControl([.syn, .ack], sequence: iss, mss: TCPFlow.ourMSS)
        return
      }
      guard segment.flags.contains(.ack), segment.acknowledgement == iss &+ 1 else { return }
      sndUna = iss &+ 1
      sndWnd = UInt32(segment.window)
      becomeEstablished()
    case .established:
      if segment.flags.contains(.syn) {
        // A SYN on a live connection is answered with an ACK, never obeyed.
        sendAck()
        return
      }
    }

    if segment.flags.contains(.ack) { processAck(segment) }
    processPayload(segment)
    pumpToGuest()
    closeIfFinished()
  }

  private func becomeEstablished() {
    state = .established
    retries = 0
    rto = TCPFlow.initialRTOms
    rtoDeadline = nil
    updateReadInterest()
  }

  private func processAck(_ segment: TCPSegment) {
    let ack = segment.acknowledgement
    if seqGT(ack, sndUna) && seqLE(ack, sndNxt) {
      var acked = Int(ack &- sndUna)
      if finSent && ack == sndNxt {
        finAcked = true
        acked -= 1
      }
      sendBuffer.removeFirst(min(acked, sendBuffer.count))
      sndUna = ack
      retries = 0
      rto = TCPFlow.initialRTOms
      duplicateAcks = 0
      rtoDeadline = sndUna == sndNxt ? nil : stack.now() + rto
      sndWnd = UInt32(segment.window)
      updateReadInterest()
    } else if ack == sndUna {
      let windowChanged = UInt32(segment.window) != sndWnd
      sndWnd = UInt32(segment.window)
      if segment.payload.isEmpty && !windowChanged && sndNxt != sndUna && !segment.flags.contains(.fin) {
        duplicateAcks += 1
        if duplicateAcks == 3 { retransmitFromUna() }
      }
    }
  }

  private func processPayload(_ segment: TCPSegment) {
    let hasFin = segment.flags.contains(.fin)
    guard !segment.payload.isEmpty || hasFin else { return }
    let offset = Int32(bitPattern: segment.sequence &- rcvNxt)
    if offset > 0 || guestFin {
      // Out of order (a frame before it was lost), or after the guest's FIN:
      // drop it and repeat our position so the guest resends from there.
      sendAck()
      return
    }
    let skip = Int(-offset)
    if skip > segment.payload.count || (skip == segment.payload.count && !hasFin) {
      sendAck()
      return
    }
    var data = Array(segment.payload[skip...])
    let space = TCPFlow.receiveCapacity - toHost.count
    var acceptsFin = hasFin
    if data.count > space {
      data = Array(data[0..<space])
      acceptsFin = false
    }
    toHost += data
    rcvNxt = rcvNxt &+ UInt32(data.count)
    if acceptsFin {
      guestFin = true
      rcvNxt = rcvNxt &+ 1
    }
    sendAck()
    flushToHost()
  }

  // MARK: Host side

  private func hostWritable() {
    if state == .connecting {
      host.wantWrite(false)
      let error = Socket.pendingError(host.fd)
      if error != 0 {
        stack.upstreamFailed(self, errno: error)
        close(resetHost: false)
        return
      }
      state = .synReceived
      sendControl([.syn, .ack], sequence: iss, mss: TCPFlow.ourMSS)
      sndNxt = iss &+ 1
      armRetransmit()
      return
    }
    flushToHost()
  }

  private func hostReadable() {
    guard state == .established, !hostEOF else {
      host.wantRead(false)
      return
    }
    let room = TCPFlow.sendCapacity - sendBuffer.count
    guard room > 0 else {
      host.wantRead(false)
      return
    }
    do {
      guard let bytes = try Socket.readAvailable(host.fd, limit: min(room, 64 * 1024)) else { return }
      if bytes.isEmpty {
        hostEOF = true
        host.wantRead(false)
      } else {
        sendBuffer += bytes
      }
    } catch {
      abort()
      return
    }
    pumpToGuest()
    updateReadInterest()
    closeIfFinished()
  }

  private func flushToHost() {
    guard state == .established else { return }
    let windowBefore = currentWindow()
    while !toHost.isEmpty {
      let written: Int
      do {
        written = try Socket.writeSome(host.fd, toHost)
      } catch {
        abort()
        return
      }
      if written == 0 { break }
      toHost.removeFirst(written)
    }
    host.wantWrite(!toHost.isEmpty)
    if toHost.isEmpty && guestFin && !hostWriteShut {
      hostWriteShut = true
      _ = Darwin.shutdown(host.fd, SHUT_WR)
    }
    // The guest stops when our window closes; tell it once it reopens.
    let windowAfter = currentWindow()
    if windowBefore < Int(TCPFlow.ourMSS) && windowAfter >= Int(TCPFlow.ourMSS) {
      sendAck()
    }
    closeIfFinished()
  }

  private func updateReadInterest() {
    host.wantRead(state == .established && !hostEOF && sendBuffer.count < TCPFlow.sendCapacity)
  }

  // MARK: Sending

  /// Where unsent data starts in `sendBuffer`. The FIN occupies a sequence
  /// number but no byte of the buffer, so it is discounted while in flight.
  private var unsentOffset: Int {
    Int(sndNxt &- sndUna) - (finSent && !finAcked ? 1 : 0)
  }

  private func pumpToGuest() {
    guard state == .established else { return }
    while true {
      let offset = unsentOffset
      let unsent = sendBuffer.count - offset
      let usable = Int(sndWnd) - Int(sndNxt &- sndUna)
      guard unsent > 0, usable > 0 else { break }
      let length = min(guestMSS, unsent, usable)
      let payload = Array(sendBuffer[offset..<(offset + length)])
      sendData(payload, sequence: sndNxt, push: length == unsent)
      sndNxt = sndNxt &+ UInt32(length)
      if rtoDeadline == nil { rtoDeadline = stack.now() + rto }
    }
    if hostEOF && !finSent && unsentOffset == sendBuffer.count {
      finSent = true
      sendControl([.fin, .ack], sequence: sndNxt)
      sndNxt = sndNxt &+ 1
      if rtoDeadline == nil { rtoDeadline = stack.now() + rto }
    }
    if sndWnd == 0 && sendBuffer.count > unsentOffset && rtoDeadline == nil {
      // The guest's window is shut with data waiting: probe it on the timer.
      rtoDeadline = stack.now() + rto
    }
  }

  private func retransmitFromUna() {
    sndNxt = sndUna
    if finSent && !finAcked { finSent = false }
    pumpToGuest()
  }

  func tick(now: UInt64) {
    guard let deadline = rtoDeadline, now >= deadline, state != .closed else { return }
    retries += 1
    rto = min(rto * 2, TCPFlow.maximumRTOms)
    rtoDeadline = now + rto
    switch state {
    case .synSent:
      if retries > TCPFlow.handshakeRetries { return close(resetHost: false) }
      sendControl([.syn], sequence: iss, mss: TCPFlow.ourMSS)
    case .synReceived:
      if retries > TCPFlow.handshakeRetries { return abort() }
      sendControl([.syn, .ack], sequence: iss, mss: TCPFlow.ourMSS)
    case .established:
      if sndUna == sndNxt {
        if sndWnd == 0 && sendBuffer.count > 0 {
          // Zero-window probe: an old sequence number draws an ACK carrying
          // the guest's current window. It never gives up on its own.
          retries = 0
          sendControl([.ack], sequence: sndUna &- 1)
        } else {
          rtoDeadline = nil
        }
        return
      }
      if retries > TCPFlow.maximumRetries { return abort() }
      retransmitFromUna()
    case .connecting, .closed:
      rtoDeadline = nil
    }
  }

  private func currentWindow() -> Int {
    min(TCPFlow.maximumWindow, TCPFlow.receiveCapacity - toHost.count)
  }

  private func sendAck() {
    sendControl([.ack], sequence: sndNxt)
  }

  private func sendControl(_ flags: TCPFlags, sequence: UInt32, mss: UInt16? = nil) {
    let syn = flags.contains(.syn) && !flags.contains(.ack)
    advertisedWindow = currentWindow()
    stack.sendTCP(
      TCPSegment(
        sourcePort: key.remotePort, destinationPort: key.guestPort, sequence: sequence,
        acknowledgement: syn ? 0 : rcvNxt, flags: flags, window: UInt16(advertisedWindow),
        mss: mss), from: key.remote, to: guestAddress)
  }

  private func sendData(_ payload: [UInt8], sequence: UInt32, push: Bool) {
    advertisedWindow = currentWindow()
    stack.sendTCP(
      TCPSegment(
        sourcePort: key.remotePort, destinationPort: key.guestPort, sequence: sequence,
        acknowledgement: rcvNxt, flags: push ? [.ack, .psh] : [.ack], window: UInt16(advertisedWindow),
        payload: payload), from: key.remote, to: guestAddress)
  }

  private func armRetransmit() {
    rtoDeadline = stack.now() + rto
  }

  // MARK: Teardown

  private func closeIfFinished() {
    guard state == .established, guestFin, hostWriteShut, finAcked else { return }
    close(resetHost: false)
  }

  /// Reset both sides: something failed and neither may wait on the other.
  func abort() {
    guard state != .closed else { return }
    if state == .established || state == .synReceived {
      stack.sendTCP(
        TCPSegment(
          sourcePort: key.remotePort, destinationPort: key.guestPort, sequence: sndNxt,
          acknowledgement: rcvNxt, flags: [.rst, .ack], window: 0), from: key.remote, to: guestAddress)
    }
    close(resetHost: true)
  }

  func close(resetHost: Bool) {
    guard state != .closed else { return }
    state = .closed
    rtoDeadline = nil
    if resetHost { Socket.abort(host.fd) }
    host.close()
    stack.flowClosed(self)
  }
}
