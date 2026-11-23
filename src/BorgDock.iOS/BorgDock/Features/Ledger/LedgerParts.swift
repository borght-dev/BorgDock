import SwiftUI
import UIKit

extension LedgerContext {
    /// Who is looking, from what the list was read with: the accounts' logins and teams, everyone the list names, and
    /// which red pull requests are red by a failure they share with others.
    @MainActor
    init(focus: Focus, app: AppModel, now: Date) {
        let store = app.focus
        let accounts = app.reviewAccounts
        var people: [String: Person] = [:]
        for person in focus.pullRequests.map(\.author) + accounts { people[person.login.lowercased()] = person }
        let ciOf = CiLens.lookup(store.ciGroups, focus.pullRequests)
        self.init(
            logins: Set(store.myLogins.map { $0.lowercased() } + accounts.map { $0.login.lowercased() }),
            teams: Array(Set((focus.teams ?? [:]).values.flatMap { $0 })).sorted(),
            now: now,
            people: people,
            failsOutside: { ciOf($0)?.outside == true }
        )
    }
}

/// Which folding sections you opened; the others stay folded. Kept as one line in the app's settings.
struct LedgerFolds: RawRepresentable, Equatable {
    static let key = "ledger.openSections"

    private(set) var open: Set<String> = []

    init() {}

    init(rawValue: String) {
        open = Set(rawValue.split(separator: ",").map(String.init))
    }

    var rawValue: String { open.sorted().joined(separator: ",") }

    func isFolded(_ section: LedgerSection) -> Bool { section.folds && !open.contains(section.rawValue) }

    mutating func toggle(_ section: LedgerSection) {
        if open.contains(section.rawValue) { open.remove(section.rawValue) } else { open.insert(section.rawValue) }
    }
}

/// The work items the rows name, read from Azure DevOps once each: a row shows the type's colour, the long press the
/// title. Without Azure DevOps the rows keep a grey mark.
@MainActor
@Observable
final class LedgerWorkItems {
    private(set) var byId: [Int: WorkItemSummary] = [:]
    @ObservationIgnored private var asked: Set<Int> = []

    func load(_ ids: [Int], from session: DirectSession?) async {
        guard let session, session.hasAzureDevOps else { return }
        let missing = ids.filter { !asked.contains($0) }
        guard !missing.isEmpty else { return }
        asked.formUnion(missing)
        guard let found = try? await session.workItems.summaries(missing) else {
            // Azure DevOps didn't answer: the next list asks again.
            asked.subtract(missing)
            return
        }
        for item in found { byId[item.id] = item }
    }

    /// After Azure DevOps is connected or changed.
    func forget() {
        byId = [:]
        asked = []
    }
}

/// A section's header: its name and count, Start review on To review, a chevron on the sections that fold. Pins
/// under the title bar while its rows scroll.
struct LedgerSectionHeader: View {
    let title: String
    var count: Int?
    /// Nil on a section that doesn't fold.
    var folded: Bool?
    var toggle: () -> Void = {}
    var startReview: (() -> Void)?
    var startDisabled = false
    /// For UI tests. It goes on the header's own element: an identifier on a container replaces the ones inside it.
    var identifier = ""

