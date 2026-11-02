import Foundation

// Swift mirror of shared/src/api.ts. Field names and optionality follow the TypeScript types exactly;
// timestamps stay ISO strings, as in the contract. Change both files together.

enum DispatchAPI {
    /// API_VERSION in shared/src/api.ts.
    static let version = 1
}

/// A string enum that decodes unknown values to a fallback instead of failing the whole response.
protocol ResilientEnum: RawRepresentable, Codable, Hashable, Sendable where RawValue == String {
    static var fallback: Self { get }
}

extension ResilientEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .fallback
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

// MARK: - Overview

enum Bay: String, ResilientEnum, CaseIterable {
    case waiting, drift, working, next, idle, paused, handed
    static let fallback = Bay.idle
}

enum ThreadStatus: String, ResilientEnum {
    case question, plan, approval
    case yourTurn = "your-turn"
    case failed, running, settled
    case unknown
    static let fallback = ThreadStatus.unknown
}

enum PullRequestState: String, ResilientEnum {
    case open, merged, closed, unknown
    static let fallback = PullRequestState.unknown
}

struct QuestionOption: Codable, Hashable, Sendable {
    let label: String
    /// What T3 expects back.
    let value: String
}

struct AgentQuestion: Codable, Hashable, Sendable {
    let id: String
    let question: String
    let options: [QuestionOption]
    let recommended: Int?
    let allowCustomAnswer: Bool
    let multiSelect: Bool
}

struct ThreadSummary: Codable, Hashable, Sendable, Identifiable {
    var environmentId: String? = nil
    var environmentLabel: String? = nil
    var available: Bool? = nil
    let id: String
    let title: String
    let worktree: String
    let branch: String?
    let status: ThreadStatus
    let createdAt: String
    let lastActivityAt: String
    let model: String
    /// Present while the agent waits for answers.
    let questionRequestId: String?
    let questions: [AgentQuestion]
    /// Latest agent message, only for open threads.
    let lastAgentMessage: String?
    /// T3's web UI.
    let link: String
    /// The T3 Code iOS app: t3code://threads/<environmentId>/<threadId>. Nil from older servers; use `link` then.
    let appLink: String?
}

/// `ThreadSummary & { guessItemId }` in TypeScript.
struct UnlinkedThread: Codable, Hashable, Sendable, Identifiable {
    let thread: ThreadSummary
    let guessItemId: Int?

    var id: String { thread.id }

    private enum CodingKeys: String, CodingKey { case guessItemId }

    init(thread: ThreadSummary, guessItemId: Int?) {
        self.thread = thread
        self.guessItemId = guessItemId
    }

    init(from decoder: Decoder) throws {
        thread = try ThreadSummary(from: decoder)
        guessItemId = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(Int.self, forKey: .guessItemId)
    }

    func encode(to encoder: Encoder) throws {
        try thread.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(guessItemId, forKey: .guessItemId)
    }
}

struct PullRequest: Codable, Hashable, Sendable {
    let number: Int
    let url: String
    /// The PR's head branch, when T3 knows it. Missing from older servers.
    let branch: String?
    let state: PullRequestState
    let title: String
    let isDraft: Bool
    let checks: String?
}

struct Suggestion: Codable, Hashable, Sendable {
    /// Stable while the evidence is unchanged; used to dismiss and to avoid repeat notifications.
    let id: String
    /// Target ADO state, or nil when the suggestion is "look at this" without a state move.
    let to: String?
    let reason: String
}

enum ItemType: String, ResilientEnum {
    case bug = "Bug"
    case pbi = "PBI"
    case qi = "QI"
    case task = "Task"
    case other = "Other"
    static let fallback = ItemType.other
}

enum StateCategory: String, ResilientEnum {
    case proposed = "Proposed"
    case inProgress = "InProgress"
    case resolved = "Resolved"
    case completed = "Completed"
    case removed = "Removed"
    case unknown
    static let fallback = StateCategory.unknown
}

struct WorkItemSummary: Codable, Hashable, Sendable, Identifiable {
    let id: Int
    let type: ItemType
    let typeName: String
    let title: String
    let state: String
    let stateCategory: StateCategory
    /// Workflow states in process order.
    let workflow: [String]
    let sprint: String
    let dueDate: String?
    let priority: Int?
    let tags: [String]
    let assignedTo: String?
    /// Compared on the account, not the display name. Older servers don't send it: decodes as false.
    let assignedToMe: Bool
    let url: String

