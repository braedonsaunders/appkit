import Foundation

/// appkit-desk-vz: one Linux microVM under Apple's Virtualization.framework,
/// driven over newline-delimited JSON on stdin and stdout. See README.md.

// A peer that hangs up must surface as EPIPE on that socket, not end the VM.
signal(SIGPIPE, SIG_IGN)

MainActor.assumeIsolated {
  let control = ControlChannel()
  let helper = Helper(control: control)
  control.onRequest = { id, op, body in helper.handle(id: id, op: op, body: body) }
  control.onClose = { helper.stop(nil) }

  // SIGTERM and SIGINT stop the VM before the process goes, exactly as a
  // `stop` request does, so a host that kills the helper never strands a VM.
  var signalSources: [DispatchSourceSignal] = []
  for number in [SIGTERM, SIGINT, SIGHUP] {
    signal(number, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
    source.setEventHandler { @Sendable in Task { @MainActor in helper.stop(nil) } }
    source.resume()
    signalSources.append(source)
  }
  withExtendedLifetime(signalSources) {}
  KeepAlive.objects = [control, helper, signalSources]

  control.start()
  control.emit("ready", ["protocol": 1, "pid": Int(getpid())])
}

/// Holds the long-lived objects for the life of the process.
@MainActor
enum KeepAlive {
  static var objects: [Any] = []
}

dispatchMain()
