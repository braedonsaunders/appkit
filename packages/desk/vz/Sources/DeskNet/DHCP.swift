/// The smallest DHCP server that hands one guest its one address.
///
/// The link has exactly one client, so there is no pool and no lease table:
/// every DISCOVER is offered the configured guest address and every REQUEST
/// for it is acknowledged. A guest configured statically never asks, and that
/// works too — the server is a convenience, not a gate.
public struct DHCPServer: Sendable {
  public let guest: IPv4
  public let gateway: IPv4
  public let prefixLength: Int
  public let dns: [IPv4]
  public let leaseSeconds: UInt32

  public init(guest: IPv4, gateway: IPv4, prefixLength: Int, dns: [IPv4], leaseSeconds: UInt32 = 86_400) {
    self.guest = guest
    self.gateway = gateway
    self.prefixLength = prefixLength
    self.dns = dns
    self.leaseSeconds = leaseSeconds
  }

  static let magicCookie: [UInt8] = [99, 130, 83, 99]

  enum MessageType: UInt8 {
    case discover = 1, offer, request, decline, ack, nak, release, inform
  }

  public struct Reply: Sendable {
    /// The BOOTP payload to send from the server port to the client port.
    public let payload: [UInt8]
    /// Where the reply goes on the link: the client's hardware address.
    public let clientMAC: MAC
    /// True when the guest was just given (or confirmed in) its address.
    public let assigned: Bool
  }

  /// Answer one client message, or nil when it needs no answer.
  public func respond(to bytes: [UInt8]) -> Reply? {
    guard bytes.count >= 240, bytes[0] == 1, bytes[1] == 1, bytes[2] == 6,
      Array(bytes[236..<240]) == Self.magicCookie
    else { return nil }
    let options = Self.options(bytes)
    guard let typeByte = options[53]?.first, let type = MessageType(rawValue: typeByte) else {
      return nil
    }
    let clientMAC = MAC(Array(bytes[28..<34]))
    let ciaddr = IPv4(bytes: bytes, at: 12)
    switch type {
    case .discover:
      return Reply(payload: reply(to: bytes, type: .offer, yiaddr: guest), clientMAC: clientMAC, assigned: false)
    case .request:
      let requested = options[50].flatMap { $0.count == 4 ? IPv4(bytes: $0, at: 0) : nil } ?? ciaddr
      if requested == guest || requested == .zero {
        return Reply(payload: reply(to: bytes, type: .ack, yiaddr: guest), clientMAC: clientMAC, assigned: true)
      }
      return Reply(payload: reply(to: bytes, type: .nak, yiaddr: .zero), clientMAC: clientMAC, assigned: false)
    case .inform:
      return Reply(payload: reply(to: bytes, type: .ack, yiaddr: .zero, inform: true), clientMAC: clientMAC, assigned: false)
    case .offer, .decline, .ack, .nak, .release:
      return nil
    }
  }

  static func options(_ bytes: [UInt8]) -> [UInt8: [UInt8]] {
    var result: [UInt8: [UInt8]] = [:]
    var index = 240
    while index < bytes.count {
      let code = bytes[index]
      if code == 255 { break }
      if code == 0 {
        index += 1
        continue
      }
      guard index + 1 < bytes.count else { break }
      let length = Int(bytes[index + 1])
      guard index + 2 + length <= bytes.count else { break }
      result[code] = Array(bytes[(index + 2)..<(index + 2 + length)])
      index += 2 + length
    }
    return result
  }

  private func reply(to request: [UInt8], type: MessageType, yiaddr: IPv4, inform: Bool = false) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: 240)
    bytes[0] = 2
    bytes[1] = 1
    bytes[2] = 6
    bytes[4..<8] = request[4..<8]  // xid
    bytes[10..<12] = request[10..<12]  // flags
    bytes[12..<16] = request[12..<16]  // ciaddr
    put32(&bytes, 16, yiaddr.value)
    bytes[24..<28] = request[24..<28]  // giaddr
    bytes[28..<44] = request[28..<44]  // chaddr
    bytes[236..<240] = Self.magicCookie[0..<4]
    var options: [UInt8] = [53, 1, type.rawValue, 54, 4] + gateway.bytes
    if type != .nak {
      options += [1, 4] + IPv4(CIDR.mask(prefixLength)).bytes
      options += [3, 4] + gateway.bytes
      if !dns.isEmpty {
        options += [6, UInt8(dns.count * 4)] + dns.flatMap(\.bytes)
      }
      if !inform {
        var lease = [UInt8](repeating: 0, count: 4)
        put32(&lease, 0, leaseSeconds)
        options += [51, 4] + lease
      }
    }
    options.append(255)
    return bytes + options
  }
}