    private enum CodingKeys: String, CodingKey {
        case id, type, typeName, title, state, stateCategory, workflow, sprint, dueDate, priority, tags, assignedTo, assignedToMe, url
    }

    init(
        id: Int, type: ItemType, typeName: String, title: String, state: String, stateCategory: StateCategory,
        workflow: [String], sprint: String, dueDate: String?, priority: Int?, tags: [String], assignedTo: String?,
        assignedToMe: Bool, url: String
    ) {
        self.id = id
        self.type = type
        self.typeName = typeName
        self.title = title
        self.state = state
        self.stateCategory = stateCategory
        self.workflow = workflow
        self.sprint = sprint
        self.dueDate = dueDate
        self.priority = priority
        self.tags = tags
        self.assignedTo = assignedTo
        self.assignedToMe = assignedToMe
        self.url = url
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        type = try container.decode(ItemType.self, forKey: .type)
        typeName = try container.decode(String.self, forKey: .typeName)
        title = try container.decode(String.self, forKey: .title)
        state = try container.decode(String.self, forKey: .state)
        stateCategory = try container.decode(StateCategory.self, forKey: .stateCategory)
        workflow = try container.decode([String].self, forKey: .workflow)
        sprint = try container.decode(String.self, forKey: .sprint)
        dueDate = try container.decodeIfPresent(String.self, forKey: .dueDate)
        priority = try container.decodeIfPresent(Int.self, forKey: .priority)
        tags = try container.decode([String].self, forKey: .tags)
        assignedTo = try container.decodeIfPresent(String.self, forKey: .assignedTo)
        assignedToMe = try container.decodeIfPresent(Bool.self, forKey: .assignedToMe) ?? false
        url = try container.decode(String.self, forKey: .url)
    }
}

struct ItemOverview: Codable, Hashable, Sendable, Identifiable {
    let item: WorkItemSummary
    let bay: Bay
    let waitingFor: String?
    let suggestion: Suggestion?
    let pullRequest: PullRequest?
    /// Newest first. The first one is the thread Dispatch considers current.
    let threads: [ThreadSummary]
    let queuedAt: String?
    /// The states walk's verdict, evidence and latest message (Platform.swift). Nil from older servers.
    var walk: ItemWalk? = nil

    var id: Int { item.id }
}

enum WorktreeState: String, ResilientEnum {
    /// No open thread.
    case free
    /// An open thread on one of my items.
    case mine
    /// An open thread on anything else.
    case busy
    static let fallback = WorktreeState.busy
}

struct Worktree: Codable, Hashable, Sendable, Identifiable {
    var workspaceId: String? = nil
    var environmentId: String? = nil
    var environmentLabel: String? = nil
    var available: Bool? = nil
    var models: [ModelOption]? = nil
    var defaultModel: String? = nil
    let name: String
    let state: WorktreeState
    let itemId: Int?
    let running: Bool
    let needsYou: Bool

    var id: String { workspaceId ?? name }
    var canStart: Bool { state == .free && available != false }
    private enum CodingKeys: String, CodingKey {
        case workspaceId = "id"
        case environmentId, environmentLabel, available, models, defaultModel, name, state, itemId, running, needsYou
    }
}

struct SourceStatus: Codable, Hashable, Sendable {
    let ok: Bool
    let at: String?
    let error: String?
}

struct EnvironmentStatus: Codable, Hashable, Sendable, Identifiable {
    let environmentId: String
    let label: String
    let ok: Bool
    let at: String?
    let error: String?
    var id: String { environmentId }
}

struct OverviewSources: Codable, Hashable, Sendable {
    var environments: [EnvironmentStatus]? = nil
    let ado: SourceStatus
    let t3: SourceStatus
}

struct Overview: Codable, Hashable, Sendable {
    let generatedAt: String
    let items: [ItemOverview]
    let unlinkedThreads: [UnlinkedThread]
    let worktrees: [Worktree]
    let sources: OverviewSources
    /// Lanes in walk order and the briefing line (Platform.swift). Nil from older servers.
    var walk: Walk? = nil
}

