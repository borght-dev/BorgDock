import SwiftUI

/// Starts an agent thread on an item in a free worktree, in the background.
struct StartThreadSheet: View {
    let context: StartContext

    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var draft: StartThreadDraft
    @State private var errorMessage: String?
    @State private var warning: String?
    @State private var detent: PresentationDetent = .large
    @FocusState private var promptFocused: Bool

    init(context: StartContext, config: AppConfig?, worktrees: [Worktree]) {
        self.context = context
        var draft = StartThreadDraft(item: context.item, fromBrowse: context.fromBrowse, config: config, worktrees: worktrees)
        draft.setMode(context.initialMode)
        _draft = State(initialValue: draft)
    }

    private var item: WorkItemSummary { context.item }
    private var worktrees: [Worktree] { app.overview?.worktrees ?? [] }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    worktreeField
                    modelField
                    if let model = draft.selectedModel, !model.efforts.isEmpty {
                        effortField(model)
                    }
                    modeField
                    promptField
                    toggles
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.inkRed)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
        }
        .background(Palette.sheet)
        .environment(\.colorScheme, .light)
        .presentationDetents([.large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationBackground(Palette.sheet)
        .onChange(of: worktrees) { _, fresh in draft.reconcile(with: fresh) }
        .task {
            if app.config == nil { await app.loadConfig() }
            if let config = app.config { draft.applyConfig(config) }
            draft.reconcile(with: worktrees)
        }
        .task(id: item.id) { await loadStartOptions() }
        .alert("Started, with a warning", isPresented: Binding(get: { warning != nil }, set: { if !$0 { warning = nil } })) {
            Button("OK") { dismiss() }
        } message: {
            Text(warning ?? "")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Start \(String(item.id)) in T3")
                .appFont(23, weight: .semibold, relativeTo: .title)
                .foregroundStyle(Palette.ink)
            Text(item.title)
                .font(.subheadline)
                .foregroundStyle(Palette.inkSoft)
                .lineLimit(3)
        }
    }

    private var worktreeField: some View {
        let free = worktrees.filter { $0.canStart }.count
        return Field(title: "Worktree", note: worktrees.isEmpty ? nil : "\(free) free") {
            if worktrees.isEmpty {
                Text("Loading worktrees")
                    .font(.footnote)
                    .foregroundStyle(Palette.inkSoft)
            } else {
                let environments = worktrees.reduce(into: [String]()) { ids, worktree in
                    let id = worktree.environmentId ?? ""
                    if !ids.contains(id) { ids.append(id) }
                }
                ForEach(environments, id: \.self) { environment in
                    let group = worktrees.filter { ($0.environmentId ?? "") == environment }
                    VStack(alignment: .leading, spacing: 6) {
                        if let label = group.first?.environmentLabel {
                            Text(label).font(.caption).foregroundStyle(Palette.muted)
                        }
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
                            ForEach(group) { worktree in
                                WorktreeOption(worktree: worktree, isSelected: draft.worktree == worktree.id) {
                                    draft.selectWorktree(worktree)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var modelField: some View {
        let groups = draft.modelGroups
        Field(title: "Model") {
            if groups.isEmpty {
                Text(app.config == nil ? "Loading models" : "This server doesn't offer a model choice yet; it uses its default agent.")
                    .font(.footnote)
                    .foregroundStyle(Palette.inkSoft)
            } else {
                Menu {
                    Picker("Model", selection: Binding(get: { draft.model ?? "" }, set: { draft.selectModel($0) })) {
                        ForEach(groups, id: \.title) { group in
                            Section(group.title) {
                                ForEach(group.models) { model in
                                    Text(model.label).tag(model.id)
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(draft.selectedModel?.label ?? "Pick a model")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Palette.ink)
                            if let model = draft.selectedModel {
                                Text(model.recent ? "\(model.provider.rawValue), used recently" : model.provider.rawValue)
                                    .font(.caption)
                                    .foregroundStyle(Palette.inkSoft)
                            }
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Palette.inkSoft)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 5).fill(Color.white))
                    .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(Palette.line, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Model, \(draft.selectedModel?.label ?? "none")")
            }
        }
    }

    /// Up to four levels fit one segmented row; more wrap onto a grid of the same chips.
    @ViewBuilder
    private func effortField(_ model: ModelOption) -> some View {
        let options = model.efforts.map { ($0.id, $0.label) }
        let selection = Binding(get: { draft.effort ?? "" }, set: { draft.effort = $0 })
        Field(title: "Reasoning") {
            if options.count <= 4 {
                PaperSegmented(options: options, selection: selection)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                    ForEach(model.efforts) { effort in
                        let isOn = draft.effort == effort.id
                        Button { draft.effort = effort.id } label: {
                            Text(effort.label)
                                .font(.subheadline.weight(isOn ? .semibold : .regular))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                                .foregroundStyle(isOn ? Color.white : Palette.ink)
                                .frame(maxWidth: .infinity)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 9)
                                .background(RoundedRectangle(cornerRadius: 4).fill(isOn ? Palette.accent : Color.white))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .strokeBorder(isOn ? Palette.accent : Palette.line, lineWidth: 1)
                                )
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(isOn ? .isSelected : [])
                    }
                }
            }
        }
    }

    private var modeField: some View {
        Field(title: "Begin with") {
            PaperSegmented(
                options: [
                    (StartMode.plan, "A plan for me to approve"),
                    (.default, "Straight to work"),
                    (.qa, "Update for QA"),
                    (.done, "Close as done"),
                ],
                selection: Binding(get: { draft.mode }, set: { mode in
                    draft.setMode(mode)
                    draft.reconcile(with: worktrees)
                }),
                axis: .vertical
            )
            if let hint = draft.modeHint {
                Text(hint)
                    .font(.footnote)
                    .foregroundStyle(Palette.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
        }
    }

    private var promptField: some View {
        Field(title: "First message") {
            TextEditor(text: $draft.prompt)
                .font(.subheadline)
                .foregroundStyle(Palette.ink)
                .scrollContentBackground(.hidden)
                .focused($promptFocused)
                .frame(minHeight: 130, maxHeight: 220)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 5).fill(Color.white))
                .overlay(
                    RoundedRectangle(cornerRadius: 5)
                        .strokeBorder(promptFocused ? Palette.accent : Palette.line, lineWidth: 1)
                )
                .onTapGesture { if detent != .large { detent = .large } }
        }
    }

    @ViewBuilder
    private var toggles: some View {
        if draft.offersAssign || draft.moveTarget != nil {
            VStack(alignment: .leading, spacing: 14) {
                if draft.offersAssign {
                    PaperToggle(
                        title: "Assign to me",
                        detail: item.assignedTo.map { "Currently \($0)." } ?? "Nobody has it yet.",
                        isOn: $draft.assignToMe
                    )
                }
                if let target = draft.moveTarget {
                    PaperToggle(
                        title: "Also move ADO from \(item.state) to \(target)",
                        detail: "Later moves, like Code Review when the PR opens, show up in Out of sync for you to confirm.",
                        isOn: $draft.moveAdo
                    )
                }
            }
        }
    }

    private var footer: some View {
        VStack(spacing: 0) {
            Palette.rule.frame(height: 1)
            HStack(spacing: 12) {
                Button("Cancel") { dismiss() }
                    .buttonStyle(.paper(.secondary))
                Button("Start in background", action: start)
                .buttonStyle(.paper(.primary, size: .large, busy: app.isBusy("start")))
                .disabled(draft.request() == nil || app.isBusy("start"))
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 10)
            }
            .padding(.leading, 20)
        }
        .background(Palette.paperHi)
    }

    /// The server's prompts and QA worktree. On failure the local template stays; only a lost session is reported.
    private func loadStartOptions() async {
        do {
            draft.applyStartOptions(try await app.api.startOptions(itemId: item.id))
            draft.reconcile(with: worktrees)
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error) }
        }
    }

    private func start() {
        guard let request = draft.request() else { return }
        errorMessage = nil
        Task {
            do {
                let response = try await app.start(request)
                if let warning = response.warning {
                    self.warning = warning
                } else {
                    dismiss()
                }
            } catch is CancellationError {
                return
            } catch let error as APIError where error.isUnauthorized {
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                draft.reconcile(with: worktrees)
            }
        }
    }
}

// MARK: - Pieces

private struct Field<Content: View>: View {
    let title: String
    var note: String?
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(title).font(.subheadline.weight(.semibold))
                if let note { Text(note).font(.subheadline).foregroundStyle(Palette.inkSoft) }
            }
            .foregroundStyle(Palette.ink)
            content
        }
    }
}

private struct WorktreeOption: View {
    let worktree: Worktree
    let isSelected: Bool
    let action: () -> Void

    private var isFree: Bool { worktree.canStart }

    private var subtitle: String {
        if worktree.available == false { return "offline" }
        return switch worktree.state {
        case .free: "free"
        case .mine: worktree.itemId.map(String.init) ?? "busy"
        case .busy: "busy"
        }
    }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(worktree.name).appFont(18, relativeTo: .headline)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(isSelected ? Color(hex: 0xC9D4DB) : Palette.inkSoft)
                    .lineLimit(1)
            }
            .foregroundStyle(isSelected ? Color.white : Palette.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 4).fill(isSelected ? Palette.accent : isFree ? Color.white : Color.clear))
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(isSelected ? Palette.accent : Palette.line, lineWidth: 1)
            )
            .opacity(isFree ? 1 : 0.42)
        }
        .buttonStyle(.plain)
        .disabled(!isFree)
        .accessibilityLabel("\(worktree.name), \(subtitle)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

struct PaperSegmented<Value: Hashable>: View {
    let options: [(Value, String)]
    @Binding var selection: Value
    var axis: Axis = .horizontal

    var body: some View {
        Group {
            if axis == .horizontal {
                HStack(spacing: 6) { segments }
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) { segments }
            }
        }
    }

    private var segments: some View {
        ForEach(Array(options.enumerated()), id: \.offset) { _, option in
            let isOn = option.0 == selection
            Button { selection = option.0 } label: {
                Text(option.1)
                    .appFont(12, weight: isOn ? .medium : .regular, relativeTo: .caption)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: axis == .vertical ? 36 : nil)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 9)
                    .foregroundStyle(isOn ? Color.white : Palette.inkSoft)
                    .background(isOn ? Palette.accent : Palette.paper, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(isOn ? Palette.accent : Palette.line))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(isOn ? .isSelected : [])
        }
    }
}

private struct PaperToggle: View {
    let title: String
    let detail: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.ink)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Palette.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Palette.accent)
    }
}
