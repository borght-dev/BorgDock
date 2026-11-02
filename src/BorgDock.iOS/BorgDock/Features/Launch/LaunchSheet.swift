import SwiftUI

/// Start an agent anywhere: machine, repository, workspace, model, Plan first, the ADO move and the first message.
/// Every launch is signed with the device key, after Face ID when that preference is on.
struct LaunchSheet: View {
    let context: LaunchContext

    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var model: LaunchModel?
    @State private var starting = false
    @State private var startError: String?
    @FocusState private var messageFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                if let model {
                    LaunchForm(model: model, messageFocused: $messageFocused, startError: startError)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .background(BD.sheet)
            .navigationTitle("Start an agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await start() } } label: {
                        if starting { ProgressView() } else { Text("Start").fontWeight(.semibold) }
                    }
                    .buttonStyle(.glassProminent)
                    .tint(BD.accent)
                    .disabled(model?.canStart != true || starting)
                    .accessibilityIdentifier("launch-start")
                }
            }
        }
        .presentationBackground(BD.sheet)
        .task {
            guard model == nil else { return }
            let item = context.itemId.flatMap { app.itemOverview($0)?.item }
            let fresh = LaunchModel(context: context, item: item)
            model = fresh
            await fresh.load(using: app.api)
        }
    }

    private func start() async {
        guard let model, let request = model.request else { return }
        startError = nil
        guard await app.account.authorize("Start an agent on \(model.machine?.label ?? "your machine")") else { return }
        starting = true
        defer { starting = false }
        do {
            let response = try await app.api.launch(request)
            var message = "Started on \(model.machine?.label ?? "your machine")."
            if let state = response.adoState, let itemId = request.itemId { message += " AB#\(itemId) is now \(state)." }
            if let warning = response.warning { message += " \(warning)" }
            let urls = T3Link.candidates(appLink: response.appLink, link: response.link)
            app.toasts.show(message, link: urls.isEmpty ? nil : ToastCenter.Link(title: "Open in T3", urls: urls))
            // The Live Activity starts here, while the app is in front; the server only push-starts it otherwise.
            _ = LiveActivityController.startAgent(threadId: response.threadId, itemId: request.itemId,
                                                  title: request.title.isEmpty ? "Agent" : request.title, machine: model.machine?.label ?? "")
            app.refreshAfterWrite()
            dismiss()
            app.router.openThread(response.threadId)
        } catch let error as APIError where error.isUnauthorized {
            app.report(error)
        } catch {
            startError = error.localizedDescription
        }
    }
}

