import Foundation
import Observation

/// Where and how an agent starts: the desktop's `LaunchTarget` (machine, repository, workspace, model) plus
/// Plan first, the one ADO move BorgDock makes itself, and the first message.
@MainActor
@Observable
final class LaunchModel {
    enum Workspace: Hashable {
        /// A new worktree from a branch; nil lets the server pick the default branch.
        case newWorktree(branch: String?)
        case thread(id: String, mode: LaunchWorkspace.ThreadMode)
    }

    let context: LaunchContext
    let item: WorkItemSummary?
    private(set) var targets: LaunchTargets?
    private(set) var loadError: String?
    private(set) var branches: Branches?

    var machineId: String? { didSet { if oldValue != machineId { machineChanged() } } }
    var projectId: String? { didSet { if oldValue != projectId { projectChanged() } } }
    var workspace: Workspace = .newWorktree(branch: nil)
    var modelId: String? { didSet { if oldValue != modelId { effort = model?.defaultEffort } } }
    var effort: String?
    var planFirst = true
    var moveAdo = true
    var message: String
    var title: String

    init(context: LaunchContext, item: WorkItemSummary?) {
        self.context = context
        self.item = item
        message = context.message.isEmpty ? LaunchModel.defaultMessage(item: item) : context.message
        title = context.title.isEmpty ? (item?.title ?? "") : context.title
        if context.threadId != nil { planFirst = false }
    }

    static func defaultMessage(item: WorkItemSummary?) -> String {
        guard let item else { return "" }
        return item.type == .bug ? "Fix AB#\(item.id): \(item.title)." : "Implement AB#\(item.id): \(item.title)."
    }

    // MARK: Loading

    func load(using api: APIClient) async {
        do {
            let targets = try await api.launchTargets()
            self.targets = targets
            loadError = nil
            applyDefaults(targets)
            await loadBranches(using: api)
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
        }
    }

    func loadBranches(using api: APIClient) async {
        guard let machineId, let projectId else { return }
        branches = try? await api.branches(machineId: machineId, projectId: projectId)
    }

    private func applyDefaults(_ targets: LaunchTargets) {
        let picked = LaunchDefaults.pick(targets: targets, context: context)
        machineId = picked.machineId
        projectId = picked.projectId
        workspace = picked.workspace
        modelId = targets.defaultModel ?? targets.models.first?.id
        effort = model?.defaultEffort
    }

    private func machineChanged() {
        guard let targets, let machineId else { return }
        if project?.machineId != machineId {
            projectId = targets.projects.first { $0.machineId == machineId }?.id
        }
    }

    private func projectChanged() {
        branches = nil
        if case .thread(let id, _) = workspace, thread(id)?.projectId != projectId {
            workspace = .newWorktree(branch: nil)
        }
        if case .newWorktree = workspace { workspace = .newWorktree(branch: nil) }
    }

    // MARK: What the sheet shows

    var machines: [Machine] { targets?.machines ?? [] }
    var machine: Machine? { machines.first { $0.id == machineId } }
    var projects: [LaunchProject] { targets?.projects.filter { $0.machineId == machineId } ?? [] }
    var project: LaunchProject? { targets?.projects.first { $0.id == projectId } }
    var threads: [LaunchThread] { targets?.threads.filter { $0.machineId == machineId && $0.projectId == projectId } ?? [] }
    var models: [ModelOption] { targets?.models ?? [] }
    var model: ModelOption? { models.first { $0.id == modelId } }

    func thread(_ id: String) -> LaunchThread? { targets?.threads.first { $0.id == id } }

    var continuesThread: Bool {
        if case .thread(_, .continue) = workspace { return true }
        return false
    }

    var workspaceLabel: String {
        switch workspace {
        case .newWorktree(let branch):
            "New worktree · \(branch ?? branches?.defaultBranch ?? project?.defaultBranch ?? "default branch")"
        case .thread(let id, let mode):
            "\(mode == .continue ? "Continue" : "Beside") \(thread(id)?.place ?? "thread")"
        }
    }

