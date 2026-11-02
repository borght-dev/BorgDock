import Foundation

// Swift mirror of shared/src/borgdock.ts for the platform slice: server and account, signed commands, machines and
// sources, the Dispatch states walk, threads and launching, activity, preferences and push. Names follow the
// TypeScript exactly; timestamps stay ISO strings. GitHub's types live in GitHub.swift.

// MARK: - Server and account

/// GET /api/server (no session needed).
struct ServerInfo: Codable, Hashable, Sendable {
    struct Clerk: Codable, Hashable, Sendable {
        let publishableKey: String
        let frontendApi: String
    }

    let apiVersion: Int
    let name: String
    /// False until someone claims this server by pairing its first machine.
    let claimed: Bool
    /// Nil when the server has no Clerk application configured: the app falls back to the passkey web sign-in.
    let clerk: Clerk?
}

struct ClerkExchangeRequest: Codable, Hashable, Sendable {
    let clerkToken: String
    let deviceName: String
    /// Base64 of the 65-byte X9.63 representation of this device's P-256 public key.
    let devicePublicKey: String
    var claim: PairingProof? = nil
}

struct ClerkExchangeResponse: Codable, Hashable, Sendable {
    let token: String
    let sessionId: String
    let owner: Owner
}

struct Owner: Codable, Hashable, Sendable {
    let clerkUserId: String
    let name: String
    let email: String?
    let imageUrl: String?
}

/// GET /api/account
struct Account: Codable, Hashable, Sendable {
    let owner: Owner
    let devices: [DeviceInfo]
}

struct DeviceInfo: Codable, Hashable, Sendable, Identifiable {
    let sessionId: String
    let name: String
    let createdAt: String
    let lastSeenAt: String
    let current: Bool
    let trustedBy: [String]
    /// `desktop` for a linked BorgDock desktop app; phones and browsers leave it out.
    var kind: DeviceKind? = nil

    var id: String { sessionId }
    var isDesktop: Bool { kind == .desktop }
}

enum DeviceKind: String, ResilientEnum {
    case phone, desktop
    static let fallback = DeviceKind.phone
}

// MARK: - Machines and sources

enum MachineKind: String, ResilientEnum {
    case local, connector, ssh
    static let fallback = MachineKind.connector
}

struct Machine: Codable, Hashable, Sendable, Identifiable {
    /// The T3 environment id.
    let id: String
    let label: String
    let kind: MachineKind
    let online: Bool
    let lastSeenAt: String?
    /// Open (not settled) threads.
    let threads: Int
    let version: String?
}

enum SourceVia: String, ResilientEnum {
    case account, machine
    static let fallback = SourceVia.machine
}

struct GithubAccountStatus: Codable, Hashable, Sendable, Identifiable {
    let login: String
    let via: SourceVia
    let machine: String?
    let ok: Bool
    let error: String?
    let polledAt: String?

    var id: String { login }
}

struct AdoSourceStatus: Codable, Hashable, Sendable {
    let org: String
    let project: String
    let via: SourceVia
    let machine: String?
    let ok: Bool
    let error: String?
}

/// GET /api/sources
struct Sources: Codable, Hashable, Sendable {
    let github: [GithubAccountStatus]
    let ado: AdoSourceStatus?
    let machines: [Machine]
    /// Linked BorgDock desktop apps; nil from servers that predate the desktop link.
    var desktops: [LinkedDesktop]? = nil
}

/// The code from a machine's pairing QR and this device's proof that it saw the secret.
struct PairingProof: Codable, Hashable, Sendable {
    let code: String
    let proof: String
}

/// POST /api/machines/pair (signed) → Machine.
struct PairMachineRequest: Codable, Hashable, Sendable {
    let code: String
    let proof: String
    let devicePublicKey: String
}

// MARK: - Desktop link

/// POST /api/desktop/links/approve (signed): the code the desktop shows.
struct ApproveDesktopRequest: Codable, Hashable, Sendable {
    let code: String
}

struct DesktopLinkApproval: Codable, Hashable, Sendable {
    let deviceName: String
    let sessionId: String
}

/// A linked desktop in GET /api/sources (`desktops`); the same session is a `kind: desktop` device in /api/account.
struct LinkedDesktop: Codable, Hashable, Sendable, Identifiable {
    let sessionId: String
    let name: String
    let lastSeenAt: String?
    /// The desktop says you're at your desk (not idle).
    let atDesk: Bool

    var id: String { sessionId }
}

// MARK: - Dispatch: the states walk

struct Verdict: Codable, Hashable, Sendable {
    let label: String
    let tone: Tone
}

