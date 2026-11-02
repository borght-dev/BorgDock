import Foundation

/// The start sheet's choices, and the request they turn into.
struct StartThreadDraft: Equatable {
    let item: WorkItemSummary
    /// "Assign to me" shows for items that aren't his: Browse results and items queued from Browse.
    let offersAssign: Bool
    var worktree: String?
    private(set) var models: [ModelOption] = []
    private var fallbackModels: [ModelOption] = []
    private var modelsRequired = false
    /// A ModelOption id. Nil only when the server has no models (then `agent` is sent instead).
    private(set) var model: String?
    var effort: String?
    /// Fallback for servers from before model picking.
    private var agent: AgentId = "codex"
    private(set) var mode: StartMode = .plan
    /// One text per kind of start: picking the item up (plan or straight to work), handing it to QA, closing it as done.
    /// Switching between them swaps the text; edits to each survive switching back.
    private var pickupPrompt = PromptText()
    private var qaPrompt = PromptText()
    private var donePrompt = PromptText()
    private(set) var options: StartOptions?
    var moveAdo = true
    var assignToMe = true

    /// A prompt the server or the template can fill until Koen types in it.
    private struct PromptText: Equatable {
        var text = ""
        var edited = false

        mutating func offer(_ suggestion: String) {
            if !edited { text = suggestion }
        }
    }

    init(item: WorkItemSummary, fromBrowse: Bool, config: AppConfig?, worktrees: [Worktree]) {
        self.item = item
        offersAssign = !item.assignedToMe
        worktree = worktrees.first { $0.canStart }?.id
        donePrompt.offer(Self.fallbackDonePrompt(for: item))
        if let config { applyConfig(config) }
        reconcile(with: worktrees)
    }

    static func fallbackDonePrompt(for item: WorkItemSummary) -> String {
        "Close AB#\(item.id) as Done without QA and write down why."
    }

    private var currentPrompt: WritableKeyPath<StartThreadDraft, PromptText> {
        switch mode {
        case .qa: \StartThreadDraft.qaPrompt
        case .done: \StartThreadDraft.donePrompt
        case .plan, .default: \StartThreadDraft.pickupPrompt
        }
    }

    /// The first message for the current mode.
    var prompt: String {
        get { self[keyPath: currentPrompt].text }
        set {
            self[keyPath: currentPrompt].text = newValue
            self[keyPath: currentPrompt].edited = true
        }
    }

    /// Plan and straight-to-work share the text; QA and Done each have their own.
    /// A handoff also picks the worktree the item last ran in.
    mutating func setMode(_ newMode: StartMode) {
        mode = newMode
        if newMode.isHandoff, let qaWorktree = options?.qaWorktree { worktree = options?.qaWorkspaceId ?? qaWorktree }
    }

    /// GET /api/items/:id/start arrived: the server's prompts replace the local ones unless Koen edited them.
    mutating func applyStartOptions(_ options: StartOptions) {
        self.options = options
        pickupPrompt.offer(options.prompts.pickup)
        qaPrompt.offer(options.prompts.qa)
        if let done = options.prompts.done { donePrompt.offer(done) }
        if mode.isHandoff, let qaWorktree = options.qaWorktree { worktree = options.qaWorkspaceId ?? qaWorktree }
    }

    /// The line under "Begin with" for a handoff; nil for plan and straight to work.
    var modeHint: String? {
        switch mode {
        case .qa:
            let branch = options?.branch.map { " on \($0)" } ?? ""
            return "Runs the ado-update-for-qa skill\(branch): notes, proof and PR link on the item, then Code Review. "
                + "Once the PR is merged it moves the item to Ready For QA."
        case .done:
            return "For work QA doesn't need to test. The agent checks it's finished, writes why in the item's notes "
                + "and a comment, then moves it to Done. It stops and asks if anything still needs QA."
        case .plan, .default:
            return nil
        }
    }

    var selectedModel: ModelOption? { models.first { $0.id == model } }

    /// Picking a model resets the reasoning level to that model's default.
    mutating func selectModel(_ id: String) {
        guard let option = models.first(where: { $0.id == id }) else { return }
        model = id
        effort = option.defaultEffort.flatMap { wanted in option.efforts.contains { $0.id == wanted } ? wanted : nil }
            ?? option.efforts.first?.id
    }

    /// The in-progress state to offer, or nil when ADO is already there or a handoff sets the state (the toggle hides).
    var moveTarget: String? { mode.isHandoff ? nil : WorkflowRules.startMoveTarget(for: item) }

    /// Keeps the picked worktree only while it is still free; otherwise picks the first free one.
    mutating func reconcile(with worktrees: [Worktree]) {
        let free = worktrees.filter { $0.canStart }
        if let picked = free.first(where: { $0.id == worktree || $0.name == worktree }) { selectWorktree(picked); return }
        if let first = free.first { selectWorktree(first) } else { worktree = nil }
    }

    /// Fills in what the config decides: the prompt, the models and the server's remembered pick.
    mutating func applyConfig(_ config: AppConfig) {
        if options == nil { pickupPrompt.offer(WorkflowRules.fillPrompt(config.promptTemplate, item: item)) }
        agent = config.defaultAgent
        fallbackModels = config.models
        models = config.models
        if selectedModel == nil, let first = config.defaultModel.flatMap({ id in config.models.first { $0.id == id } }) ?? config.models.first {
            selectModel(first.id)
        }
    }

    mutating func selectWorktree(_ workspace: Worktree) {
        worktree = workspace.id
        modelsRequired = workspace.models != nil
        models = workspace.models ?? fallbackModels
        if selectedModel == nil {
            if let preferred = workspace.defaultModel.flatMap({ id in models.first { $0.id == id } }) ?? models.first { selectModel(preferred.id) }
            else { model = nil; effort = nil }
        } else if let selected = selectedModel, let effort, !selected.efforts.contains(where: { $0.id == effort }) {
            selectModel(selected.id)
        }
    }

    var modelGroups: [(title: String, models: [ModelOption])] { models.modelGroups }

    func request() -> StartThreadRequest? {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let worktree, !text.isEmpty, !modelsRequired || !models.isEmpty else { return nil }
        let usesModels = !models.isEmpty
        guard !usesModels || model != nil else { return nil }
        let effort = selectedModel?.efforts.contains { $0.id == self.effort } == true ? self.effort : nil
        return StartThreadRequest(
            itemId: item.id,
            worktree: worktree,
            model: usesModels ? model : nil,
            effort: usesModels ? effort : nil,
            agent: usesModels ? nil : agent,
            mode: mode,
            prompt: text,
            moveAdoTo: moveAdo ? moveTarget : nil,
            assignToMe: offersAssign && assignToMe
        )
    }
}

extension AppConfig {
    var modelGroups: [(title: String, models: [ModelOption])] { models.modelGroups }
}

extension Array where Element == ModelOption {
    /// "Recent", then each provider for the rest, in the server's order.
    var modelGroups: [(title: String, models: [ModelOption])] {
        var groups: [(String, [ModelOption])] = []
        let recent = self.filter(\.recent)
        if !recent.isEmpty { groups.append(("Recent", recent)) }
        let rest = self.filter { !$0.recent }
        for provider in [ModelProvider.codex, .claude, .other] {
            let matching = rest.filter { $0.provider == provider }
            if !matching.isEmpty { groups.append((provider == .other ? "Other" : provider.rawValue, matching)) }
        }
        return groups
    }
}
