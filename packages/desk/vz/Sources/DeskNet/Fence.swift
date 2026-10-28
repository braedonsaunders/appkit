/// Where a guest may send traffic.
///
/// The guest reaches the public internet and nothing else by default: not the
/// Mac's LAN, not link-local services (cloud metadata lives at 169.254.169.254),
/// not carrier-grade NAT space (where Tailscale and similar overlays put their
/// peers), and not the Mac itself on any of its addresses. `allowLan` lifts
/// that, for a computer the owner has explicitly let onto their network.
///
/// Some destinations are never meaningful through a NAT whatever the setting:
/// "this network", loopback (the guest's own loopback never leaves the guest,
/// so a packet for 127/8 arriving here is spoofed or broken), multicast, and
/// the reserved, documentation and broadcast space.
public struct EgressFence: Sendable {
  public var allowLan: Bool

  public init(allowLan: Bool) { self.allowLan = allowLan }

  public static let alwaysDenied: [CIDR] = [
    CIDR(IPv4(0, 0, 0, 0), 8),
    CIDR(IPv4(127, 0, 0, 0), 8),
    CIDR(IPv4(192, 0, 2, 0), 24),
    CIDR(IPv4(198, 51, 100, 0), 24),
    CIDR(IPv4(203, 0, 113, 0), 24),
    CIDR(IPv4(224, 0, 0, 0), 4),
    CIDR(IPv4(240, 0, 0, 0), 4),
  ]

  /// Private, link-local, shared and special-purpose space a guest is fenced
  /// out of unless the LAN is allowed.
  public static let localRanges: [CIDR] = [
    CIDR(IPv4(10, 0, 0, 0), 8),
    CIDR(IPv4(172, 16, 0, 0), 12),
    CIDR(IPv4(192, 168, 0, 0), 16),
    CIDR(IPv4(169, 254, 0, 0), 16),
    CIDR(IPv4(100, 64, 0, 0), 10),
    CIDR(IPv4(192, 0, 0, 0), 24),
    CIDR(IPv4(198, 18, 0, 0), 15),
  ]

  public enum Verdict: Equatable, Sendable {
    case allowed
    /// Never routable through the NAT.
    case invalid
    /// Fenced off: local network space or the Mac itself.
    case fenced
  }

  /// Judge a destination. `hostAddresses` are the Mac's own IPv4 addresses on
  /// every interface, which are fenced even when public.
  public func verdict(for destination: IPv4, hostAddresses: Set<IPv4>) -> Verdict {
    if Self.alwaysDenied.contains(where: { $0.contains(destination) }) { return .invalid }
    if allowLan { return .allowed }
    if Self.localRanges.contains(where: { $0.contains(destination) }) { return .fenced }
    if hostAddresses.contains(destination) { return .fenced }
    return .allowed
  }
}