enum EvidenceKind: String, ResilientEnum {
    case pr, merged, agent, due, priority, other
    static let fallback = EvidenceKind.other
}

struct Evidence: Codable, Hashable, Sendable {
    let label: String
    let tone: Tone?
    let kind: EvidenceKind
}

enum LatestMessageSource: String, ResilientEnum {
    case comment, notes, agent
    static let fallback = LatestMessageSource.comment
}

struct LatestMessage: Codable, Hashable, Sendable {
    let by: String
    let text: String
    let at: String
    let source: LatestMessageSource
}

/// `ItemOverview.walk`.
struct ItemWalk: Codable, Hashable, Sendable {
    let verdict: Verdict
    let evidence: [Evidence]
    let latest: LatestMessage?
}

/// `Overview.walk`: one lane per ADO state in walk order, and the briefing line.
struct Walk: Codable, Hashable, Sendable {
    struct Lane: Codable, Hashable, Sendable {
        let state: String
        let itemIds: [Int]
        let tone: Tone?
        let summary: String
    }

    struct Briefing: Codable, Hashable, Sendable {
        let needYou: Int
        let outOfSync: Int
        let running: Int
    }

    let lanes: [Lane]
    let briefing: Briefing
}

// MARK: - Threads and launching

enum MessageRole: String, ResilientEnum {
    case user, assistant
    static let fallback = MessageRole.assistant
}

struct ThreadMessage: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let role: MessageRole
    let text: String
    let at: String
}

/// GET /api/threads/:id
struct ThreadDetail: Codable, Hashable, Sendable {
    struct Activity: Codable, Hashable, Sendable {
        let reads: Int
        let commands: Int
        let minutes: Int
    }

    let thread: ThreadSummary
    let itemId: Int?
    let place: String
    let machine: String
    /// Oldest first.
    let messages: [ThreadMessage]
    let activity: Activity?
    let planReady: Bool
}

/// POST /api/threads/:id/messages (signed).
struct SendMessageRequest: Codable, Hashable, Sendable {
    let text: String
}

struct LaunchProject: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let machineId: String
    let title: String
    let repository: String?
    let defaultBranch: String?
}

struct LaunchThread: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let machineId: String
    let projectId: String
    let title: String
    let place: String
    let status: ThreadStatus
}

/// GET /api/agents/targets
struct LaunchTargets: Codable, Hashable, Sendable {
    let machines: [Machine]
    let projects: [LaunchProject]
    let threads: [LaunchThread]
    let models: [ModelOption]
    let defaultModel: String?
}

/// GET /api/agents/branches?machine=&project=
struct Branches: Codable, Hashable, Sendable {
    let branches: [String]
    let defaultBranch: String?
}

enum LaunchWorkspace: Codable, Hashable, Sendable {
    enum ThreadMode: String, Codable, Sendable { case `continue`, beside }

    case worktree(baseBranch: String?)
    case thread(threadId: String, mode: ThreadMode)

    private enum CodingKeys: String, CodingKey { case kind, baseBranch, threadId, mode }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if try container.decode(String.self, forKey: .kind) == "thread" {
            self = .thread(threadId: try container.decode(String.self, forKey: .threadId), mode: try container.decode(ThreadMode.self, forKey: .mode))
        } else {
            self = .worktree(baseBranch: try container.decodeIfPresent(String.self, forKey: .baseBranch))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .worktree(let baseBranch):
            try container.encode("worktree", forKey: .kind)
            try container.encode(baseBranch, forKey: .baseBranch)
        case .thread(let threadId, let mode):
            try container.encode("thread", forKey: .kind)
            try container.encode(threadId, forKey: .threadId)
            try container.encode(mode, forKey: .mode)
        }
    }
}

/// POST /api/agents/launch (signed) → StartThreadResponse. Every nullable field is sent as an explicit null.
struct LaunchRequest: Codable, Hashable, Sendable {
    let machineId: String
    let projectId: String
    let workspace: LaunchWorkspace
    let model: String?
    let effort: String?
    let planFirst: Bool
    let message: String
    let title: String
    let itemId: Int?
    let moveAdoTo: String?
    let prKey: String?
    let ciGroupId: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(machineId, forKey: .machineId)
        try container.encode(projectId, forKey: .projectId)
        try container.encode(workspace, forKey: .workspace)
        try container.encode(model, forKey: .model)
        try container.encode(effort, forKey: .effort)
        try container.encode(planFirst, forKey: .planFirst)
        try container.encode(message, forKey: .message)
        try container.encode(title, forKey: .title)
        try container.encode(itemId, forKey: .itemId)
        try container.encode(moveAdoTo, forKey: .moveAdoTo)
        try container.encode(prKey, forKey: .prKey)
        try container.encode(ciGroupId, forKey: .ciGroupId)
    }
}

