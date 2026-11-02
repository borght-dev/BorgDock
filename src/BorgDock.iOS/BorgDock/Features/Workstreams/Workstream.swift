import Foundation

/// A workstream as the desktop writes it to `BorgDock Workstreams/<id>.json` (`services/workstreams/types.ts`,
/// `WorkstreamDocument`). The phone reads it and never writes: only intentions and references are stored, and
/// what a source says now comes from `POST /api/refs/resolve`.
struct Workstream: Decodable, Hashable, Sendable, Identifiable {
    enum Status: String, Decodable, Sendable {
        case active, paused, done, archived

        init(from decoder: Decoder) throws {
            self = Status(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .active
        }
    }

    let id: String
    let title: String
    let goal: String
    let status: Status
    let pinned: Bool
    let members: [Member]
    let outcomes: [Outcome]
    let decisions: [Decision]
    let nextAction: NextAction?
    let proposals: [Proposal]
    let revision: Int
    let updatedAt: String?

    struct Member: Decodable, Hashable, Sendable {
        /// `gh:github.com/owner/repo#12`, `ado:org#123`, `t3:env/thread`, `url:…`
        let key: String
        let ref: SourceRef
        let role: String
        /// The title when it was linked, for when the source can't be read.
        let label: String
        let note: String
    }

    enum SourceRef: Decodable, Hashable, Sendable {
        case pullRequest(owner: String, repo: String, number: Int)
        case item(organization: String, project: String, id: Int)
        case thread(environmentId: String, threadId: String)
        case link(url: String, title: String)
        case unknown

        private enum CodingKeys: String, CodingKey { case kind, owner, repo, number, organization, project, id, environmentId, threadId, url, title }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            switch try c.decode(String.self, forKey: .kind) {
            case "github-pr":
                self = .pullRequest(owner: try c.decode(String.self, forKey: .owner), repo: try c.decode(String.self, forKey: .repo), number: try c.decode(Int.self, forKey: .number))
            case "ado-item":
                self = .item(organization: try c.decode(String.self, forKey: .organization), project: try c.decodeIfPresent(String.self, forKey: .project) ?? "", id: try c.decode(Int.self, forKey: .id))
            case "t3-thread":
                self = .thread(environmentId: try c.decode(String.self, forKey: .environmentId), threadId: try c.decode(String.self, forKey: .threadId))
            case "link":
                self = .link(url: try c.decode(String.self, forKey: .url), title: try c.decodeIfPresent(String.self, forKey: .title) ?? "")
            default:
                self = .unknown
            }
        }
    }

    struct Outcome: Decodable, Hashable, Sendable, Identifiable {
        let id: String
        let title: String
        let required: Bool
        let rules: [Rule]
        let verification: Verification
    }

    struct Rule: Decodable, Hashable, Sendable {
        let id: String
        let kind: String
        /// The member the rule reads.
        let target: String
        let value: String?
    }

    struct Verification: Decodable, Hashable, Sendable {
        enum State: String, Decodable, Sendable {
            case unverified, verified, confirmed, invalidated

            init(from decoder: Decoder) throws {
                self = State(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unverified
            }
        }

        let state: State
        let at: String?
        /// What you pointed at, for `confirmed`.
        let evidence: [String]
        let note: String

        var isVerified: Bool { state == .verified || state == .confirmed }
    }

    struct Decision: Decodable, Hashable, Sendable, Identifiable {
        let id: String
        let question: String
        /// The members that are alternatives to each other.
        let options: [String]
        let status: String
        let chosen: String?
        let rationale: String
        let decidedAt: String?

        var isOpen: Bool { status != "decided" }
    }

    struct NextAction: Decodable, Hashable, Sendable {
        let text: String
        let target: String?
    }

    struct Proposal: Decodable, Hashable, Sendable {
        struct Item: Decodable, Hashable, Sendable {
            let id: String
            let kind: String
            let status: String
            let why: String
            let decisionId: String?
            let choose: String?
            let text: String?
        }

        let id: String
        let runKey: String
        let at: String
        let items: [Item]
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, goal, status, pinned, members, outcomes, decisions, nextAction, proposals, revision, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        goal = try c.decodeIfPresent(String.self, forKey: .goal) ?? ""
        status = try c.decodeIfPresent(Status.self, forKey: .status) ?? .active
        pinned = try c.decodeIfPresent(Bool.self, forKey: .pinned) ?? false
        members = try c.decodeIfPresent([Member].self, forKey: .members) ?? []
        outcomes = try c.decodeIfPresent([Outcome].self, forKey: .outcomes) ?? []
        decisions = try c.decodeIfPresent([Decision].self, forKey: .decisions) ?? []
        nextAction = try c.decodeIfPresent(NextAction.self, forKey: .nextAction)
        proposals = try c.decodeIfPresent([Proposal].self, forKey: .proposals) ?? []
        revision = try c.decodeIfPresent(Int.self, forKey: .revision) ?? 0
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
    }

    // MARK: Derived

    func member(_ key: String) -> Member? { members.first { $0.key == key } }

    /// The members an outcome's evidence reads: its rules' targets, and what you pointed at when you confirmed it.
    func evidence(for outcome: Outcome) -> [String] {
        var keys: [String] = []
        for key in outcome.rules.map(\.target) + outcome.verification.evidence where !keys.contains(key) && !key.hasPrefix("outcome:") && !key.hasPrefix("decision:") {
            keys.append(key)
        }
        return keys
    }

    /// Outcomes that count toward the goal: required ones, or all when none is marked required.
    var countedOutcomes: [Outcome] {
        let required = outcomes.filter(\.required)
        return required.isEmpty ? outcomes : required
    }

    var verifiedCount: Int { countedOutcomes.filter(\.verification.isVerified).count }
    var openCount: Int { countedOutcomes.filter { $0.verification.state == .unverified }.count }

    /// An agent's open proposal for a decision, if one waits.
    func proposal(for decision: Decision) -> Proposal.Item? {
        proposals.flatMap(\.items).first { $0.status == "open" && $0.kind == "decision" && $0.decisionId == decision.id }
    }

    /// Every reference the screen resolves.
    var resolvableKeys: [String] {
        members.filter {
            if case .link = $0.ref { return false }
            if case .unknown = $0.ref { return false }
            return true
        }.map(\.key)
    }
}

/// Reads `BorgDock Workstreams/*.json`. A sync client's copy (`<id>-PC.json`) and malformed files are skipped.
enum WorkstreamFiles {
    /// The desktop's ids: what `crypto.randomUUID()` makes.
    static func isWorkstreamFile(_ name: String) -> Bool {
        guard name.hasSuffix(".json"), !name.hasPrefix(".") else { return false }
        let id = String(name.dropLast(5))
        return UUID(uuidString: id) != nil && id.count == 36
    }

    static func load(from folder: URL) -> [Workstream] {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return [] }
        var loaded: [Workstream] = []
        for name in names where isWorkstreamFile(name) {
            let url = folder.appendingPathComponent(name)
            var data: Data?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: nil) { data = try? Data(contentsOf: $0) }
            if let data, let workstream = try? JSONDecoder().decode(Workstream.self, from: data) {
                loaded.append(workstream)
            }
        }
        return loaded.sorted { lhs, rhs in
            if lhs.pinned != rhs.pinned { return lhs.pinned }
            if (lhs.status == .active) != (rhs.status == .active) { return lhs.status == .active }
            return (lhs.updatedAt ?? "") > (rhs.updatedAt ?? "")
        }
    }
}
