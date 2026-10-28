// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "appkit-desk-vz",
  platforms: [.macOS(.v14)],
  products: [
    .executable(name: "appkit-desk-vz", targets: ["appkit-desk-vz"]),
  ],
  targets: [
    // The userspace network: Ethernet in, host sockets out, and the fence in
    // between. No Virtualization.framework dependency, so it is unit-tested on
    // its own against an in-memory guest.
    .target(name: "DeskNet"),
    .executableTarget(
      name: "appkit-desk-vz",
      dependencies: ["DeskNet"],
      linkerSettings: [.linkedFramework("Virtualization")]
    ),
    .testTarget(name: "DeskNetTests", dependencies: ["DeskNet"]),
  ],
  swiftLanguageModes: [.v6]
)
