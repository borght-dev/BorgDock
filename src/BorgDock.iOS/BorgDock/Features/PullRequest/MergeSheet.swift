import SwiftUI

/// The facts a merge rests on (checks, approval, conflicts), the method, the commit message, then a signed merge.
/// With checks still running the button becomes "Merge when ready" (auto-merge).
struct MergeSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let key: PrKey

    @State private var method: MergeMethod?
    @State private var deleteBranch: Bool?
    @State private var commitTitle = ""
    @State private var commitMessage = ""
    @FocusState private var editing: Bool

    var body: some View {
        let detail = app.focus.details[key.key]
        NavigationStack {
            ScrollView {
                if let detail {
                    content(detail)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .background(BD.sheet)
            .navigationTitle("Merge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let detail { footer(detail) }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .tint(BD.text)
        .task {
            let fresh = await app.focus.loadDetail(key) ?? detail
            if let fresh, method == nil { prefill(fresh) }
        }
        .onAppear { if let detail, method == nil { prefill(detail) } }
    }

    private func prefill(_ detail: PrDetail) {
        let saved = UserDefaults.standard.string(forKey: methodKey(detail)).flatMap(MergeMethod.init(rawValue:))
        let chosen = saved.flatMap { detail.allowedMergeMethods.contains($0) ? $0 : nil } ?? detail.defaultMergeMethod
        method = chosen
        deleteBranch = detail.deleteBranchOnMerge
        commitTitle = chosen == .squash ? detail.squashTitle : "Merge pull request #\(detail.number) from \(detail.headRef)"
        commitMessage = DescriptionExcerpt.excerpt(detail.body)
    }

    private func methodKey(_ detail: PrDetail) -> String { "merge.method.\(detail.owner)/\(detail.repo)" }

    private func content(_ detail: PrDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.triangle.pull").font(.system(size: 14, weight: .semibold)).foregroundStyle(BD.green)
                    Text(verbatim: "\(detail.owner)/\(detail.repo)").fontWeight(.semibold).foregroundStyle(BD.text)
                    Text(verbatim: "#\(detail.number)").foregroundStyle(BD.text2)
                }
                .font(.system(size: 15))
                Text(detail.title).font(.system(size: 26, weight: .bold)).tracking(-0.4).foregroundStyle(BD.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 16)

            PrGroupCard(indent: 56) {
                ForEach(facts(detail), id: \.text) { fact in
                    HStack(spacing: 16) {
                        Image(systemName: fact.icon).font(.system(size: 20)).foregroundStyle(fact.tone.color).frame(width: 24)
                        Text(fact.text).font(.system(size: 17)).foregroundStyle(BD.text)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 56)
                }
                Toggle(isOn: Binding(get: { deleteBranch ?? true }, set: { deleteBranch = $0 })) {
                    HStack(spacing: 16) {
                        Image(systemName: "arrow.triangle.branch").font(.system(size: 19)).foregroundStyle(BD.text2).frame(width: 24)
                        Text("Delete").font(.system(size: 17)).foregroundStyle(BD.text)
                        BranchName(name: detail.headRef, size: 13.5)
                    }
                }
                .tint(BD.green)
                .padding(.horizontal, 16)
                .frame(minHeight: 56)
            }
            .padding(.horizontal, 16)

            Picker("Method", selection: Binding(get: { method ?? detail.defaultMergeMethod }, set: { choose($0, detail) })) {
                ForEach(MergeMethod.allCases.filter { detail.allowedMergeMethods.contains($0) }, id: \.self) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .controlSize(.large)
            .padding(.horizontal, 16)
            .padding(.top, 18)

            if method != .rebase {
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Commit title", text: $commitTitle, axis: .vertical)
                        .foregroundStyle(BD.text)
                    TextField("Commit message", text: $commitMessage, axis: .vertical)
                        .foregroundStyle(BD.text3)
                }
                .font(.system(size: 13.5, design: .monospaced))
                .lineSpacing(3)
                .focused($editing)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .bdCard(radius: 18)
                .padding(.horizontal, 16)
                .padding(.top, 14)
            }
        }
        .padding(.bottom, 20)
    }

    private func footer(_ detail: PrDetail) -> some View {
        let busy = app.busy.contains("merge-\(key.key)")
        let whenReady = detail.checks.pending > 0
        return VStack(spacing: 12) {
            Button { Task { await merge(detail) } } label: {
                Label(busy ? "Merging…" : whenReady ? "Merge when ready" : "\((method ?? .squash).verb) and merge", systemImage: "arrow.triangle.merge")
            }
            .buttonStyle(.bdGo)
            .disabled(busy || !detail.viewerCanMerge || detail.mergeable == .conflicting || detail.checks.failed > 0)
            if app.focus.faceIdForActions {
                Label("Confirms with Face ID", systemImage: "faceid").font(.system(size: 14)).foregroundStyle(BD.text3)
            } else if !detail.viewerCanMerge {
                Text("You can't merge in this repository.").font(.system(size: 14)).foregroundStyle(BD.text3)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func choose(_ chosen: MergeMethod, _ detail: PrDetail) {
        let wasSquash = method == .squash
        method = chosen
        UserDefaults.standard.set(chosen.rawValue, forKey: methodKey(detail))
        if chosen == .squash, !wasSquash { commitTitle = detail.squashTitle }
        if chosen == .merge, wasSquash { commitTitle = "Merge pull request #\(detail.number) from \(detail.headRef)" }
    }

    private func merge(_ detail: PrDetail) async {
        editing = false
        let request = MergeRequest(
            method: method ?? detail.defaultMergeMethod,
            commitTitle: commitTitle,
            commitMessage: commitMessage,
            deleteBranch: deleteBranch ?? detail.deleteBranchOnMerge,
            headSha: detail.headSha
        )
        if await app.focus.merge(detail.summary.prKey, request) != nil {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            dismiss()
        }
    }

    private struct Fact { let icon: String; let tone: Tone; let text: String }

    private func facts(_ detail: PrDetail) -> [Fact] {
        let checks = detail.checks
        var facts: [Fact] = []
        if checks.failed > 0 {
            facts.append(Fact(icon: "xmark.circle", tone: .bad, text: "\(checks.failed) check\(checks.failed == 1 ? "" : "s") failing"))
        } else if checks.pending > 0 {
            facts.append(Fact(icon: "circle.dashed", tone: .warn, text: "\(checks.pending) still running, \(checks.passed) passed"))
        } else {
            facts.append(Fact(icon: "checkmark.circle", tone: .ok, text: checks.total == 0 ? "No checks" : "\(checks.passed) checks passed"))
        }
        let approvers = detail.reviews.filter { $0.state == .approved }.map(\.author.displayName)
        if !approvers.isEmpty {
            facts.append(Fact(icon: "checkmark.circle", tone: .ok, text: "Approved by " + ListFormatter.localizedString(byJoining: Array(Set(approvers)).sorted())))
        } else if detail.reviewDecision == .changesRequested {
            facts.append(Fact(icon: "xmark.circle", tone: .bad, text: "Changes requested"))
        } else {
            facts.append(Fact(icon: "exclamationmark.circle", tone: .warn, text: "No approval yet"))
        }
        switch detail.mergeable {
        case .mergeable: facts.append(Fact(icon: "checkmark.circle", tone: .ok, text: "No conflicts with \(detail.baseRef)"))
        case .conflicting: facts.append(Fact(icon: "exclamationmark.triangle", tone: .warn, text: "Conflicts with \(detail.baseRef)"))
        case .unknown: facts.append(Fact(icon: "questionmark.circle", tone: .mute, text: "GitHub is still checking conflicts"))
        }
        return facts
    }
}

extension MergeMethod {
    var title: String {
        switch self {
        case .squash: "Squash"
        case .merge: "Merge"
        case .rebase: "Rebase"
        }
    }

    var verb: String {
        switch self {
        case .squash: "Squash"
        case .merge: "Commit"
        case .rebase: "Rebase"
        }
    }
}
