import Darwin
import Dispatch

public struct POSIXFailure: Error, CustomStringConvertible, Sendable {
  public let call: String
  public let code: Int32

  public init(_ call: String, _ code: Int32 = errno) {
    self.call = call
    self.code = code
  }

  public var description: String { "\(call): \(String(cString: strerror(code)))" }
}

public enum Socket {
  public static func setNonBlocking(_ fd: Int32) {
    let flags = fcntl(fd, F_GETFL)
    _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
  }

  /// Writes to a peer that has gone return EPIPE instead of killing the helper.
  public static func setNoSigPipe(_ fd: Int32) {
    var one: Int32 = 1
    _ = setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
  }

  public static func setInt(_ fd: Int32, _ level: Int32, _ name: Int32, _ value: Int32) {
    var value = value
    _ = setsockopt(fd, level, name, &value, socklen_t(MemoryLayout<Int32>.size))
  }

  /// Close so the peer sees a reset rather than an orderly end of stream.
  public static func abort(_ fd: Int32) {
    var linger = Darwin.linger(l_onoff: 1, l_linger: 0)
    _ = setsockopt(fd, SOL_SOCKET, SO_LINGER, &linger, socklen_t(MemoryLayout<Darwin.linger>.size))
  }

  public static func address(_ ip: IPv4, _ port: UInt16) -> sockaddr_in {
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = port.bigEndian
    address.sin_addr = in_addr(s_addr: ip.value.bigEndian)
    return address
  }

  /// Start a non-blocking connect. The descriptor becomes writable when it
  /// settles; `pendingError` then says how.
  public static func connect(_ fd: Int32, to ip: IPv4, port: UInt16) throws {
    var address = address(ip, port)
    let result = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    if result != 0 && errno != EINPROGRESS { throw POSIXFailure("connect") }
  }

  public static func pendingError(_ fd: Int32) -> Int32 {
    var error: Int32 = 0
    var length = socklen_t(MemoryLayout<Int32>.size)
    if getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &length) != 0 { return errno }
    return error
  }

  /// Every IPv4 address configured on any of the Mac's interfaces.
  public static func hostAddresses() -> Set<IPv4> {
    var result: Set<IPv4> = []
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0, let first = list else { return result }
    defer { freeifaddrs(list) }
    var cursor: UnsafeMutablePointer<ifaddrs>? = first
    while let entry = cursor {
      if let address = entry.pointee.ifa_addr, address.pointee.sa_family == sa_family_t(AF_INET) {
        let ip = address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) {
          IPv4(UInt32(bigEndian: $0.pointee.sin_addr.s_addr))
        }
        result.insert(ip)
      }
      cursor = entry.pointee.ifa_next
    }
    return result
  }

  /// Read whatever is available, up to `limit` bytes. `nil` means try later;
  /// an empty array means end of stream.
  public static func readAvailable(_ fd: Int32, limit: Int) throws -> [UInt8]? {
    var buffer = [UInt8](repeating: 0, count: limit)
    let count = buffer.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress, limit) }
    if count > 0 { return Array(buffer[0..<count]) }
    if count == 0 { return [] }
    if errno == EAGAIN || errno == EINTR { return nil }
    throw POSIXFailure("read")
  }

  /// Write as much of `bytes` as the descriptor takes now; returns the count.
  public static func writeSome(_ fd: Int32, _ bytes: [UInt8]) throws -> Int {
    if bytes.isEmpty { return 0 }
    let count = bytes.withUnsafeBytes { Darwin.write(fd, $0.baseAddress, bytes.count) }
    if count >= 0 { return count }
    if errno == EAGAIN || errno == EINTR { return 0 }
    throw POSIXFailure("write")
  }
}

