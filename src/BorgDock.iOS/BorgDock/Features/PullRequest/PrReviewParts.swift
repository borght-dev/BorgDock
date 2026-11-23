import SwiftUI

// BorgDock Review's parts of the pull request page (design/review-app/mockups.html, "A pull request"): the track and
// the work item under the title, who reviews, how much there is to read, and Merge next to Start review.

/// Checks, review, merge as three steps, and the size: what the overview's row packs into its check bar and reason.
struct PrTrackLine: View {
    let detail: PrDetail
    let openChecks: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: openChecks) {
                PrTrackView(steps: steps)
                    .frame(minHeight: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows the checks")
            .accessibilityIdentifier("pr-track")
            Spacer(minLength: 6)
            DiffStat(additions: detail.additions, deletions: detail.deletions)
        }
    }

    /// While your review is asked the middle step is yours, whoever else approved already.
    private var steps: [PrTrackStep] {
        var steps = detail.summary.track
        if steps.count == 3, detail.requestedFromYou, !detail.isMine, detail.state == .open {
            steps[1] = PrTrackStep(label: "Your review", mark: .yours)
        }
        return steps
    }
}

/// The work item a pull request is for, as a card under its title: type, number, state and title. It opens the item
/// as a sheet. Without Azure DevOps only the number is known.
struct PrWorkItemCard: View {
    let id: Int
    let item: WorkItemSummary?
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        if let item {
                            WorkItemGlyph(typeName: item.typeName, size: 10)
                            Text(verbatim: "\(item.type.label(typeName: item.typeName)) · AB#\(id)")
                        } else {
                            RoundedRectangle(cornerRadius: 2.5).fill(BD.text3).frame(width: 10, height: 10)
                            Text(verbatim: "AB#\(id)")
                        }
                        Spacer(minLength: 6)
                        if let item { ToneChip(text: item.state, tone: item.stateTone, small: true) }
                    }
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(BD.text2)
                    .lineLimit(1)
                    Text(item?.title ?? "Open the work item")
                        .font(.system(size: 15, weight: .semibold))
                        .tracking(-0.15)
                        .foregroundStyle(item == nil ? BD.text2 : BD.text)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
            }
            .padding(.leading, 14)
            .padding(.trailing, 12)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .bdCard(radius: 18)
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(verbatim: item.map { "\($0.type.label(typeName: $0.typeName)) AB#\(id), \($0.state), \($0.title)" } ?? "Work item AB#\(id)"))
        .accessibilityHint("Opens the work item")
        .accessibilityIdentifier("pr-work-item-\(id)")
    }
}

extension WorkItemSummary {
    /// The colour of a state chip: red once it failed, blue while someone works on it, green when done.
    var stateTone: Tone {
        if state.lowercased().contains("failed") { return .bad }
        switch stateCategory {
        case .inProgress, .resolved: return .run
        case .completed: return .ok
        default: return .mute
        }
    }
}

/// "Checks  2 of 24 failing  ↻ Rerun failed": the Checks label with the rerun on it when this account's token may.
struct PrChecksLabel: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail

    var body: some View {
        let busy = app.busy.contains("rerun-\(detail.key)")
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("Checks").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text2)
            Text(ChecksLabel.text(detail.checkRuns)).font(.system(size: 13, weight: .medium)).foregroundStyle(BD.text3)
            Spacer(minLength: 6)
            if detail.state == .open, detail.checks.failed > 0, app.canRerunChecks(of: detail.summary) {
                Button { Task { await app.focus.rerunFailed(detail.summary.prKey) } } label: {
                    Label(busy ? "Restarting…" : "Rerun failed", systemImage: "arrow.counterclockwise")
                        .labelStyle(TightLabelStyle(spacing: 4))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BD.accentText)
                        .frame(minHeight: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .accessibilityIdentifier("pr-rerun-failed")
            }
        }
        .lineLimit(1)
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 2)
    }
}

