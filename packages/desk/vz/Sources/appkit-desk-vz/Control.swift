import Foundation

/// The control channel: newline-delimited JSON on stdin and stdout.
///
/// Every request carries an `id` and an `op`, and is answered by exactly one
/// response with the same `id` — `{"id","ok":true,"result":{…}}` or
/// `{"id","ok":false,"error":"…"}`. Unsolicited events carry `event` and no
/// `id`. Diagnostics go to stderr, never stdout, so stdout is always parseable.
@MainActor
final class ControlChannel {
  private var buffer = Data()
  private let input: DispatchSourceRead
  var onRequest: ((_ id: String, _ op: String, _ body: [String: Any]) -> Void)?
  var onClose: (() -> Void)?

  static let lineLimit = 1 << 20

  init() {
    let flags = fcntl(STDIN_FILENO, F_GETFL)
    _ = fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK)
    input = DispatchSource.makeReadSource(fileDescriptor: STDIN_FILENO, queue: .main)
    input.setEventHandler { @Sendable [weak self] in Task { @MainActor in self?.readable() } }
  }

  func start() { input.resume() }

  private func readable() {
    var chunk = [UInt8](repeating: 0, count: 64 * 1024)
    while true {
      let count = chunk.withUnsafeMutableBytes { read(STDIN_FILENO, $0.baseAddress, $0.count) }
      if count > 0 {
        buffer.append(contentsOf: chunk[0..<count])
        drainLines()
        continue
      }
      if count == 0 {
        // The host is gone. A helper that outlived it would leave a VM nobody
        // can reach running on the Mac, so end of input is a stop.
        input.cancel()
        onClose?()
        return
      }
      if errno == EAGAIN || errno == EINTR { return }
      input.cancel()
      onClose?()
      return
    }
  }

  private func drainLines() {
    while let newline = buffer.firstIndex(of: 0x0a) {
      let line = buffer[buffer.startIndex..<newline]
      buffer.removeSubrange(buffer.startIndex...newline)
      handle(Data(line))
    }
    if buffer.count > Self.lineLimit {
      log("control line exceeded \(Self.lineLimit) bytes; discarding it")
      buffer.removeAll()
    }
  }

  private func handle(_ line: Data) {
    if line.allSatisfy({ $0 == 0x20 || $0 == 0x0d || $0 == 0x09 }) { return }
    guard let object = try? JSONSerialization.jsonObject(with: line), let body = object as? [String: Any] else {
      log("ignoring a control line that is not a JSON object")
      return
    }
    guard let id = body["id"] as? String, !id.isEmpty else {
      log("ignoring a control request without an id")
      return
    }
    guard let op = body["op"] as? String else {
      respond(id, error: "Request has no op.")
      return
    }
    onRequest?(id, op, body)
  }

  func respond(_ id: String, result: [String: Any]) {
    write(["id": id, "ok": true, "result": result])
  }

  func respond(_ id: String, error: String) {
    write(["id": id, "ok": false, "error": error])
  }

  func emit(_ event: String, _ fields: [String: Any] = [:]) {
    var message = fields
    message["event"] = event
    write(message)
  }

  private func write(_ message: [String: Any]) {
    guard var data = try? JSONSerialization.data(withJSONObject: message, options: [.sortedKeys]) else { return }
    data.append(0x0a)
    FileHandle.standardOutput.write(data)
  }
}

func log(_ message: String) {
  FileHandle.standardError.write(Data("appkit-desk-vz: \(message)\n".utf8))
}

/// A malformed or impossible request, reported back as the response's error.
struct RequestError: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}

extension Dictionary where Key == String, Value == Any {
  func string(_ key: String) throws -> String {
    guard let value = self[key] as? String, !value.isEmpty else {
      throw RequestError("\(key) must be a non-empty string.")
    }
    return value
  }

  func optionalString(_ key: String) throws -> String? {
    guard let value = self[key], !(value is NSNull) else { return nil }
    guard let text = value as? String, !text.isEmpty else {
      throw RequestError("\(key) must be a non-empty string when present.")
    }
    return text
  }

  func path(_ key: String) throws -> String {
    let value = try string(key)
    guard value.hasPrefix("/") else { throw RequestError("\(key) must be an absolute path.") }
    return value
  }

  func optionalPath(_ key: String) throws -> String? {
    guard let value = try optionalString(key) else { return nil }
    guard value.hasPrefix("/") else { throw RequestError("\(key) must be an absolute path.") }
    return value
  }

  func positiveInteger(_ key: String) throws -> Int {
    guard let number = self[key] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
      number.doubleValue == number.doubleValue.rounded(), number.intValue > 0
    else { throw RequestError("\(key) must be a positive integer.") }
    return number.intValue
  }

  func bool(_ key: String, default fallback: Bool) throws -> Bool {
    guard let value = self[key], !(value is NSNull) else { return fallback }
    guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else {
      throw RequestError("\(key) must be a boolean.")
    }
    return number.boolValue
  }
}