/// Read and write readiness for one descriptor, delivered on the main queue.
///
/// Dispatch sources are created suspended and must be resumed before they are
/// cancelled or released, and the descriptor must outlive both. This owns all
/// of that: interest is toggled with `wantRead`/`wantWrite`, and `close()`
/// cancels both sources and closes the descriptor once both have let go of it.
@MainActor
public final class FDWatcher {
  public let fd: Int32
  public var onReadable: (() -> Void)?
  public var onWritable: (() -> Void)?
  private let readSource: DispatchSourceRead
  private let writeSource: DispatchSourceWrite
  private var reading = false
  private var writing = false
  private var closed = false

  public init(fd: Int32) {
    self.fd = fd
    readSource = DispatchSource.makeReadSource(fileDescriptor: fd, queue: .main)
    writeSource = DispatchSource.makeWriteSource(fileDescriptor: fd, queue: .main)
    readSource.setEventHandler { @Sendable [weak self] in
      Task { @MainActor in self?.onReadable?() }
    }
    writeSource.setEventHandler { @Sendable [weak self] in
      Task { @MainActor in self?.onWritable?() }
    }
    // Close the descriptor only after both sources have been cancelled, so
    // neither can be watching a number the kernel has handed to someone else.
    let group = DispatchGroup()
    group.enter()
    group.enter()
    readSource.setCancelHandler { @Sendable in group.leave() }
    writeSource.setCancelHandler { @Sendable in group.leave() }
    group.notify(queue: .main) { @Sendable in Darwin.close(fd) }
  }

  public func wantRead(_ wanted: Bool) {
    guard !closed, wanted != reading else { return }
    reading = wanted
    if wanted { readSource.resume() } else { readSource.suspend() }
  }

  public func wantWrite(_ wanted: Bool) {
    guard !closed, wanted != writing else { return }
    writing = wanted
    if wanted { writeSource.resume() } else { writeSource.suspend() }
  }

  public var isClosed: Bool { closed }

  public func close() {
    guard !closed else { return }
    closed = true
    onReadable = nil
    onWritable = nil
    if !reading { readSource.resume() }
    if !writing { writeSource.resume() }
    readSource.cancel()
    writeSource.cancel()
  }
}

/// How the network reaches the outside world. Production uses real sockets;
/// tests substitute socket pairs so a flow can be driven end to end in memory.
public protocol Dialer {
  /// A non-blocking TCP socket whose connect to `ip:port` is under way.
  func tcp(to ip: IPv4, port: UInt16) throws -> Int32
  /// A non-blocking UDP socket connected to `ip:port`.
  func udp(to ip: IPv4, port: UInt16) throws -> Int32
  /// A non-blocking ICMP datagram socket, for echo.
  func icmp() throws -> Int32
}

public struct SystemDialer: Dialer {
  public init() {}

  public func tcp(to ip: IPv4, port: UInt16) throws -> Int32 {
    let fd = Darwin.socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
    guard fd >= 0 else { throw POSIXFailure("socket") }
    Socket.setNonBlocking(fd)
    Socket.setNoSigPipe(fd)
    // The guest already coalesces its writes; delaying them again here only
    // adds latency to interactive streams.
    Socket.setInt(fd, IPPROTO_TCP, TCP_NODELAY, 1)
    do {
      try Socket.connect(fd, to: ip, port: port)
    } catch {
      Darwin.close(fd)
      throw error
    }
    return fd
  }

  public func udp(to ip: IPv4, port: UInt16) throws -> Int32 {
    let fd = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
    guard fd >= 0 else { throw POSIXFailure("socket") }
    Socket.setNonBlocking(fd)
    do {
      try Socket.connect(fd, to: ip, port: port)
    } catch {
      Darwin.close(fd)
      throw error
    }
    return fd
  }

  public func icmp() throws -> Int32 {
    // Unprivileged ICMP: macOS allows datagram ICMP sockets for echo.
    let fd = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_ICMP)
    guard fd >= 0 else { throw POSIXFailure("socket") }
    Socket.setNonBlocking(fd)
    return fd
  }
}