// MARK: - Item detail and browse

struct ItemComment: Codable, Hashable, Sendable {
    let by: String
    let at: String
    let text: String
}

struct ItemDetail: Codable, Hashable, Sendable {
    let item: WorkItemSummary
    let description: String
    let acceptanceCriteria: String
    let reproSteps: String
    /// The team's custom "QA Notes" field, as plain text. Older servers don't send it: decodes as "".
    let qaNotes: String
    let comments: [ItemComment]

    private enum CodingKeys: String, CodingKey { case item, description, acceptanceCriteria, reproSteps, qaNotes, comments }

    init(item: WorkItemSummary, description: String, acceptanceCriteria: String, reproSteps: String, qaNotes: String, comments: [ItemComment]) {
        self.item = item
        self.description = description
        self.acceptanceCriteria = acceptanceCriteria
        self.reproSteps = reproSteps
        self.qaNotes = qaNotes
        self.comments = comments
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        item = try container.decode(WorkItemSummary.self, forKey: .item)
        description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        acceptanceCriteria = try container.decodeIfPresent(String.self, forKey: .acceptanceCriteria) ?? ""
        reproSteps = try container.decodeIfPresent(String.self, forKey: .reproSteps) ?? ""
        qaNotes = try container.decodeIfPresent(String.self, forKey: .qaNotes) ?? ""
        comments = try container.decodeIfPresent([ItemComment].self, forKey: .comments) ?? []
    }
}

struct BrowseQuery: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let name: String
    let group: String
}

struct BrowseResult: Codable, Hashable, Sendable {
    let items: [WorkItemSummary]
    let truncated: Bool
}

// MARK: - Actions

/// Deprecated in the contract: older builds sent it instead of `model`. Kept for servers without `models`.
typealias AgentId = String

enum ModelProvider: String, ResilientEnum {
    case codex = "Codex"
    case claude = "Claude"
    case other
    static let fallback = ModelProvider.other
}

struct EffortOption: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let label: String
}

struct ModelOption: Codable, Hashable, Sendable, Identifiable {
    /// `<instance>/<model>`, e.g. `codex/gpt-6.1-sol`; what StartThreadRequest.model takes.
    let id: String
    let label: String
    let provider: ModelProvider
    /// Used in T3 in the last three weeks; these come first.
    let recent: Bool
    /// Reasoning levels, lowest first. Empty when the model has none.
    let efforts: [EffortOption]
    /// Last pick for this model, else what T3 last used, else the model's default.
    let defaultEffort: String?

    private enum CodingKeys: String, CodingKey { case id, label, provider, recent, efforts, defaultEffort }

    init(id: String, label: String, provider: ModelProvider, recent: Bool, efforts: [EffortOption], defaultEffort: String?) {
        self.id = id
        self.label = label
        self.provider = provider
        self.recent = recent
        self.efforts = efforts
        self.defaultEffort = defaultEffort
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        label = try container.decode(String.self, forKey: .label)
        provider = try container.decodeIfPresent(ModelProvider.self, forKey: .provider) ?? .other
        recent = try container.decodeIfPresent(Bool.self, forKey: .recent) ?? false
        efforts = try container.decodeIfPresent([EffortOption].self, forKey: .efforts) ?? []
        defaultEffort = try container.decodeIfPresent(String.self, forKey: .defaultEffort)
    }
}

enum StartMode: String, ResilientEnum {
    /// Propose a plan first.
    case plan
    /// Straight to work.
    case `default`
    /// Hand the item to QA with the repository's ado-update-for-qa skill.
    case qa
    /// Close it as Done without QA, with the reason in the item's notes.
    case done
    static let fallback = StartMode.default

    /// QA and Done hand a finished item on: the agent sets the ADO state itself.
    var isHandoff: Bool { self == .qa || self == .done }
}

/// GET /api/items/:id/start: what the start sheet prefills. Both prompts can be edited before starting.
struct StartOptions: Codable, Hashable, Sendable {
    struct Prompts: Codable, Hashable, Sendable {
        let pickup: String
        let qa: String
        /// Missing from servers before "Close as done"; the app has a fallback.
        let done: String?
    }

