/// IPv4 and MAC addresses, and the CIDR blocks the fence is written in.
public struct IPv4: Hashable, Comparable, Sendable, CustomStringConvertible {
  public var value: UInt32

  public init(_ value: UInt32) { self.value = value }

  public init(_ a: UInt8, _ b: UInt8, _ c: UInt8, _ d: UInt8) {
    value = UInt32(a) << 24 | UInt32(b) << 16 | UInt32(c) << 8 | UInt32(d)
  }

  /// Strict dotted-quad parsing: four decimal octets, nothing else.
  public init?(_ text: String) {
    let parts = text.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 4 else { return nil }
    var result: UInt32 = 0
    for part in parts {
      guard !part.isEmpty, part.count <= 3, part.allSatisfy({ $0.isASCII && $0.isNumber }),
        let octet = UInt32(part), octet <= 255
      else { return nil }
      result = result << 8 | octet
    }
    value = result
  }

  init(bytes: [UInt8], at offset: Int) {
    value = UInt32(bytes[offset]) << 24 | UInt32(bytes[offset + 1]) << 16
      | UInt32(bytes[offset + 2]) << 8 | UInt32(bytes[offset + 3])
  }

  public var bytes: [UInt8] {
    [UInt8(value >> 24 & 0xff), UInt8(value >> 16 & 0xff), UInt8(value >> 8 & 0xff), UInt8(value & 0xff)]
  }

  public var description: String { bytes.map(String.init).joined(separator: ".") }

  public static let zero = IPv4(0)
  public static let broadcast = IPv4(0xffff_ffff)

  public static func < (lhs: IPv4, rhs: IPv4) -> Bool { lhs.value < rhs.value }
}

public struct CIDR: Hashable, Sendable, CustomStringConvertible {
  public let base: IPv4
  public let prefix: Int

  public init(_ base: IPv4, _ prefix: Int) {
    precondition((0...32).contains(prefix), "prefix out of range")
    self.prefix = prefix
    self.base = IPv4(base.value & CIDR.mask(prefix))
  }

  public init?(_ text: String) {
    let parts = text.split(separator: "/")
    guard parts.count == 2, let base = IPv4(String(parts[0])), let prefix = Int(parts[1]),
      (0...32).contains(prefix)
    else { return nil }
    self.init(base, prefix)
  }

  public var mask: UInt32 { CIDR.mask(prefix) }

  public func contains(_ address: IPv4) -> Bool {
    address.value & mask == base.value
  }

  public var description: String { "\(base)/\(prefix)" }

  static func mask(_ prefix: Int) -> UInt32 {
    prefix == 0 ? 0 : UInt32.max << UInt32(32 - prefix)
  }
}

public struct MAC: Hashable, Sendable, CustomStringConvertible {
  public let bytes: [UInt8]

  public init(_ bytes: [UInt8]) {
    precondition(bytes.count == 6, "a MAC address is six bytes")
    self.bytes = bytes
  }

  public init?(_ text: String) {
    let parts = text.split(separator: ":")
    guard parts.count == 6 else { return nil }
    var bytes: [UInt8] = []
    for part in parts {
      guard part.count == 2, let byte = UInt8(part, radix: 16) else { return nil }
      bytes.append(byte)
    }
    self.bytes = bytes
  }

  public var description: String {
    bytes.map { byte in
      let hex = String(byte, radix: 16)
      return hex.count == 1 ? "0" + hex : hex
    }.joined(separator: ":")
  }

  public static let broadcast = MAC([0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
  /// The gateway's address on the virtual link. Locally administered and
  /// constant, because a restored guest keeps it in its ARP cache.
  public static let gateway = MAC([0x5a, 0x94, 0xef, 0xe4, 0x0c, 0xdd])

  public var isBroadcast: Bool { self == .broadcast }
  public var isMulticast: Bool { bytes[0] & 1 == 1 }
}
