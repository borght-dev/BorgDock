import Foundation

/// Where the direct backends keep what must survive a launch: watched repositories, snoozes, the last pull request
/// list. Small JSON documents by key.
protocol DirectStore: Sendable {
    func data(forKey key: String) -> Data?
    /// Nil removes the key.
    func setData(_ data: Data?, forKey key: String)
}

/// Values go in and out as JSON. The raw requirement has its own name on purpose: a `set(Data)` beside a
/// `set(some Encodable)` picks the wrong one for a non-optional `Data` and stores it encoded twice.
extension DirectStore {
    func value<Value: Decodable>(_ type: Value.Type = Value.self, forKey key: String) -> Value? {
        data(forKey: key).flatMap { try? JSONDecoder().decode(Value.self, from: $0) }
    }

    func set(_ value: some Encodable, forKey key: String) {
        setData(try? JSONEncoder().encode(value), forKey: key)
    }

    func remove(forKey key: String) {
        setData(nil, forKey: key)
    }
}

/// One file per key in a folder, written atomically.
struct FileStore: DirectStore {
    let directory: URL

    func data(forKey key: String) -> Data? {
        try? Data(contentsOf: file(key))
    }

    func setData(_ data: Data?, forKey key: String) {
        guard let data else {
            try? FileManager.default.removeItem(at: file(key))
            return
        }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: file(key), options: .atomic)
    }

    /// Forgets everything, e.g. when the last account is removed.
    func clear() {
        try? FileManager.default.removeItem(at: directory)
    }

    private func file(_ key: String) -> URL {
        directory.appendingPathComponent(key).appendingPathExtension("json")
    }
}

/// For tests and previews: nothing touches the disk.
final class MemoryStore: DirectStore, @unchecked Sendable {
    // Guarded by `lock`.
    private var values: [String: Data] = [:]
    private let lock = NSLock()

    func data(forKey key: String) -> Data? { lock.withLock { values[key] } }
    func setData(_ data: Data?, forKey key: String) { lock.withLock { values[key] = data } }
}
