/// Encoding and decoding of the frames that cross the virtual link: Ethernet,
/// ARP, IPv4, TCP, UDP and ICMP. Everything here is pure and works on byte
/// arrays, so it is tested without a guest.

public enum EtherType {
  public static let ipv4: UInt16 = 0x0800
  public static let arp: UInt16 = 0x0806
}

public enum IPProtocol {
  public static let icmp: UInt8 = 1
  public static let tcp: UInt8 = 6
  public static let udp: UInt8 = 17
}

@inline(__always) func be16(_ bytes: [UInt8], _ offset: Int) -> UInt16 {
  UInt16(bytes[offset]) << 8 | UInt16(bytes[offset + 1])
}

@inline(__always) func be32(_ bytes: [UInt8], _ offset: Int) -> UInt32 {
  UInt32(bytes[offset]) << 24 | UInt32(bytes[offset + 1]) << 16 | UInt32(bytes[offset + 2]) << 8
    | UInt32(bytes[offset + 3])
}

@inline(__always) func put16(_ bytes: inout [UInt8], _ offset: Int, _ value: UInt16) {
  bytes[offset] = UInt8(value >> 8)
  bytes[offset + 1] = UInt8(value & 0xff)
}

@inline(__always) func put32(_ bytes: inout [UInt8], _ offset: Int, _ value: UInt32) {
  bytes[offset] = UInt8(value >> 24)
  bytes[offset + 1] = UInt8(value >> 16 & 0xff)
  bytes[offset + 2] = UInt8(value >> 8 & 0xff)
  bytes[offset + 3] = UInt8(value & 0xff)
}

/// The Internet checksum (RFC 1071) over `bytes`, folded and complemented.
public func internetChecksum(_ bytes: [UInt8], initial: UInt32 = 0) -> UInt16 {
  var sum = initial
  var index = 0
  let count = bytes.count
  while index + 1 < count {
    sum &+= UInt32(bytes[index]) << 8 | UInt32(bytes[index + 1])
    index += 2
  }
  if index < count { sum &+= UInt32(bytes[index]) << 8 }
  while sum >> 16 != 0 { sum = (sum & 0xffff) &+ (sum >> 16) }
  return ~UInt16(sum & 0xffff)
}

func pseudoHeaderSum(source: IPv4, destination: IPv4, protocol proto: UInt8, length: Int) -> UInt32 {
  var sum: UInt32 = 0
  sum &+= source.value >> 16
  sum &+= source.value & 0xffff
  sum &+= destination.value >> 16
  sum &+= destination.value & 0xffff
  sum &+= UInt32(proto)
  sum &+= UInt32(length)
  return sum
}

// MARK: - Ethernet

public struct EthernetFrame: Sendable {
  public var destination: MAC
  public var source: MAC
  public var type: UInt16
  public var payload: [UInt8]

  public init(destination: MAC, source: MAC, type: UInt16, payload: [UInt8]) {
    self.destination = destination
    self.source = source
    self.type = type
    self.payload = payload
  }

  public init?(parsing bytes: [UInt8]) {
    guard bytes.count >= 14 else { return nil }
    destination = MAC(Array(bytes[0..<6]))
    source = MAC(Array(bytes[6..<12]))
    type = be16(bytes, 12)
    payload = Array(bytes[14...])
  }

  public var encoded: [UInt8] {
    var bytes = destination.bytes + source.bytes + [0, 0]
    put16(&bytes, 12, type)
    return bytes + payload
  }
}

// MARK: - ARP

public struct ARPPacket: Sendable, Equatable {
  public static let request: UInt16 = 1
  public static let reply: UInt16 = 2

  public var operation: UInt16
  public var senderMAC: MAC
  public var senderIP: IPv4
  public var targetMAC: MAC
  public var targetIP: IPv4

  public init(operation: UInt16, senderMAC: MAC, senderIP: IPv4, targetMAC: MAC, targetIP: IPv4) {
    self.operation = operation
    self.senderMAC = senderMAC
    self.senderIP = senderIP
    self.targetMAC = targetMAC
    self.targetIP = targetIP
  }

  public init?(parsing bytes: [UInt8]) {
    // Ethernet hardware (1), IPv4 protocol, 6-byte MACs, 4-byte addresses.
    guard bytes.count >= 28, be16(bytes, 0) == 1, be16(bytes, 2) == EtherType.ipv4,
      bytes[4] == 6, bytes[5] == 4
    else { return nil }
    operation = be16(bytes, 6)
    senderMAC = MAC(Array(bytes[8..<14]))
    senderIP = IPv4(bytes: bytes, at: 14)
    targetMAC = MAC(Array(bytes[18..<24]))
    targetIP = IPv4(bytes: bytes, at: 24)
  }