    let prompts: Prompts
    /// Branch the item's work lives on, if known.
    let branch: String?
    /// The free worktree the item last ran in, best for QA and Done handoffs; nil if none is free.
    var qaWorkspaceId: String? = nil
    let qaWorktree: String?
}

struct StartThreadRequest: Codable, Hashable, Sendable {
    let itemId: Int
    let worktree: String
    /// A ModelOption id.
    let model: String?
    /// A ModelOption effort id; nil (sent as null) uses the model's default.
    let effort: String?
    /// Deprecated: only sent to a server that has no `models` yet. Left out otherwise.
    var agent: AgentId? = nil
    let mode: StartMode
    let prompt: String
    /// Move ADO to this state as part of starting. Nil leaves ADO alone (sent as null).
    let moveAdoTo: String?
    let assignToMe: Bool

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(itemId, forKey: .itemId)
        try container.encode(worktree, forKey: .worktree)
        try container.encodeIfPresent(model, forKey: .model)
        try container.encode(effort, forKey: .effort)
        try container.encodeIfPresent(agent, forKey: .agent)
        try container.encode(mode, forKey: .mode)
        try container.encode(prompt, forKey: .prompt)
        try container.encode(moveAdoTo, forKey: .moveAdoTo)
        try container.encode(assignToMe, forKey: .assignToMe)
    }
}

/// `warning` is set when the thread started but an ADO step (assign, state move) failed.
struct StartThreadResponse: Codable, Hashable, Sendable {
    let threadId: String
    let link: String
    /// Nil from older servers; use `link` then.
    let appLink: String?
    let adoState: String?
    let warning: String?
}

/// `string | string[]`
enum AnswerValue: Codable, Hashable, Sendable {
    case single(String)
    case multiple([String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .single(value)
        } else {
            self = .multiple(try container.decode([String].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .single(let value): try container.encode(value)
        case .multiple(let values): try container.encode(values)
        }
    }
}

struct AnswerRequest: Codable, Hashable, Sendable {
    let requestId: String
    let answers: [String: AnswerValue]
}

struct MoveStateRequest: Codable, Hashable, Sendable {
    let to: String
}

struct MoveStateResponse: Codable, Hashable, Sendable {
    let state: String
}

struct LinkThreadRequest: Codable, Hashable, Sendable {
    let itemId: Int?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(itemId, forKey: .itemId)
    }
}

struct OKResponse: Codable, Hashable, Sendable {
    let ok: Bool
}

struct EmptyBody: Codable, Hashable, Sendable {}

// MARK: - Config

struct AppUser: Codable, Hashable, Sendable {
    let name: String
    let email: String
}

struct AgentOption: Codable, Hashable, Sendable, Identifiable {
    let id: AgentId
    let label: String
}

struct AppConfig: Codable, Hashable, Sendable {
    let apiVersion: Int
    let user: AppUser
    /// Recent models first. Empty on servers from before model picking.
    let models: [ModelOption]
    /// Koen's last pick, else Codex's newest model.
    var defaultModel: String? = nil
    /// Deprecated; used only when `models` is empty.
    let agents: [AgentOption]
    let defaultAgent: AgentId
    let worktrees: [String]
    /// Placeholders: {id} {title} {branch}.
    let promptTemplate: String
    let vapidPublicKey: String?

    private enum CodingKeys: String, CodingKey {
        case apiVersion, user, models, defaultModel, agents, defaultAgent, worktrees, promptTemplate, vapidPublicKey
    }

