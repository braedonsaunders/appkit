import Darwin
import Dispatch

/// The helper's end of the datagram socket pair behind the guest NIC: one
/// datagram is one Ethernet frame.
@MainActor
public final class DatagramLink {
  public var onFrame: (([UInt8]) -> Void)?
  private let socket: FDWatcher

  /// The largest frame the link carries, with headroom for a guest that
  /// offloads segmentation.
  static let maximumFrame = 65_550

  public init(fd: Int32) {
    Socket.setNonBlocking(fd)
    socket = FDWatcher(fd: fd)
    socket.onReadable = { [weak self] in self?.readable() }
    socket.wantRead(true)
  }

  /// Make a connected pair sized for bursts. Apple recommends the receiving
  /// buffer be at least twice the sending one. Returns (helper end, VM end).
  public static func makePair() throws -> (Int32, Int32) {
    var fds: [Int32] = [0, 0]
    guard socketpair(AF_UNIX, SOCK_DGRAM, 0, &fds) == 0 else { throw POSIXFailure("socketpair") }
    for fd in fds {
      Socket.setInt(fd, SOL_SOCKET, SO_SNDBUF, 1 << 20)
      Socket.setInt(fd, SOL_SOCKET, SO_RCVBUF, 4 << 20)
    }
    return (fds[0], fds[1])
  }

  /// Send one frame. A full buffer drops it, as a wire would; TCP recovers.
  public func send(_ frame: [UInt8]) {
    guard !socket.isClosed else { return }
    _ = frame.withUnsafeBytes { Darwin.send(socket.fd, $0.baseAddress, frame.count, 0) }
  }

  private func readable() {
    var buffer = [UInt8](repeating: 0, count: Self.maximumFrame)
    while true {
      let count = buffer.withUnsafeMutableBytes { Darwin.recv(socket.fd, $0.baseAddress, $0.count, 0) }
      if count <= 0 { return }
      onFrame?(Array(buffer[0..<count]))
      if socket.isClosed { return }
    }
  }

  public func close() { socket.close() }
}

/// A Unix-socket listener speaking the Cloud Hypervisor hybrid-vsock preamble.
///
/// A client connects and writes `CONNECT <port>\n`. The listener hands the
/// connection and the port to `onRequest`, which either completes it — writes
/// `OK <number>\n` and carries the stream — or closes it with nothing written,
/// which is how a refused port presents. Anything else on the first line, or
/// no line within the deadline, closes the connection.
@MainActor
public final class HandshakeListener {
  public typealias Request = (_ client: Int32, _ port: UInt32, _ early: [UInt8]) -> Void

  public let path: String
  private let listener: FDWatcher
  private let onRequest: Request
  private var pending: [ObjectIdentifier: PendingHandshake] = [:]

  static let lineLimit = 128
  static let deadlineSeconds = 10

  public init(path: String, onRequest: @escaping Request) throws {
    self.path = path
    self.onRequest = onRequest
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let capacity = MemoryLayout.size(ofValue: address.sun_path)
    let pathBytes = Array(path.utf8)
    guard pathBytes.count < capacity else {
      throw POSIXFailure("socket path \(path) is longer than \(capacity - 1) bytes", ENAMETOOLONG)
    }
    withUnsafeMutableBytes(of: &address.sun_path) { raw in
      raw.copyBytes(from: pathBytes)
      raw[pathBytes.count] = 0
    }
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { throw POSIXFailure("socket") }
    unlink(path)
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard bound == 0 else {
      let failure = POSIXFailure("bind \(path)")
      Darwin.close(fd)
      throw failure
    }
    // Only this user may drive the guest through the socket.
    chmod(path, 0o600)
    guard Darwin.listen(fd, 64) == 0 else {
      let failure = POSIXFailure("listen \(path)")
      Darwin.close(fd)
      throw failure
    }
    Socket.setNonBlocking(fd)
    listener = FDWatcher(fd: fd)
    listener.onReadable = { [weak self] in self?.accept() }
    listener.wantRead(true)
  }

  private func accept() {
    while true {
      let client = Darwin.accept(listener.fd, nil, nil)
      if client < 0 { return }
      Socket.setNonBlocking(client)
      Socket.setNoSigPipe(client)
      let handshake = PendingHandshake(fd: client)
      let id = ObjectIdentifier(handshake)
      pending[id] = handshake
      handshake.onComplete = { [weak self] port, early in
        guard let self else { return }
        self.pending.removeValue(forKey: id)
        if let port, let early {
          // Hand over a duplicate; the watcher closes the original.
          let owned = dup(client)
          handshake.finish()
          if owned >= 0 { self.onRequest(owned, port, early) }
        } else {
          handshake.finish()
        }
      }
      handshake.start()
    }
  }

  public func close() {
    listener.close()
    for handshake in pending.values { handshake.finish() }
    pending.removeAll()
    unlink(path)
  }
}

@MainActor
final class PendingHandshake {
  var onComplete: ((UInt32?, [UInt8]?) -> Void)?
  private let socket: FDWatcher
  private var buffer: [UInt8] = []
  private var timer: DispatchSourceTimer?

  init(fd: Int32) {
    socket = FDWatcher(fd: fd)
  }