// MARK: - Activity

enum ActivityCategory: String, ResilientEnum, CaseIterable, Identifiable {
    case review, ci, agent, merge, workitem, comment
    static let fallback = ActivityCategory.workitem
    var id: String { rawValue }
}

enum ActivityTarget: Codable, Hashable, Sendable {
    case pr(key: String)
    case item(id: Int)
    case thread(id: String, itemId: Int?)
    case ci(groupId: String)
    case none

    private enum CodingKeys: String, CodingKey { case kind, key, id, itemId, groupId }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "pr": self = .pr(key: try container.decode(String.self, forKey: .key))
        case "item": self = .item(id: try container.decode(Int.self, forKey: .id))
        case "thread": self = .thread(id: try container.decode(String.self, forKey: .id), itemId: try container.decodeIfPresent(Int.self, forKey: .itemId))
        case "ci": self = .ci(groupId: try container.decode(String.self, forKey: .groupId))
        default: self = .none
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .pr(let key):
            try container.encode("pr", forKey: .kind)
            try container.encode(key, forKey: .key)
        case .item(let id):
            try container.encode("item", forKey: .kind)
            try container.encode(id, forKey: .id)
        case .thread(let id, let itemId):
            try container.encode("thread", forKey: .kind)
            try container.encode(id, forKey: .id)
            try container.encode(itemId, forKey: .itemId)
        case .ci(let groupId):
            try container.encode("ci", forKey: .kind)
            try container.encode(groupId, forKey: .groupId)
        case .none:
            try container.encode("none", forKey: .kind)
        }
    }
}

struct ActivityEntry: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let category: ActivityCategory
    let title: String
    let detail: String
    let at: String
    var read: Bool
    let tone: Tone
    let target: ActivityTarget
}

/// GET /api/activity?category=<c>&before=<iso>&limit=<n>
struct ActivityPage: Codable, Hashable, Sendable {
    struct Away: Codable, Hashable, Sendable {
        let from: String
        let to: String
        let merged: Int
        let ciFailures: Int
        let agentsDone: Int
        let other: Int
    }

    let entries: [ActivityEntry]
    let unread: Int
    let unreadByCategory: [String: Int]
    let away: Away?

    func unread(_ category: ActivityCategory) -> Int { unreadByCategory[category.rawValue] ?? 0 }
}

/// POST /api/activity/read: `{ids}` or `{all: true}`.
enum MarkReadRequest: Codable, Hashable, Sendable {
    case ids([String])
    case all

    private enum CodingKeys: String, CodingKey { case ids, all }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if try container.decodeIfPresent(Bool.self, forKey: .all) == true { self = .all } else { self = .ids(try container.decode([String].self, forKey: .ids)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .ids(let ids): try container.encode(ids, forKey: .ids)
        case .all: try container.encode(true, forKey: .all)
        }
    }
}

struct UnreadResponse: Codable, Hashable, Sendable {
    let unread: Int
}

// MARK: - Preferences

enum CategoryDelivery: String, ResilientEnum, CaseIterable {
    case immediate, summary, off
    static let fallback = CategoryDelivery.immediate
}

/// GET/PUT /api/preferences
struct BorgDockPreferences: Codable, Hashable, Sendable {
    var categories: [String: CategoryDelivery]
    var quietAtDesk: Bool
    var faceIdForActions: Bool

    func delivery(_ category: ActivityCategory) -> CategoryDelivery { categories[category.rawValue] ?? .immediate }
}

// MARK: - Push

/// BorgDock's data under the `dispatch` key, next to Dispatch's own kinds (API.swift `PushData`).
enum BorgDockPush: Hashable, Sendable {
    case activity(entryId: String, category: ActivityCategory, target: ActivityTarget)
    case refresh
    case read(ids: [String])

    private struct Raw: Decodable {
        let kind: String
        let entryId: String?
        let category: ActivityCategory?
        let target: ActivityTarget?
        let ids: [String]?
    }

    init?(userInfo: [AnyHashable: Any]) {
        guard let raw = userInfo["dispatch"],
              JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(Raw.self, from: data)
        else { return nil }
        switch decoded.kind {
        case "activity":
            guard let entryId = decoded.entryId, let category = decoded.category, let target = decoded.target else { return nil }
            self = .activity(entryId: entryId, category: category, target: target)
        case "refresh": self = .refresh
        case "read": self = .read(ids: decoded.ids ?? [])
        default: return nil
        }
    }
}
