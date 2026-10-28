import DeskNet
import Foundation
import Virtualization

/// Everything `boot` needs, validated before anything is created.
struct BootRequest {
  let kernel: URL
  let initrd: URL?
  let cmdline: String
  let disk: URL
  let memoryMb: Int
  let vcpus: Int
  let vsockSocket: String
  let portSocket: String?
  let restoreFrom: URL?
  let machineIdentifier: Data?
  let consoleLog: URL?
  let network: NetworkConfiguration

  init(_ body: [String: Any]) throws {
    kernel = URL(fileURLWithPath: try body.path("kernel"))
    initrd = try body.optionalPath("initrd").map { URL(fileURLWithPath: $0) }
    cmdline = (body["cmdline"] as? String) ?? ""
    disk = URL(fileURLWithPath: try body.path("disk"))
    memoryMb = try body.positiveInteger("memoryMb")
    vcpus = try body.positiveInteger("vcpus")
    vsockSocket = try body.path("vsockSocket")
    portSocket = try body.optionalPath("portSocket")
    restoreFrom = try body.optionalPath("restoreFrom").map { URL(fileURLWithPath: $0) }
    if let encoded = try body.optionalString("machineIdentifier") {
      guard let data = Data(base64Encoded: encoded) else {
        throw RequestError("machineIdentifier must be base64.")
      }
      machineIdentifier = data
    } else {
      machineIdentifier = nil
    }
    consoleLog = try body.optionalPath("consoleLog").map { URL(fileURLWithPath: $0) }
    if restoreFrom != nil && machineIdentifier == nil {
      throw RequestError("restoreFrom requires the machineIdentifier the machine was saved with.")
    }

    let network = (body["network"] as? [String: Any]) ?? [:]
    var configuration = NetworkConfiguration(allowLan: try network.bool("allowLan", default: false))
    if let text = try network.optionalString("macAddress") {
      guard let mac = MAC(text), !mac.isMulticast else { throw RequestError("network.macAddress is not a unicast MAC address.") }
      configuration.guestMAC = mac
    }
    if let text = try network.optionalString("guestAddress") {
      guard let address = IPv4(text) else { throw RequestError("network.guestAddress is not an IPv4 address.") }
      configuration.guestAddress = address
    }
    if let text = try network.optionalString("gatewayAddress") {
      guard let address = IPv4(text) else { throw RequestError("network.gatewayAddress is not an IPv4 address.") }
      configuration.gatewayAddress = address
    }
    if network["prefixLength"] != nil {
      let prefix = try network.positiveInteger("prefixLength")
      guard (8...30).contains(prefix) else { throw RequestError("network.prefixLength must be between 8 and 30.") }
      configuration.prefixLength = prefix
    }
    if let list = network["dns"] {
      guard let entries = list as? [String], !entries.isEmpty, entries.count <= 3 else {
        throw RequestError("network.dns must list one to three IPv4 resolvers.")
      }
      configuration.dns = try entries.map { entry in
        guard let address = IPv4(entry) else { throw RequestError("network.dns entry \(entry) is not an IPv4 address.") }
        return address
      }
    }
    let subnet = CIDR(configuration.gatewayAddress, configuration.prefixLength)
    guard subnet.contains(configuration.guestAddress), configuration.guestAddress != configuration.gatewayAddress else {
      throw RequestError("network.guestAddress must be a different address in the gateway's subnet.")
    }
    self.network = configuration
  }
}

/// One helper process runs one VM. It owns the VM, the guest's network, and
/// the two Unix sockets the host reaches the guest through.
@MainActor
final class Helper: NSObject, VZVirtualMachineDelegate {
  private let control: ControlChannel
  private var machine: VZVirtualMachine?
  private var stack: NetworkStack?
  private var link: DatagramLink?
  private var vsockListener: HandshakeListener?
  private var portListener: HandshakeListener?
  private var relays: [ObjectIdentifier: Relay] = [:]
  private var stateObservation: NSKeyValueObservation?
  private var guestAddress: String?
  private var machineIdentifier: Data?
  private var booting = false
  private var exiting = false

  init(control: ControlChannel) {
    self.control = control
    super.init()
  }

  func handle(id: String, op: String, body: [String: Any]) {
    switch op {
    case "boot": boot(id, body)
    case "pause": pause(id)
    case "resume": resume(id)
    case "save": save(id, body)
    case "stop": stop(id)
    case "status": control.respond(id, result: status())
    default: control.respond(id, error: "Unknown op \(op).")
    }
  }

  // MARK: Requests

