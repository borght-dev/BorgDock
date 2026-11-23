import Foundation

/// A pull request: `owner/repo#number`, the key the server uses everywhere.
struct PrKey: Hashable, Codable, Sendable, Identifiable {
    let owner: String
    let repo: String
    let number: Int

    var id: String { key }
    var key: String { "\(owner)/\(repo)#\(number)" }

    init(owner: String, repo: String, number: Int) {
        self.owner = owner
        self.repo = repo
        self.number = number
    }

    /// Parses "owner/repo#12".
    init?(key: String) {
        let parts = key.split(separator: "#", maxSplits: 1)
        guard parts.count == 2, let number = Int(parts[1]) else { return nil }
        let names = parts[0].split(separator: "/", maxSplits: 1)
        guard names.count == 2 else { return nil }
        self.init(owner: String(names[0]), repo: String(names[1]), number: number)
    }
}
