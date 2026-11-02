import SwiftUI

/// A workstream, read-only on the phone: the goal, the outcomes it needs with the live evidence behind each, and
/// its decisions. Only live evidence verifies an outcome, as on the desktop; edits stay on the desktop.
struct WorkstreamView: View {
    @Environment(AppModel.self) private var app
    let id: String
    @State private var openDecision: Workstream.Decision?
    @State private var showingMembers = false

    private var notes: NotesStore { app.notes }

    var body: some View {
        Group {
            if let workstream = notes.workstream(id) {
                content(workstream)
            } else if notes.isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView(
                    "Workstream not found",
                    systemImage: "target",
                    description: Text(notes.location == nil ? "Choose your vault in Notes to see workstreams." : "It isn't in BorgDock Workstreams next to your notes.")
                )
            }
        }
        .background(BD.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .toolbar(.hidden, for: .tabBar)
        .sheet(item: $openDecision) { decision in
            if let workstream = notes.workstream(id) { DecisionSheet(workstream: workstream, decision: decision) }
        }
        .sheet(isPresented: $showingMembers) {
            if let workstream = notes.workstream(id) { MembersSheet(workstream: workstream) }
        }
        .task(id: id) {
            if notes.workstream(id) == nil { await notes.reload() }
            if let workstream = notes.workstream(id) { await notes.resolve(keys: workstream.resolvableKeys) }
        }
        .refreshable {
            await notes.reload()
            if let workstream = notes.workstream(id) { await notes.resolve(keys: workstream.resolvableKeys) }
        }
    }

    private func content(_ workstream: Workstream) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Workstream")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BD.text2)
                Text(workstream.title)
                    .font(.system(size: 28, weight: .bold))
                    .tracking(-0.4)
                    .foregroundStyle(BD.text)
                    .padding(.top, 2)
                if !workstream.goal.isEmpty {
                    Text(workstream.goal)
                        .font(.system(size: 17))
                        .foregroundStyle(BD.text2)
                        .padding(.top, 8)
                }
                ProgressLine(workstream: workstream)
                    .padding(.top, 18)

                if !workstream.outcomes.isEmpty {
                    sectionHeader("Outcomes")
                    VStack(spacing: 0) {
                        ForEach(Array(workstream.outcomes.enumerated()), id: \.element.id) { index, outcome in
                            if index > 0 { Divider().overlay(BD.separator).padding(.leading, 62) }
                            OutcomeRow(workstream: workstream, outcome: outcome, resolved: notes.resolved)
                        }
                    }
                    .bdCard()
                }

                if !workstream.decisions.isEmpty {
                    sectionHeader("Decisions")
                    VStack(spacing: 0) {
                        ForEach(Array(workstream.decisions.enumerated()), id: \.element.id) { index, decision in
                            if index > 0 { Divider().overlay(BD.separator).padding(.leading, 20) }
                            Button { openDecision = decision } label: { DecisionRow(workstream: workstream, decision: decision) }
                                .buttonStyle(.plain)
                        }
                    }
                    .bdCard()
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(BD.text2)
            .padding(.horizontal, 24)
            .padding(.top, 26)
            .padding(.bottom, 10)
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        let mentioning = notes.notes(mentioningWorkstream: id)
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                if let note = mentioning.first { app.router.push(.note(note.path)) }
            } label: { Image(systemName: "doc.text") }
                .disabled(mentioning.isEmpty)
                .accessibilityLabel("Open its note")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { showingMembers = true } label: { Label("Members", systemImage: "list.bullet") }
                Button { UIPasteboard.general.string = "[\(notes.workstream(id)?.title ?? "Workstream")](borgdock://workstreams/\(id))" } label: {
                    Label("Copy link for a note", systemImage: "link")
                }
            } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("More")
        }
    }
}

/// "2 of 4 verified" with a bar: green verified, blue still open.
struct ProgressLine: View {
    let workstream: Workstream

    var body: some View {
        let total = max(workstream.countedOutcomes.count, 1)
        HStack(spacing: 16) {
            GeometryReader { proxy in
                HStack(spacing: 0) {
                    Rectangle().fill(BD.green).frame(width: proxy.size.width * CGFloat(workstream.verifiedCount) / CGFloat(total))
                    Rectangle().fill(BD.blue).frame(width: proxy.size.width * CGFloat(workstream.openCount) / CGFloat(total))
                    Spacer(minLength: 0)
                }
                .background(BD.fill2)
                .clipShape(Capsule())
            }
            .frame(height: 6)
            Text("\(workstream.verifiedCount) of \(workstream.countedOutcomes.count) verified")
                .font(.system(size: 15))
                .foregroundStyle(BD.text2)
                .fixedSize()
        }
        .accessibilityElement(children: .combine)
    }
}