  private func boot(_ id: String, _ body: [String: Any]) {
    guard machine == nil, !booting else {
      return control.respond(id, error: "This helper has already booted a machine; one helper runs one VM.")
    }
    let request: BootRequest
    let configuration: VZVirtualMachineConfiguration
    do {
      request = try BootRequest(body)
      configuration = try makeConfiguration(request)
      try configuration.validate()
      if request.restoreFrom != nil { try configuration.validateSaveRestoreSupport() }
    } catch {
      return control.respond(id, error: describe(error))
    }
    booting = true
    let vm = VZVirtualMachine(configuration: configuration, queue: .main)
    vm.delegate = self
    machine = vm
    stateObservation = vm.observe(\.state, options: [.new]) { [weak self] _, _ in
      Task { @MainActor [weak self] in
        guard let self, let state = self.machine?.state else { return }
        self.control.emit("state", ["state": Self.name(state)])
      }
    }
    do {
      try startListeners(request, vm: vm)
    } catch {
      teardown()
      machine = nil
      booting = false
      return control.respond(id, error: describe(error))
    }
    let finish: @MainActor (Error?) -> Void = { [weak self] error in
      guard let self else { return }
      self.booting = false
      if let error {
        self.teardown()
        self.machine = nil
        self.control.respond(id, error: self.describe(error))
        return
      }
      var result = self.status()
      result["saveRestore"] = (try? configuration.validateSaveRestoreSupport()) != nil
      self.control.respond(id, result: result)
    }
    if let restoreFrom = request.restoreFrom {
      // Restored PAUSED: the host destroys the snapshot it came from, then
      // sends `resume`. Until then the guest cannot write to its disk.
      vm.restoreMachineStateFrom(url: restoreFrom) { error in
        Task { @MainActor in finish(error) }
      }
    } else {
      vm.start { result in
        Task { @MainActor in
          switch result {
          case .success: finish(nil)
          case .failure(let error): finish(error)
          }
        }
      }
    }
  }

  private func pause(_ id: String) {
    guard let vm = machine, vm.canPause else { return control.respond(id, error: notNow("paused")) }
    vm.pause { [weak self] result in
      Task { @MainActor in self?.answer(id, result) }
    }
  }

  private func resume(_ id: String) {
    guard let vm = machine, vm.canResume else { return control.respond(id, error: notNow("resumed")) }
    vm.resume { [weak self] result in
      Task { @MainActor in self?.answer(id, result) }
    }
  }

  /// Pause if running, then write the machine's memory and device state to
  /// `path`. The VM is left paused; the host stops it next.
  private func save(_ id: String, _ body: [String: Any]) {
    let path: String
    do {
      path = try body.path("path")
    } catch {
      return control.respond(id, error: describe(error))
    }
    guard let vm = machine else { return control.respond(id, error: notNow("saved")) }
    let url = URL(fileURLWithPath: path)
    let write: @MainActor () -> Void = { [weak self] in
      vm.saveMachineStateTo(url: url) { error in
        Task { @MainActor in
          guard let self else { return }
          if let error { return self.control.respond(id, error: self.describe(error)) }
          var result = self.status()
          result["path"] = path
          self.control.respond(id, result: result)
        }
      }
    }
    switch vm.state {
    case .paused:
      write()
    case .running:
      vm.pause { [weak self] result in
        Task { @MainActor in
          guard let self else { return }
          if case .failure(let error) = result { return self.control.respond(id, error: self.describe(error)) }
          write()
        }
      }
    default:
      control.respond(id, error: notNow("saved"))
    }
  }

  /// Hard stop, like pulling the power: the host has synced the guest first.
  /// The helper exits once the response is written.
  func stop(_ id: String?) {
    guard let vm = machine, vm.state != .stopped, vm.state != .error else {
      if let id { control.respond(id, result: ["state": "stopped"]) }
      return exit(code: 0)
    }
    let done: @MainActor (Error?) -> Void = { [weak self] error in
      guard let self else { return }
      if let id {
        if let error {
          self.control.respond(id, error: self.describe(error))
        } else {
          self.control.respond(id, result: ["state": "stopped"])
        }
      }
      self.exit(code: error == nil ? 0 : 1)
    }
    if vm.canStop {
      vm.stop { error in Task { @MainActor in done(error) } }
    } else {
      // Mid-transition (starting, saving, restoring): nothing to stop cleanly.
      // Exiting the process ends the VM with it.
      done(nil)
    }
  }

  private func status() -> [String: Any] {
    var result: [String: Any] = ["state": machine.map { Self.name($0.state) } ?? "stopped"]
    if let stack {
      result["guestAddress"] = stack.configuration.guestAddress.description
      result["gatewayAddress"] = stack.configuration.gatewayAddress.description
    }
    result["guestAddressSeen"] = guestAddress != nil
    if let machineIdentifier { result["machineIdentifier"] = machineIdentifier.base64EncodedString() }
    return result
  }