    var modelLabel: String {
        guard let model else { return "Default" }
        let effortLabel = model.efforts.first { $0.id == effort }?.label.lowercased()
        return [model.label, effortLabel].compactMap { $0 }.joined(separator: " · ")
    }

    /// "Development In Progress" when the item hasn't started yet: the state the thread moves it to.
    var moveTarget: String? { LaunchDefaults.moveTarget(for: item) }

    var canStart: Bool {
        machine?.online == true && project != nil && !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var request: LaunchRequest? {
        guard let machineId, let projectId else { return nil }
        let launchWorkspace: LaunchWorkspace = switch workspace {
        case .newWorktree(let branch): .worktree(baseBranch: branch)
        case .thread(let id, let mode): .thread(threadId: id, mode: mode)
        }
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstLine = trimmed.split(separator: "\n").first.map(String.init) ?? trimmed
        return LaunchRequest(
            machineId: machineId,
            projectId: projectId,
            workspace: launchWorkspace,
            model: continuesThread ? nil : modelId,
            effort: continuesThread ? nil : effort,
            planFirst: planFirst,
            message: trimmed,
            title: title.isEmpty ? String(firstLine.prefix(80)) : title,
            itemId: context.itemId,
            moveAdoTo: moveAdo ? moveTarget : nil,
            prKey: context.prKey,
            ciGroupId: context.ciGroupId
        )
    }
}

/// The sheet's first guesses. Pure, for tests.
enum LaunchDefaults {
    struct Picked: Equatable {
        let machineId: String?
        let projectId: String?
        let workspace: LaunchModel.Workspace
    }

    static func pick(targets: LaunchTargets, context: LaunchContext) -> Picked {
        if let threadId = context.threadId, let thread = targets.threads.first(where: { $0.id == threadId }) {
            return Picked(machineId: thread.machineId, projectId: thread.projectId, workspace: .thread(id: thread.id, mode: .continue))
        }
        let online = targets.machines.filter(\.online)
        let repository = context.prKey.flatMap(PrKey.init(key:)).map { "\($0.owner)/\($0.repo)".lowercased() }
        if let repository, let project = targets.projects.first(where: { project in
            project.repository?.lowercased() == repository && online.contains { $0.id == project.machineId }
        }) {
            return Picked(machineId: project.machineId, projectId: project.id, workspace: .newWorktree(branch: nil))
        }
        let machine = online.first ?? targets.machines.first
        let project = targets.projects.first { $0.machineId == machine?.id }
        return Picked(machineId: machine?.id, projectId: project?.id, workspace: .newWorktree(branch: nil))
    }

    /// The first "in progress" state of an item that hasn't started, else nil.
    static func moveTarget(for item: WorkItemSummary?) -> String? {
        guard let item, item.stateCategory == .proposed else { return nil }
        return item.workflow.first { $0.localizedCaseInsensitiveContains("progress") }
    }
}

extension LaunchContext {
    /// A move is a run: an agent makes it with the repo's skills, which know the notes and fields it needs.
    static func move(itemId: Int, to state: String, title: String?) -> LaunchContext {
        LaunchContext(
            itemId: itemId,
            message: "Move AB#\(itemId) to \(state). Use the repo's skills for the notes and fields the move needs (ado-update-for-qa, ado-dev-in-progress, /ado-fix).",
            title: "Move AB#\(itemId) to \(state)"
        )
    }

    /// Fix out of sync and Sync all: one thread for many items.
    static func sync(itemIds: [Int], outOfSyncOnly: Bool) -> LaunchContext {
        let list = itemIds.map { "AB#\($0)" }.joined(separator: ", ")
        let scope = outOfSyncOnly ? "These items are out of sync with their pull requests and threads" : "Sync every item I'm working on"
        return LaunchContext(
            message: "\(scope): \(list). For each, bring the ADO state and Developer Notes in line with the evidence, using the repo's skills (ado-update-for-qa, ado-dev-in-progress, /ado-fix).",
            title: outOfSyncOnly ? "Fix out of sync" : "Sync all"
        )
    }
}