private struct LaunchForm: View {
    @Bindable var model: LaunchModel
    var messageFocused: FocusState<Bool>.Binding
    let startError: String?
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let item = model.item {
                itemCard(item)
            } else if !model.title.isEmpty {
                Text(model.title)
                    .font(.system(size: 16, weight: .semibold))
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .bdCard(radius: 20, fill: BD.card2)
                    .padding(.horizontal, 16)
            }
            if let error = model.loadError ?? startError {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(BD.red)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(BD.redSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
            }
            CellGroupHeader(title: "Machine")
            machines
            CellGroup(indent: 52) {
                repositoryRow
                workspaceRow
                modelRow
            }
            .padding(.top, 12)
            CellGroup {
                ToggleCell(title: "Plan first", isOn: $model.planFirst)
                if let target = model.moveTarget {
                    ToggleCell(title: "Move to \(target)", isOn: $model.moveAdo)
                }
            }
            .padding(.top, 12)
            CellGroupHeader(title: "First message")
            TextField("What should the agent do?", text: $model.message, axis: .vertical)
                .font(.system(size: 15.5))
                .lineLimit(4...12)
                .focused(messageFocused)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .bdCard(radius: 20)
                .padding(.horizontal, 16)
                .accessibilityIdentifier("launch-message")
            Text(footnote)
                .font(.system(size: 13))
                .foregroundStyle(BD.text3)
                .padding(.horizontal, 32)
                .padding(.top, 8)
                .padding(.bottom, 24)
        }
        .padding(.top, 4)
    }

    private var footnote: String {
        if model.continuesThread { return "The agent continues where it left off, with the same model." }
        if model.planFirst { return "The agent proposes a plan first and waits for your go-ahead." }
        return "The agent starts working straight away."
    }

    private func itemCard(_ item: WorkItemSummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 7) {
                WorkItemGlyph(typeName: item.typeName)
                Text("\(item.type.label(typeName: item.typeName)) · AB#\(String(item.id)) · \(item.state)")
            }
            .font(.system(size: 13))
            .foregroundStyle(BD.text2)
            Text(item.title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(BD.text)
                .lineLimit(2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 20, fill: BD.card2)
        .padding(.horizontal, 16)
    }

    private var machines: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if model.machines.isEmpty {
                    Text(model.targets == nil ? "Loading machines…" : "No machines yet. Add one in Settings.")
                        .font(.system(size: 14))
                        .foregroundStyle(BD.text3)
                        .padding(.vertical, 20)
                }
                ForEach(model.machines) { machine in
                    MachineCard(machine: machine, selected: machine.id == model.machineId) {
                        model.machineId = machine.id
                        Task { await model.loadBranches(using: app.api) }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollClipDisabled()
    }

    private var repositoryRow: some View {
        Menu {
            Picker("Repository", selection: Binding(get: { model.projectId }, set: { id in
                model.projectId = id
                Task { await model.loadBranches(using: app.api) }
            })) {
                ForEach(model.projects) { project in
                    Text(project.repository ?? project.title).tag(Optional(project.id))
                }
            }
        } label: {
            Cell(title: "Repository", value: model.project.map { $0.repository ?? $0.title } ?? "None", chevron: true) {
                rowIcon("folder")
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("launch-repository")
    }

    private var workspaceRow: some View {
        Menu {
            Section("New worktree") {
                Button("Default branch") { model.workspace = .newWorktree(branch: nil) }
                ForEach(model.branches?.branches.prefix(20).map { $0 } ?? [], id: \.self) { branch in
                    Button(branch) { model.workspace = .newWorktree(branch: branch) }
                }
            }
            if !model.threads.isEmpty {
                Section("Continue a thread") {
                    ForEach(model.threads) { thread in
                        Button("\(thread.place) · \(thread.title)") { model.workspace = .thread(id: thread.id, mode: .continue) }
                    }
                }
                Section("New thread beside one") {
                    ForEach(model.threads) { thread in
                        Button(thread.place) { model.workspace = .thread(id: thread.id, mode: .beside) }
                    }
                }
            }
        } label: {
            Cell(title: "Workspace", value: model.workspaceLabel, chevron: true) {
                rowIcon("arrow.triangle.branch")
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("launch-workspace")
    }

    private var modelRow: some View {
        Menu {
            Picker("Model", selection: $model.modelId) {
                ForEach(model.models) { option in
                    Text(option.label).tag(Optional(option.id))
                }
            }
            if let efforts = model.model?.efforts, !efforts.isEmpty {
                Picker("Effort", selection: $model.effort) {
                    ForEach(efforts) { effort in
                        Text(effort.label).tag(Optional(effort.id))
                    }
                }
            }
        } label: {
            Cell(title: "Model", value: model.continuesThread ? "Thread's model" : model.modelLabel, chevron: true) {
                rowIcon("sparkle")
            }
        }
        .buttonStyle(.plain)
        .disabled(model.continuesThread)
    }

    private func rowIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 18))
            .foregroundStyle(BD.text2)
            .frame(width: 24)
    }
}

/// A machine to pick: selected in indigo, offline greyed with when it was last seen.
private struct MachineCard: View {
    let machine: Machine
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 5) {
                Image(systemName: machine.symbol)
                    .font(.system(size: 17))
                    .foregroundStyle(selected ? BD.accentText : BD.text2)
                Text(machine.label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                if machine.online {
                    Text("● online · \(machine.threads)")
                        .font(.system(size: 12.5))
                        .foregroundStyle(BD.green)
                } else {
                    Text("offline \(CompactTime.ago(machine.lastSeenAt))")
                        .font(.system(size: 12.5))
                        .foregroundStyle(BD.text3)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(width: 112, alignment: .leading)
            .background(selected ? BD.accentSoft : BD.fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                if selected {
                    RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(BD.accent, lineWidth: 1.5)
                }
            }
            .opacity(machine.online ? 1 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!machine.online)
        .accessibilityLabel("\(machine.label), \(machine.online ? "online" : "offline")")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