  public var encoded: [UInt8] {
    var bytes: [UInt8] = [0, 1, 0x08, 0x00, 6, 4, 0, 0]
    put16(&bytes, 6, operation)
    return bytes + senderMAC.bytes + senderIP.bytes + targetMAC.bytes + targetIP.bytes
  }
}

// MARK: - IPv4

public struct IPv4Packet: Sendable {
  public var source: IPv4
  public var destination: IPv4
  public var proto: UInt8
  public var ttl: UInt8
  public var identification: UInt16
  /// True when this is any piece of a fragmented datagram.
  public var isFragment: Bool
  /// The header exactly as received, for quoting in ICMP errors.
  public var header: [UInt8]
  public var payload: [UInt8]

  public init?(parsing bytes: [UInt8]) {
    guard bytes.count >= 20, bytes[0] >> 4 == 4 else { return nil }
    let headerLength = Int(bytes[0] & 0x0f) * 4
    let totalLength = Int(be16(bytes, 2))
    guard headerLength >= 20, totalLength >= headerLength, bytes.count >= totalLength else {
      return nil
    }
    let flagsAndOffset = be16(bytes, 6)
    isFragment = flagsAndOffset & 0x2000 != 0 || flagsAndOffset & 0x1fff != 0
    identification = be16(bytes, 4)
    ttl = bytes[8]
    proto = bytes[9]
    source = IPv4(bytes: bytes, at: 12)
    destination = IPv4(bytes: bytes, at: 16)
    header = Array(bytes[0..<headerLength])
    payload = Array(bytes[headerLength..<totalLength])
  }

  /// Build a datagram with a correct header checksum and Don't Fragment set.
  public static func encode(
    source: IPv4, destination: IPv4, proto: UInt8, payload: [UInt8], identification: UInt16 = 0,
    ttl: UInt8 = 64
  ) -> [UInt8] {
    var header = [UInt8](repeating: 0, count: 20)
    header[0] = 0x45
    put16(&header, 2, UInt16(20 + payload.count))
    put16(&header, 4, identification)
    put16(&header, 6, 0x4000)
    header[8] = ttl
    header[9] = proto
    put32(&header, 12, source.value)
    put32(&header, 16, destination.value)
    put16(&header, 10, internetChecksum(header))
    return header + payload
  }
}

// MARK: - TCP

public struct TCPFlags: OptionSet, Sendable, Hashable {
  public let rawValue: UInt8
  public init(rawValue: UInt8) { self.rawValue = rawValue }
  public static let fin = TCPFlags(rawValue: 0x01)
  public static let syn = TCPFlags(rawValue: 0x02)
  public static let rst = TCPFlags(rawValue: 0x04)
  public static let psh = TCPFlags(rawValue: 0x08)
  public static let ack = TCPFlags(rawValue: 0x10)
}

public struct TCPSegment: Sendable {
  public var sourcePort: UInt16
  public var destinationPort: UInt16
  public var sequence: UInt32
  public var acknowledgement: UInt32
  public var flags: TCPFlags
  public var window: UInt16
  /// The maximum segment size option, when the segment carries one.
  public var mss: UInt16?
  public var payload: [UInt8]

  public init(
    sourcePort: UInt16, destinationPort: UInt16, sequence: UInt32, acknowledgement: UInt32,
    flags: TCPFlags, window: UInt16, mss: UInt16? = nil, payload: [UInt8] = []
  ) {
    self.sourcePort = sourcePort
    self.destinationPort = destinationPort
    self.sequence = sequence
    self.acknowledgement = acknowledgement
    self.flags = flags
    self.window = window
    self.mss = mss
    self.payload = payload
  }

  public init?(parsing bytes: [UInt8]) {
    guard bytes.count >= 20 else { return nil }
    let dataOffset = Int(bytes[12] >> 4) * 4
    guard dataOffset >= 20, bytes.count >= dataOffset else { return nil }
    sourcePort = be16(bytes, 0)
    destinationPort = be16(bytes, 2)
    sequence = be32(bytes, 4)
    acknowledgement = be32(bytes, 8)
    flags = TCPFlags(rawValue: bytes[13] & 0x1f)
    window = be16(bytes, 14)
    mss = nil
    var index = 20
    while index < dataOffset {
      let kind = bytes[index]
      if kind == 0 { break }
      if kind == 1 {
        index += 1
        continue
      }
      guard index + 1 < dataOffset else { break }
      let length = Int(bytes[index + 1])
      guard length >= 2, index + length <= dataOffset else { break }
      if kind == 2, length == 4 { mss = be16(bytes, index + 2) }
      index += length
    }
    payload = Array(bytes[dataOffset...])
  }