/// Who was asked, who answered, and whether commits came after an approval.
struct PrReviewersSection: View {
    @Environment(AppModel.self) private var app
    let rows: [PrReviewerRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PrSectionLabel(title: "Reviewers", trailing: PrReviewers.summary(rows))
            PrGroupCard(indent: 58) {
                ForEach(rows) { row in
                    HStack(spacing: 12) {
                        avatar(row)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(row.name).font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                            if !row.detail.isEmpty {
                                Text(row.detail).font(.system(size: 13)).foregroundStyle(BD.text2).lineLimit(1)
                            }
                        }
                        Spacer(minLength: 8)
                        chip(row.status)
                    }
                    .padding(.horizontal, 14)
                    .frame(minHeight: 56)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("pr-reviewer-\(row.id)")
                }
            }
            .padding(.horizontal, 16)
        }
    }

    @ViewBuilder
    private func avatar(_ row: PrReviewerRow) -> some View {
        if row.isTeam {
            Image(systemName: "person.2.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(BD.text2)
                .frame(width: 32, height: 32)
                .background(BD.fill2, in: Circle())
                .accessibilityHidden(true)
        } else if row.isYou {
            LedgerAvatar(person: app.reviewAccounts.first ?? Person(login: "me", name: "Me", avatarUrl: nil), mine: true, size: 32)
        } else {
            PersonAvatar(name: row.person?.displayName ?? row.name, size: 32)
        }
    }

    @ViewBuilder
    private func chip(_ status: PrReviewerRow.Status) -> some View {
        switch status {
        case .yours: ToneChip(text: "Your review", small: true, accent: true)
        case .approved: ToneChip(text: "Approved", tone: .ok, systemImage: "checkmark", small: true)
        case .changesRequested: ToneChip(text: "Changes requested", tone: .bad, systemImage: "xmark", small: true)
        case .commented: ToneChip(text: "Commented", small: true)
        case .waiting: ToneChip(text: "Waiting", small: true)
        }
    }
}

/// "What changed  52 files": 12 source, 31 tests, 9 generated. How much there is to read before you start.
struct PrWhatChanged: View {
    let files: [PrFile]

    var body: some View {
        let parts = PrChangeMix.parts(files)
        VStack(alignment: .leading, spacing: 0) {
            PrSectionLabel(title: "What changed", trailing: files.count == 1 ? "1 file" : "\(files.count) files")
            HStack(spacing: 0) {
                ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                    if index > 0 { Rectangle().fill(BD.separator).frame(width: 0.5, height: 30) }
                    VStack(spacing: 1) {
                        Text(verbatim: "\(part.count)")
                            .font(.system(size: 19, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(part.label == "source" ? BD.text : BD.text2)
                        Text(part.label).font(.system(size: 12.5)).foregroundStyle(BD.text2)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.vertical, 12)
            .bdCard(radius: 20)
            .padding(.horizontal, 16)
        }
    }
}

/// Merge and the review, both on every open pull request; the one that is yours to do is the filled one. Merge opens
/// the merge sheet, which says what is still missing.
struct PrReviewBottomBar: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail

    var body: some View {
        let key = detail.summary.prKey
        HStack(spacing: 10) {
            if detail.state != .open {
                if let url = URL(string: detail.url) {
                    Link(destination: url) { Label("Open on GitHub", systemImage: "arrow.up.right.square") }.buttonStyle(.bdPlain)
                }
            } else if mergeLeads {
                secondary(reviewTitle, systemImage: "eye", id: "pr-review") { app.router.review([key]) }
                Button { app.router.present(.merge(key)) } label: { Label(mergeTitle, systemImage: "arrow.triangle.merge") }
                    .buttonStyle(.bdGo)
                    .disabled(detail.isDraft)
                    .accessibilityIdentifier("pr-merge")
            } else {
                if detail.viewerCanMerge {
                    secondary(mergeTitle, systemImage: "arrow.triangle.merge", id: "pr-merge") { app.router.present(.merge(key)) }
                        .disabled(detail.isDraft)
                }
                Button { app.router.review([key]) } label: { Label(reviewTitle, systemImage: "eye") }
                    .buttonStyle(.bdPrimary)
                    .accessibilityIdentifier("pr-review")
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    /// Merging is yours to do on your own pull request, and on one you approved as it is now.
    private var mergeLeads: Bool {
        if detail.isMine { return true }
        return detail.viewerCanMerge && detail.summary.canMerge && detail.summary.isApprovedAtHead(by: Set(app.focus.myLogins.map { $0.lowercased() }))
    }

    private var reviewTitle: String {
        if detail.isMine { return "Walk through" }
        if mergeLeads { return "Review again" }
        return detail.reviewedHeadSha != nil && detail.reviewedHeadSha != detail.headSha ? "Re-review" : "Start review"
    }

    private var mergeTitle: String { detail.autoMerge ? "Auto-merge on" : "Merge" }

    private func secondary(_ title: String, systemImage: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .labelStyle(TightLabelStyle(spacing: 6))
                .font(.system(size: 17, weight: .semibold))
                .lineLimit(1)
                .padding(.horizontal, 10)
                .frame(height: 38)
        }
        .buttonStyle(.glass)
        .tint(BD.text)
        .fixedSize()
        .accessibilityIdentifier(id)
    }
}

extension EnvironmentValues {
    /// A pull request shown inside a work item's sheet: it reads, and leaves reviewing and merging to its own page.
    @Entry var pullRequestPeek = false
}