    init(
        apiVersion: Int, user: AppUser, models: [ModelOption], defaultModel: String?, agents: [AgentOption], defaultAgent: AgentId,
        worktrees: [String], promptTemplate: String, vapidPublicKey: String?
    ) {
        self.apiVersion = apiVersion
        self.user = user
        self.models = models
        self.defaultModel = defaultModel
        self.agents = agents
        self.defaultAgent = defaultAgent
        self.worktrees = worktrees
        self.promptTemplate = promptTemplate
        self.vapidPublicKey = vapidPublicKey
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        apiVersion = try container.decode(Int.self, forKey: .apiVersion)
        user = try container.decode(AppUser.self, forKey: .user)
        models = try container.decodeIfPresent([ModelOption].self, forKey: .models) ?? []
        defaultModel = try container.decodeIfPresent(String.self, forKey: .defaultModel)
        agents = try container.decodeIfPresent([AgentOption].self, forKey: .agents) ?? []
        defaultAgent = try container.decodeIfPresent(AgentId.self, forKey: .defaultAgent) ?? "codex"
        worktrees = try container.decodeIfPresent([String].self, forKey: .worktrees) ?? []
        promptTemplate = try container.decode(String.self, forKey: .promptTemplate)
        vapidPublicKey = try container.decodeIfPresent(String.self, forKey: .vapidPublicKey)
    }
}

// MARK: - Auth

enum SessionKind: String, ResilientEnum {
    case browser, app
    static let fallback = SessionKind.browser
}

enum SessionVia: String, ResilientEnum {
    case internet, tailnet, local
    static let fallback = SessionVia.internet
}

struct SessionInfo: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let kind: SessionKind
    let name: String
    let createdAt: String
    let lastSeenAt: String
    let lastSeenVia: SessionVia
    let current: Bool
}

struct PasskeyInfo: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let name: String
    let createdAt: String
    let lastUsedAt: String?
}

struct AuthStatus: Codable, Hashable, Sendable {
    let setupRequired: Bool
    let authenticated: Bool
    let session: SessionInfo?
}

struct AppTokenRequest: Codable, Hashable, Sendable {
    let code: String
    let codeVerifier: String
    let deviceName: String
    /// The device's signing key, bound to the new session so signed commands work after a passkey sign-in.
    var devicePublicKey: String? = nil
}

struct AppTokenResponse: Codable, Hashable, Sendable {
    let token: String
    let sessionId: String
}

// MARK: - Push

struct NotificationPreferences: Codable, Hashable, Sendable {
    var waiting: Bool
    var drift: Bool
    var finished: Bool
}

enum ApnsEnvironment: String, ResilientEnum {
    case sandbox, production
    static let fallback = ApnsEnvironment.production
}

struct ApnsRegistration: Codable, Hashable, Sendable {
    let deviceToken: String
    let environment: ApnsEnvironment
}

/// `{ok, enabled}` from POST /api/push/apns. `enabled` is false until the server has an APNs key.
struct ApnsRegistrationResponse: Codable, Hashable, Sendable {
    let ok: Bool
    let enabled: Bool
}

struct QuestionPush: Codable, Hashable, Sendable {
    let itemId: Int
    let threadId: String
    let requestId: String
    let questionId: String
    let options: [QuestionOption]
    let recommended: Int?
    let allowCustomAnswer: Bool
}

/// Dispatch's data under the `dispatch` key of an APNs payload.
enum PushData: Hashable, Sendable {
    case question(QuestionPush)
    case suggestion(itemId: Int, to: String)
    case finished(itemId: Int, threadId: String)
    case waiting(itemId: Int)

    var itemId: Int {
        switch self {
        case .question(let push): push.itemId
        case .suggestion(let itemId, _), .finished(let itemId, _), .waiting(let itemId): itemId
        }
    }
}

extension PushData: Decodable {
    private enum CodingKeys: String, CodingKey { case kind, itemId, threadId, to }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let itemId = try container.decode(Int.self, forKey: .itemId)
        switch try container.decode(String.self, forKey: .kind) {
        case "question":
            self = .question(try QuestionPush(from: decoder))
        case "suggestion":
            self = .suggestion(itemId: itemId, to: try container.decode(String.self, forKey: .to))
        case "finished":
            self = .finished(itemId: itemId, threadId: try container.decode(String.self, forKey: .threadId))
        default:
            self = .waiting(itemId: itemId)
        }
    }

    /// Reads `userInfo["dispatch"]` from a notification.
    init?(userInfo: [AnyHashable: Any]) {
        guard let raw = userInfo["dispatch"],
              JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(PushData.self, from: data)
        else { return nil }
        self = decoded
    }
}

// MARK: - Live updates

/// `event: overview` on GET /api/events. The app polls instead; this mirrors the type for completeness.
struct OverviewChanged: Codable, Hashable, Sendable {
    let generatedAt: String
}

/// `{ "error": "<sentence for the user>" }`
struct APIErrorBody: Codable, Hashable, Sendable {
    let error: String
}