struct OutcomeRow: View {
    let workstream: Workstream
    let outcome: Workstream.Outcome
    let resolved: [String: ResolvedRef]

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            icon.font(.system(size: 22)).frame(width: 28).padding(.top, 1)
            VStack(alignment: .leading, spacing: 8) {
                Text(outcome.title)
                    .font(.system(size: 17))
                    .foregroundStyle(BD.text)
                    .fixedSize(horizontal: false, vertical: true)
                let evidence = workstream.evidence(for: outcome)
                if !evidence.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(evidence, id: \.self) { key in
                            EvidenceChip(workstream: workstream, key: key, resolved: resolved[key])
                            if outcome.verification.isVerified, resolved[key]?.live == true {
                                Text("live")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(BD.text2)
                                    .padding(.horizontal, 9)
                                    .frame(height: 26)
                                    .background(BD.fill2, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var icon: some View {
        switch outcome.verification.state {
        case .verified, .confirmed:
            Image(systemName: "checkmark.circle").foregroundStyle(BD.green)
        case .invalidated:
            Image(systemName: "xmark.circle").foregroundStyle(BD.red)
        case .unverified:
            Circle()
                .strokeBorder(BD.blue, style: StrokeStyle(lineWidth: 1.8, dash: [3.2, 2.6]))
                .frame(width: 22, height: 22)
        }
    }
}

/// A member as evidence: "#3650 merged", "AB#61044 · your turn", with the tone the source has now.
struct EvidenceChip: View {
    let workstream: Workstream
    let key: String
    let resolved: ResolvedRef?

    var body: some View {
        let tone = resolved?.tone ?? .mute
        HStack(spacing: 4) {
            if isMerged { Image(systemName: "arrow.triangle.merge").font(.system(size: 11, weight: .bold)) }
            Text(text).lineLimit(1)
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(tone == .mute ? BD.text2 : tone.color)
        .padding(.horizontal, 9)
        .frame(height: 26)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .fixedSize()
    }

    private var isMerged: Bool { resolved?.state.lowercased() == "merged" }

    private var reference: String {
        switch workstream.member(key)?.ref {
        case .pullRequest(_, _, let number): "#\(number)"
        case .item(_, _, let id): "AB#\(id)"
        case .thread, .link, .unknown, nil: workstream.member(key)?.label ?? key
        }
    }

    private var text: String {
        guard let resolved else { return reference }
        if case .thread = workstream.member(key)?.ref { return "\(resolved.title) · \(resolved.state)" }
        return resolved.tone == .bad || resolved.tone == .warn ? "\(reference) · \(resolved.state)" : "\(reference) \(resolved.state)"
    }
}

struct DecisionRow: View {
    let workstream: Workstream
    let decision: Workstream.Decision

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(decision.question)
                    .font(.system(size: 17))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                Text(Self.detail(workstream, decision))
                    .font(.system(size: 15))
                    .foregroundStyle(BD.text2)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            if decision.isOpen {
                ToneChip(text: "Needs you", tone: .warn)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    /// "Decided 22 Oct · note "Offline basket decisions"", or "2 alternatives · agent proposal waiting".
    static func detail(_ workstream: Workstream, _ decision: Workstream.Decision) -> String {
        if decision.isOpen {
            var parts = ["\(decision.options.count) alternatives"]
            if workstream.proposal(for: decision) != nil { parts.append("agent proposal waiting") }
            return parts.joined(separator: " · ")
        }
        var parts: [String] = []
        if let at = decision.decidedAt.flatMap(ISODates.parse) {
            parts.append("Decided \(at.formatted(.dateTime.day().month(.abbreviated)))")
        } else {
            parts.append("Decided")
        }
        if let note = NoteText.wikilinkTargets(in: decision.rationale).first,
           let original = decision.rationale.firstMatch(of: /\[\[([^\]|#]+)/)?.output.1 {
            parts.append("note \"\(original.isEmpty ? note : String(original))\"")
        } else if let chosen = decision.chosen, let member = workstream.member(chosen) {
            parts.append(member.label)
        }
        return parts.joined(separator: " · ")
    }
}

/// A decision's alternatives, the agent's proposal and the rationale. Deciding stays on the desktop.
struct DecisionSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let workstream: Workstream
    let decision: Workstream.Decision

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(decision.options, id: \.self) { key in
                        HStack {
                            Text(workstream.member(key)?.label ?? key).foregroundStyle(BD.text)
                            Spacer()
                            if decision.chosen == key { Image(systemName: "checkmark").foregroundStyle(BD.green) }
                            if let proposal = workstream.proposal(for: decision), proposal.choose == key {
                                ToneChip(text: "Proposed", tone: .run, small: true)
                            }
                        }
                    }
                } header: { Text("Alternatives") }
                if let proposal = workstream.proposal(for: decision) {
                    Section {
                        Text(proposal.why).foregroundStyle(BD.text)
                    } header: { Text("The agent's proposal") } footer: {
                        Text("Accept or dismiss it on the desktop; edits merge three-way with your other machines.")
                    }
                }
                if !decision.rationale.isEmpty {
                    Section {
                        NoteInlineText(text: decision.rationale, size: 16) { target in
                            if let path = app.notes.path(forLink: target) {
                                dismiss()
                                app.router.push(.note(path))
                            }
                        }
                    } header: { Text("Why") }
                }
            }
            .navigationTitle(decision.question)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .close) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct MembersSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let workstream: Workstream

    var body: some View {
        NavigationStack {
            List(workstream.members, id: \.key) { member in
                VStack(alignment: .leading, spacing: 4) {
                    Text(app.notes.resolved[member.key]?.title ?? member.label).foregroundStyle(BD.text)
                    HStack(spacing: 6) {
                        Text(member.role.capitalized)
                        if let state = app.notes.resolved[member.key]?.state { Text("· \(state)") }
                    }
                    .font(.system(size: 14))
                    .foregroundStyle(BD.text2)
                }
            }
            .navigationTitle("Members")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button(role: .close) { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// A workstream in the Notes list.
struct WorkstreamRow: View {
    let workstream: Workstream

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "target")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(BD.accent)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(workstream.title).font(.system(size: 17)).foregroundStyle(BD.text).lineLimit(1)
                Text(detail).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 0)
            if workstream.decisions.contains(where: \.isOpen) {
                ToneChip(text: "Needs you", tone: .warn, small: true)
            }
        }
        .contentShape(Rectangle())
    }

    private var detail: String {
        let status = workstream.status == .active ? nil : workstream.status.rawValue.capitalized
        return [status, "\(workstream.verifiedCount) of \(workstream.countedOutcomes.count) verified"].compactMap { $0 }.joined(separator: " · ")
    }
}