    var body: some View {
        HStack(spacing: 7) {
            if folded != nil {
                Button(action: toggle) {
                    HStack(spacing: 7) {
                        label
                        Spacer(minLength: 8)
                        Image(systemName: folded == true ? "chevron.right" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(BD.text3)
                    }
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(folded == true ? "Shows the pull requests" : "Folds the section")
                .accessibilityIdentifier(identifier)
            } else {
                label.accessibilityIdentifier(identifier)
                Spacer(minLength: 8)
                if let startReview {
                    Button(action: startReview) {
                        Label("Start review", systemImage: "eye")
                            .labelStyle(TightLabelStyle(spacing: 5))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(startDisabled ? BD.text3 : BD.onAccent)
                            .padding(.horizontal, 12)
                            .frame(height: 30)
                            .background(startDisabled ? BD.fill : BD.accent, in: Capsule())
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(startDisabled)
                    .accessibilityIdentifier("ledger-start-review")
                }
            }
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(BD.text2)
        .textCase(nil)
        .padding(.horizontal, 16)
        .frame(height: 38)
        .frame(maxWidth: .infinity)
        .background(BD.bg.opacity(0.86))
        .background(.ultraThinMaterial)
        .listRowInsets(EdgeInsets())
    }

    private var label: some View {
        HStack(spacing: 7) {
            Text(title).lineLimit(1)
            if let count { Text(verbatim: "\(count)").monospacedDigit().foregroundStyle(BD.text3) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The rows of one section or repository, with what you can do to a row: tap, swipe, long press, Merge.
struct LedgerRows: View {
    @Environment(AppModel.self) private var app
    let rows: [LedgerRow]
    let now: Date
    /// The list on screen is old: rows dim and nothing that writes is offered.
    var stale = false
    let workItems: LedgerWorkItems

    var body: some View {
        let held = Set(app.focus.hold.pending.map(\.key.key))
        ForEach(rows) { row in
            let key = row.pr.prKey
            LedgerRowView(
                row: row, now: now,
                workItemType: row.pr.workItemIds.first.flatMap { workItems.byId[$0]?.typeName },
                faded: stale || held.contains(row.pr.key),
                merge: row.section == .ready && !stale ? { app.router.present(.merge(key)) } : nil,
                open: { app.router.push(.pullRequest(key)) }
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(BD.card)
            .listRowSeparatorTint(BD.separator)
            .alignmentGuide(.listRowSeparatorLeading) { _ in 46 }
            .contextMenu { LedgerMenu(row: row, workItems: workItems, stale: stale) }
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                if !stale, row.pr.state == .open {
                    Button { app.router.review([key]) } label: { Label(row.mine ? "Walk through" : "Review", systemImage: "eye") }
                        .tint(BD.accent)
                }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                if !stale, row.pr.state == .open {
                    Button { Task { await app.focus.snoozeUntilTomorrow(key) } } label: { Label("Snooze", systemImage: "moon") }
                        .tint(Color(light: 0x7B7E89, dark: 0x55565E))
                }
            }
        }
    }
}

/// The long press: review it, run through the author's others, open its work item, snooze, share.
struct LedgerMenu: View {
    @Environment(AppModel.self) private var app
    let row: LedgerRow
    let workItems: LedgerWorkItems
    var stale = false

    var body: some View {
        let pr = row.pr
        let focus = app.focus
        if pr.state == .open, !stale {
            Section {
                if row.mine {
                    Button { app.router.review([pr.prKey]) } label: { Label("Walk through this pull request", systemImage: "eye") }
                    if pr.checks.failed > 0, app.canRerunChecks(of: pr) {
                        Button { Task { await focus.rerunFailed(pr.prKey) } } label: {
                            Label {
                                Text(pr.checks.failed == 1 ? "Rerun the failed check" : "Rerun \(pr.checks.failed) failed checks")
                                Text(failedNames(pr))
                            } icon: {
                                Image(systemName: "arrow.counterclockwise")
                            }
                        }
                    }
                } else {
                    Button { app.router.review([pr.prKey]) } label: { Label("Review this pull request", systemImage: "eye") }
                    let others = authorRunCount(pr)
                    if others > 1 {
                        Button { app.router.reviewAuthor(pr.author.login, first: pr.prKey) } label: {
                            Label("Review \(pr.author.firstName)'s \(others), oldest first", systemImage: "person.2")
                        }
                    }
                }
            }
        }
        if !pr.workItemIds.isEmpty {
            Section {
                ForEach(pr.workItemIds.prefix(2), id: \.self) { id in
                    Button { app.openWorkItem(ItemRoute(id: id, prefill: workItems.byId[id]), from: pr.prKey) } label: {
                        Label {
                            Text(verbatim: "Open AB#\(id)")
                            if let title = workItems.byId[id]?.title { Text(title) }
                        } icon: {
                            Image(systemName: "checklist")
                        }
                    }
                }
            }
        }
        Section {
            if pr.state == .open, !stale {
                Button { Task { await focus.snoozeUntilTomorrow(pr.prKey) } } label: { Label("Snooze until tomorrow", systemImage: "moon") }
            }
            Button {
                UIPasteboard.general.string = pr.url
                app.toasts.show("Copied the link to #\(pr.number)")
            } label: { Label("Copy link", systemImage: "link") }
            Button { focus.openOnGitHub(pr) } label: { Label("Open on GitHub", systemImage: "arrow.up.right.square") }
        }
    }

    /// How many of the author's pull requests the run would take: the same count the old list's Review all gave.
    private func authorRunCount(_ pr: PrSummary) -> Int {
        guard !pr.isDraft, let all = app.focus.focus?.pullRequests else { return 0 }
        let plan = AuthorRun.plan(AuthorRun.candidates(all, author: pr.author.login, myLogins: app.focus.myLogins), fit: app.focus.runWorld.fit)
        return plan.queue.count + plan.checking.count
    }

    /// "e2e · chromium 2/4 and lint".
    private func failedNames(_ pr: PrSummary) -> String {
        let names = (pr.failedChecks ?? []).map(\.name)
        switch names.count {
        case 0: return ""
        case 1: return names[0]
        case 2: return "\(names[0]) and \(names[1])"
        default: return "\(names[0]) and \(names.count - 1) more"
        }
    }
}