  private func answer(_ id: String, _ result: Result<Void, Error>) {
    switch result {
    case .success: control.respond(id, result: status())
    case .failure(let error): control.respond(id, error: describe(error))
    }
  }

  private func notNow(_ verb: String) -> String {
    let state = machine.map { Self.name($0.state) } ?? "not booted"
    return "The machine cannot be \(verb) while it is \(state)."
  }

  // MARK: Configuration

  private func makeConfiguration(_ request: BootRequest) throws -> VZVirtualMachineConfiguration {
    let configuration = VZVirtualMachineConfiguration()
    let loader = VZLinuxBootLoader(kernelURL: request.kernel)
    loader.initialRamdiskURL = request.initrd
    loader.commandLine = request.cmdline
    configuration.bootLoader = loader

    // A restored machine must be the same machine: the identifier is part of
    // what the saved state is checked against.
    let platform = VZGenericPlatformConfiguration()
    if let data = request.machineIdentifier {
      guard let identifier = VZGenericMachineIdentifier(dataRepresentation: data) else {
        throw RequestError("machineIdentifier is not a valid machine identifier.")
      }
      platform.machineIdentifier = identifier
    }
    machineIdentifier = platform.machineIdentifier.dataRepresentation
    configuration.platform = platform

    let minimumCPUs = VZVirtualMachineConfiguration.minimumAllowedCPUCount
    let maximumCPUs = VZVirtualMachineConfiguration.maximumAllowedCPUCount
    guard (minimumCPUs...maximumCPUs).contains(request.vcpus) else {
      throw RequestError("vcpus must be between \(minimumCPUs) and \(maximumCPUs) on this Mac.")
    }
    configuration.cpuCount = request.vcpus
    let memory = UInt64(request.memoryMb) * 1024 * 1024
    let minimumMemory = VZVirtualMachineConfiguration.minimumAllowedMemorySize
    let maximumMemory = VZVirtualMachineConfiguration.maximumAllowedMemorySize
    guard memory >= minimumMemory, memory <= maximumMemory else {
      throw RequestError(
        "memoryMb must be between \(minimumMemory / 1_048_576) and \(maximumMemory / 1_048_576) on this Mac.")
    }
    configuration.memorySize = memory

    let disk = try VZDiskImageStorageDeviceAttachment(
      url: request.disk, readOnly: false, cachingMode: .automatic, synchronizationMode: .full)
    configuration.storageDevices = [VZVirtioBlockDeviceConfiguration(attachment: disk)]

    let (helperEnd, vmEnd) = try DatagramLink.makePair()
    let nic = VZVirtioNetworkDeviceConfiguration()
    nic.attachment = VZFileHandleNetworkDeviceAttachment(
      fileHandle: FileHandle(fileDescriptor: vmEnd, closeOnDealloc: true))
    if let mac = request.network.guestMAC {
      guard let address = VZMACAddress(string: mac.description) else {
        throw RequestError("network.macAddress is not a valid MAC address.")
      }
      nic.macAddress = address
    }
    configuration.networkDevices = [nic]
    var network = request.network
    network.guestMAC = MAC(nic.macAddress.string) ?? network.guestMAC
    attachNetwork(network, fd: helperEnd)

    configuration.entropyDevices = [VZVirtioEntropyDeviceConfiguration()]
    configuration.memoryBalloonDevices = [VZVirtioTraditionalMemoryBalloonDeviceConfiguration()]
    configuration.socketDevices = [VZVirtioSocketDeviceConfiguration()]

    // Linux guests commonly use hvc0 as their primary console. Keep the
    // device present even when its output is discarded.
    let console = VZVirtioConsoleDeviceSerialPortConfiguration()
    if let consoleLog = request.consoleLog {
      console.attachment = try VZFileSerialPortAttachment(url: consoleLog, append: true)
    } else {
      console.attachment = VZFileHandleSerialPortAttachment(
        fileHandleForReading: nil, fileHandleForWriting: try FileHandle(forWritingTo: URL(fileURLWithPath: "/dev/null")))
    }
    configuration.serialPorts = [console]
    return configuration
  }

  private func attachNetwork(_ configuration: NetworkConfiguration, fd: Int32) {
    let link = DatagramLink(fd: fd)
    let stack = NetworkStack(configuration: configuration) { [weak link] frame in link?.send(frame) }
    link.onFrame = { [weak stack] frame in stack?.receiveFrame(frame) }
    stack.onGuestAddress = { [weak self] address in
      guard let self, self.guestAddress == nil else { return }
      self.guestAddress = address.description
      self.control.emit("guest-ip", ["address": address.description])
    }
    self.link = link
    self.stack = stack
  }