  /// The sequence space this segment occupies: its payload plus SYN and FIN.
  public var sequenceLength: UInt32 {
    UInt32(payload.count) + (flags.contains(.syn) ? 1 : 0) + (flags.contains(.fin) ? 1 : 0)
  }

  public func encoded(source: IPv4, destination: IPv4) -> [UInt8] {
    let optionBytes: [UInt8] = mss.map { [2, 4, UInt8($0 >> 8), UInt8($0 & 0xff)] } ?? []
    let headerLength = 20 + optionBytes.count
    var bytes = [UInt8](repeating: 0, count: 20)
    put16(&bytes, 0, sourcePort)
    put16(&bytes, 2, destinationPort)
    put32(&bytes, 4, sequence)
    put32(&bytes, 8, acknowledgement)
    bytes[12] = UInt8(headerLength / 4) << 4
    bytes[13] = flags.rawValue
    put16(&bytes, 14, window)
    bytes += optionBytes
    bytes += payload
    let sum = pseudoHeaderSum(
      source: source, destination: destination, protocol: IPProtocol.tcp, length: bytes.count)
    put16(&bytes, 16, internetChecksum(bytes, initial: sum))
    return bytes
  }
}

// MARK: - UDP

public struct UDPDatagram: Sendable {
  public var sourcePort: UInt16
  public var destinationPort: UInt16
  public var payload: [UInt8]

  public init(sourcePort: UInt16, destinationPort: UInt16, payload: [UInt8]) {
    self.sourcePort = sourcePort
    self.destinationPort = destinationPort
    self.payload = payload
  }

  public init?(parsing bytes: [UInt8]) {
    guard bytes.count >= 8 else { return nil }
    let length = Int(be16(bytes, 4))
    guard length >= 8, length <= bytes.count else { return nil }
    sourcePort = be16(bytes, 0)
    destinationPort = be16(bytes, 2)
    payload = Array(bytes[8..<length])
  }

  public func encoded(source: IPv4, destination: IPv4) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: 8)
    put16(&bytes, 0, sourcePort)
    put16(&bytes, 2, destinationPort)
    put16(&bytes, 4, UInt16(8 + payload.count))
    bytes += payload
    let sum = pseudoHeaderSum(
      source: source, destination: destination, protocol: IPProtocol.udp, length: bytes.count)
    var checksum = internetChecksum(bytes, initial: sum)
    // A computed zero is sent as all ones; zero means "no checksum" in UDP.
    if checksum == 0 { checksum = 0xffff }
    put16(&bytes, 6, checksum)
    return bytes
  }
}

// MARK: - ICMP

public struct ICMPMessage: Sendable {
  public static let echoReply: UInt8 = 0
  public static let destinationUnreachable: UInt8 = 3
  public static let echoRequest: UInt8 = 8

  /// Destination-unreachable codes the stack sends.
  public static let hostUnreachable: UInt8 = 1
  public static let portUnreachable: UInt8 = 3
  public static let administrativelyProhibited: UInt8 = 13

  public var type: UInt8
  public var code: UInt8
  /// The four bytes after the checksum: identifier and sequence for echo.
  public var rest: UInt32
  public var payload: [UInt8]

  public init(type: UInt8, code: UInt8, rest: UInt32, payload: [UInt8]) {
    self.type = type
    self.code = code
    self.rest = rest
    self.payload = payload
  }

  public init?(parsing bytes: [UInt8]) {
    guard bytes.count >= 8 else { return nil }
    type = bytes[0]
    code = bytes[1]
    rest = be32(bytes, 4)
    payload = Array(bytes[8...])
  }

  public var identifier: UInt16 { UInt16(rest >> 16) }
  public var sequenceNumber: UInt16 { UInt16(rest & 0xffff) }

  public var encoded: [UInt8] {
    var bytes = [UInt8](repeating: 0, count: 8)
    bytes[0] = type
    bytes[1] = code
    put32(&bytes, 4, rest)
    bytes += payload
    put16(&bytes, 2, internetChecksum(bytes))
    return bytes
  }
}