  func start() {
    socket.onReadable = { [weak self] in self?.readable() }
    socket.wantRead(true)
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + .seconds(HandshakeListener.deadlineSeconds))
    timer.setEventHandler { @Sendable [weak self] in Task { @MainActor in self?.complete(nil, nil) } }
    timer.resume()
    self.timer = timer
  }

  private func readable() {
    let bytes: [UInt8]?
    do {
      bytes = try Socket.readAvailable(socket.fd, limit: HandshakeListener.lineLimit)
    } catch {
      return complete(nil, nil)
    }
    guard let bytes else { return }
    if bytes.isEmpty { return complete(nil, nil) }
    buffer += bytes
    guard let newline = buffer.firstIndex(of: 0x0a) else {
      if buffer.count > HandshakeListener.lineLimit { complete(nil, nil) }
      return
    }
    let line = String(decoding: buffer[0..<newline], as: UTF8.self)
    let early = Array(buffer[(newline + 1)...])
    complete(Self.parse(line), early)
  }

  /// `CONNECT <port>`, exactly. A trailing carriage return is tolerated.
  nonisolated static func parse(_ line: String) -> UInt32? {
    var text = Substring(line)
    if text.hasSuffix("\r") { text = text.dropLast() }
    let parts = text.split(separator: " ", omittingEmptySubsequences: false)
    guard parts.count == 2, parts[0] == "CONNECT", !parts[1].isEmpty,
      parts[1].allSatisfy({ $0.isASCII && $0.isNumber })
    else { return nil }
    return UInt32(parts[1])
  }

  private func complete(_ port: UInt32?, _ early: [UInt8]?) {
    guard let onComplete else { return }
    self.onComplete = nil
    socket.wantRead(false)
    onComplete(port, port == nil ? nil : early)
  }

  func finish() {
    timer?.cancel()
    timer = nil
    onComplete = nil
    socket.close()
  }
}

/// Two descriptors joined into one stream, with bounded buffering and
/// half-close carried across in both directions.
@MainActor
public final class Relay {
  private let left: FDWatcher
  private let right: FDWatcher
  private var leftToRight: [UInt8]
  private var rightToLeft: [UInt8] = []
  private var leftEOF = false
  private var rightEOF = false
  private var leftShut = false
  private var rightShut = false
  private var closed = false
  private let onClose: () -> Void

  static let capacity = 256 * 1024

  /// `early` is data already read from `left` that must reach `right` first.
  public init(left: Int32, right: Int32, early: [UInt8] = [], onClose: @escaping () -> Void = {}) {
    for fd in [left, right] {
      Socket.setNonBlocking(fd)
      Socket.setNoSigPipe(fd)
    }
    self.left = FDWatcher(fd: left)
    self.right = FDWatcher(fd: right)
    leftToRight = early
    self.onClose = onClose
    self.left.onReadable = { [weak self] in self?.read(fromLeft: true) }
    self.right.onReadable = { [weak self] in self?.read(fromLeft: false) }
    self.left.onWritable = { [weak self] in self?.flush(toRight: false) }
    self.right.onWritable = { [weak self] in self?.flush(toRight: true) }
    flush(toRight: true)
    updateInterest()
  }

  private func read(fromLeft: Bool) {
    let source = fromLeft ? left : right
    let buffered = fromLeft ? leftToRight.count : rightToLeft.count
    let room = Relay.capacity - buffered
    guard room > 0 else { return updateInterest() }
    let bytes: [UInt8]?
    do {
      bytes = try Socket.readAvailable(source.fd, limit: min(room, 64 * 1024))
    } catch {
      return close()
    }
    guard let bytes else { return }
    if bytes.isEmpty {
      if fromLeft { leftEOF = true } else { rightEOF = true }
    } else if fromLeft {
      leftToRight += bytes
    } else {
      rightToLeft += bytes
    }
    flush(toRight: fromLeft)
    updateInterest()
  }

  private func flush(toRight: Bool) {
    guard !closed else { return }
    let target = toRight ? right : left
    var buffer = toRight ? leftToRight : rightToLeft
    while !buffer.isEmpty {
      let written: Int
      do {
        written = try Socket.writeSome(target.fd, buffer)
      } catch {
        return close()
      }
      if written == 0 { break }
      buffer.removeFirst(written)
    }
    if toRight { leftToRight = buffer } else { rightToLeft = buffer }
    target.wantWrite(!buffer.isEmpty)
    if buffer.isEmpty {
      if toRight && leftEOF && !rightShut {
        rightShut = true
        _ = Darwin.shutdown(right.fd, SHUT_WR)
      } else if !toRight && rightEOF && !leftShut {
        leftShut = true
        _ = Darwin.shutdown(left.fd, SHUT_WR)
      }
    }
    if leftShut && rightShut { close() }
    updateInterest()
  }

  private func updateInterest() {
    guard !closed else { return }
    left.wantRead(!leftEOF && leftToRight.count < Relay.capacity)
    right.wantRead(!rightEOF && rightToLeft.count < Relay.capacity)
  }

  public func close() {
    guard !closed else { return }
    closed = true
    left.close()
    right.close()
    onClose()
  }
}