  // MARK: Sockets the host reaches the guest through

  private func startListeners(_ request: BootRequest, vm: VZVirtualMachine) throws {
    vsockListener = try HandshakeListener(path: request.vsockSocket) { [weak self] client, port, early in
      self?.bridgeVsock(client: client, port: port, early: early)
    }
    if let portSocket = request.portSocket {
      portListener = try HandshakeListener(path: portSocket) { [weak self] client, port, early in
        guard let self, let stack = self.stack, port >= 1, port <= 65_535 else {
          Darwin.close(client)
          return
        }
        stack.connectToGuest(port: UInt16(port), clientFD: client, early: early)
      }
    }
  }

  /// Connect to a guest vsock port and join it to the client. A refused port
  /// closes the client with nothing written, which is how Cloud Hypervisor's
  /// hybrid vsock presents one; the host retries on that.
  private func bridgeVsock(client: Int32, port: UInt32, early: [UInt8]) {
    guard let vm = machine, vm.state == .running,
      let device = vm.socketDevices.first as? VZVirtioSocketDevice
    else {
      Darwin.close(client)
      return
    }
    device.connect(toPort: port) { [weak self] result in
      Task { @MainActor in
        guard let self else {
          Darwin.close(client)
          return
        }
        switch result {
        case .failure(let error):
          log("vsock connect to port \(port) failed: \(error.localizedDescription)")
          Darwin.close(client)
        case .success(let connection):
          // Own a duplicate of the connection's descriptor so the relay's
          // lifetime, not the connection object's, decides when it closes.
          let guestFD = dup(connection.fileDescriptor)
          guard guestFD >= 0 else {
            connection.close()
            Darwin.close(client)
            return
          }
          let banner = Array("OK \(connection.sourcePort)\n".utf8)
          let written = banner.withUnsafeBytes { Darwin.write(client, $0.baseAddress, banner.count) }
          guard written == banner.count else {
            connection.close()
            Darwin.close(client)
            Darwin.close(guestFD)
            return
          }
          var key: ObjectIdentifier?
          let relay = Relay(left: client, right: guestFD, early: early) { [weak self] in
            connection.close()
            if let key { self?.relays.removeValue(forKey: key) }
          }
          key = ObjectIdentifier(relay)
          self.relays[ObjectIdentifier(relay)] = relay
        }
      }
    }
  }

  // MARK: Delegate

  nonisolated func guestDidStop(_ virtualMachine: VZVirtualMachine) {
    Task { @MainActor in
      control.emit("state", ["state": "stopped", "reason": "guest"])
      exit(code: 0)
    }
  }

  nonisolated func virtualMachine(_ virtualMachine: VZVirtualMachine, didStopWithError error: Error) {
    Task { @MainActor in
      control.emit("state", ["state": "error", "error": describe(error)])
      exit(code: 1)
    }
  }

  nonisolated func virtualMachine(
    _ virtualMachine: VZVirtualMachine, networkDevice: VZNetworkDevice,
    attachmentWasDisconnectedWithError error: Error
  ) {
    Task { @MainActor in
      control.emit("network-disconnected", ["error": describe(error)])
    }
  }

  // MARK: Exit

  private func teardown() {
    for relay in Array(relays.values) { relay.close() }
    relays.removeAll()
    vsockListener?.close()
    vsockListener = nil
    portListener?.close()
    portListener = nil
    stack?.shutdown()
    link?.close()
    stateObservation?.invalidate()
    stateObservation = nil
  }

  func exit(code: Int32) {
    guard !exiting else { return }
    exiting = true
    teardown()
    Foundation.exit(code)
  }

  func describe(_ error: Error) -> String {
    if let error = error as? RequestError { return error.description }
    if let error = error as? POSIXFailure { return error.description }
    let ns = error as NSError
    var text = ns.localizedDescription
    if let reason = ns.localizedFailureReason, !text.contains(reason) { text += " \(reason)" }
    if let underlying = ns.userInfo[NSUnderlyingErrorKey] as? NSError {
      text += " (\(underlying.domain) \(underlying.code): \(underlying.localizedDescription))"
    }
    return "\(text) [\(ns.domain) \(ns.code)]"
  }

  static func name(_ state: VZVirtualMachine.State) -> String {
    switch state {
    case .stopped: "stopped"
    case .running: "running"
    case .paused: "paused"
    case .error: "error"
    case .starting: "starting"
    case .pausing: "pausing"
    case .resuming: "resuming"
    case .stopping: "stopping"
    case .saving: "saving"
    case .restoring: "restoring"
    @unknown default: "unknown"
    }
  }
}
