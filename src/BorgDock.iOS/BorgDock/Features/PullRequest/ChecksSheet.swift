import SwiftUI

/// Why each check failed without opening a log: the step that broke and the error, from the server's CI failure
/// rules over the job log tails. Rerun failed, or hand the failures to Claude.
struct ChecksSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let key: PrKey

    var body: some View {
        let detail = app.focus.details[key.key]
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Checks").font(.system(size: 26, weight: .bold)).tracking(-0.4).foregroundStyle(BD.text)
                        if let detail {
                            Text(detail.checks.sentence)
                                + Text(" · ")
                                + Text(detail.headSha.shortSha).font(.system(size: 15, design: .monospaced))
                        }
                    }
                    .font(.system(size: 14.5))
                    .foregroundStyle(BD.text2)
                    Spacer()
                    GlassIconButton(systemImage: "xmark", label: "Close", size: 48) { dismiss() }
                }
                .padding(.leading, 24)
                .padding(.trailing, 16)
                .padding(.top, 22)
                .padding(.bottom, 14)

                if let detail {
                    ChecksContent(detail: detail, files: app.focus.files[key.key]?.files ?? [], cardFill: BD.card2)
                        .padding(.horizontal, 16)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
                }
            }
            .padding(.bottom, 100)
        }
        .background(BD.sheet)
        .tint(BD.text)
        .safeAreaInset(edge: .bottom) {
            if let detail {
                ChecksActions(detail: detail)
                    .padding(.horizontal, 16)
                    .padding(.top, 24)
                    .padding(.bottom, 4)
                    .background(LinearGradient(colors: [BD.sheet.opacity(0), BD.sheet], startPoint: .top, endPoint: .center))
            }
        }
        .task { if detail == nil { await app.focus.loadDetail(key) } }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}

/// Rerun failed and Hand to Claude.
struct ChecksActions: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail

    var body: some View {
        let busy = app.busy.contains("rerun-\(detail.key)")
        HStack(spacing: 12) {
            Button { Task { await app.focus.rerunFailed(detail.summary.prKey) } } label: {
                Label(busy ? "Restarting…" : "Rerun failed", systemImage: "arrow.counterclockwise")
            }
            .buttonStyle(.bd(.plain))
            .disabled(busy || detail.checks.failed == 0)
            Button { handToClaude() } label: { Label("Hand to Claude", systemImage: "sparkle") }
                .buttonStyle(.bdPrimary)
                .disabled(detail.checks.failed == 0)
        }
    }

    /// Only this PR's failures: one that is red on the base branch too isn't the agent's to fix.
    private func handToClaude() {
        let own = detail.checkRuns.filter { $0.state == .failure && $0.failure?.alsoOnBase == nil }
        let lines = own.map { run in
            var line = "- \(run.name)"
            if let failure = run.failure {
                if let step = failure.step { line += " (step \(step))" }
                if let location = failure.location { line += " at \(location)" }
                if let summary = failure.summary { line += ": \(summary)" }
            }
            return line
        }
        let message = "Fix the failing checks on \(detail.key) (branch \(detail.headRef)):\n" + lines.joined(separator: "\n")
        app.router.present(.launch(LaunchContext(itemId: detail.workItemIds.first, prKey: detail.key, message: message, title: "Fix #\(detail.number) checks")))
    }
}

/// Failed checks as cards (the step, the error from the log tail, whether the PR changes the failing spec or main is
/// red too), then the running ones and a row for everything that passed.
struct ChecksContent: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail
    var files: [PrFile] = []
    var cardFill: Color = BD.card
    @State private var showPassed = false

    var body: some View {
        let failed = detail.checkRuns.filter { $0.state == .failure }
        let running = detail.checkRuns.filter { $0.state == .pending }
        let passed = detail.checkRuns.filter { $0.state == .success || $0.state == .neutral || $0.state == .skipped }
        VStack(spacing: 8) {
            ForEach(failed) { FailedCheckCard(detail: detail, run: $0, files: files, fill: cardFill) }
            if !running.isEmpty || !passed.isEmpty {
                PrGroupCard(indent: 40, fill: cardFill) {
                    ForEach(running) { run in
                        CheckRunRow(icon: "circle.dashed", color: BD.blue, title: run.name, trailing: "running " + ShortTime.age(run.startedAt))
                    }
                    if !passed.isEmpty {
                        Button { withAnimation(.snappy) { showPassed.toggle() } } label: {
                            CheckRunRow(icon: "checkmark.circle", color: BD.green, title: "\(passed.count) passed", secondary: true,
                                        chevron: showPassed ? "chevron.down" : "chevron.right")
                        }
                        .buttonStyle(.plain)
                    }
                    if showPassed {
                        ForEach(passed) { run in
                            Link(destination: URL(string: run.url) ?? URL(string: detail.url)!) {
                                CheckRunRow(icon: run.state == .success ? "checkmark" : "minus", color: BD.text3, title: run.name, trailing: CheckDuration.text(run.durationSeconds), small: true)
                            }
                        }
                    }
                }
            }
            if detail.checkRuns.isEmpty {
                Text("No checks ran on this commit.").font(.system(size: 14)).foregroundStyle(BD.text2).frame(maxWidth: .infinity).padding(.vertical, 16)
            }
        }
    }
}

struct CheckRunRow: View {
    let icon: String
    let color: Color
    let title: String
    var trailing: String?
    var secondary = false
    var chevron: String?
    var small = false

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: icon).font(.system(size: small ? 13 : 16, weight: .medium)).foregroundStyle(color).frame(width: 22)
            Text(title).font(.system(size: small ? 14 : 14.5)).foregroundStyle(secondary ? BD.text2 : BD.text).lineLimit(1)
            Spacer(minLength: 8)
            if let trailing { Text(trailing).font(.system(size: 12.5)).foregroundStyle(BD.text3) }
            if let chevron { Image(systemName: chevron).font(.system(size: 12, weight: .semibold)).foregroundStyle(BD.text3) }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: small ? 38 : 46)
        .contentShape(Rectangle())
    }
}

/// One failed job: its name and duration, the step that broke, the error excerpt, and why it may not be this PR's doing.
struct FailedCheckCard: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail
    let run: CheckRun
    var files: [PrFile] = []
    var fill: Color = BD.card

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "xmark.circle").font(.system(size: 17, weight: .medium)).foregroundStyle(BD.red).frame(width: 18)
                Text(run.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                Spacer(minLength: 6)
                Text(CheckDuration.text(run.durationSeconds)).font(.system(size: 12.5, weight: .medium)).foregroundStyle(BD.text3)
            }
            Group {
                if let failure = run.failure {
                    if let step = failure.step {
                        Text(step).font(.system(size: 12.5)).foregroundStyle(BD.text2).lineLimit(1).padding(.top, 2)
                    }
                    if let excerpt = FailedCheckCard.excerpt(failure) {
                        LogSnippet(location: nil, text: excerpt).padding(.top, 8)
                    }
                    let changesSpec = FailureFacts.changesSpec(failure, files: files)
                    if changesSpec || failure.alsoOnBase != nil {
                        HStack(spacing: 6) {
                            if changesSpec { ToneChip(text: "This PR changes the spec", small: true, accent: true) }
                            if failure.alsoOnBase != nil { ToneChip(text: "Also red on \(detail.baseRef)", tone: .warn, small: true) }
                        }
                        .padding(.top, 9)
                    }
                } else {
                    Text("Reading the log…").font(.system(size: 12.5)).foregroundStyle(BD.text3).padding(.top, 2)
                }
            }
            .padding(.leading, 26)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 20, fill: fill)
        .contextMenu { menu }
    }

    /// The location line, then the snippet; a snippet that already starts with the location keeps it once.
    static func excerpt(_ failure: CheckFailure) -> String? {
        guard let snippet = failure.snippet ?? failure.summary else { return failure.location }
        guard let location = failure.location, !snippet.hasPrefix(location) else { return snippet }
        return location + "\n" + snippet
    }

    @ViewBuilder
    private var menu: some View {
        Button { Task { await app.focus.rerunFailed(detail.summary.prKey) } } label: { Label("Rerun failed checks", systemImage: "arrow.counterclockwise") }
        Button { app.focus.fixWithClaude(detail.summary) } label: { Label("Hand to Claude", systemImage: "sparkle") }
        if let url = URL(string: run.url) { Link(destination: url) { Label("Open the log", systemImage: "doc.plaintext") } }
        if let groupId = run.failure?.groupId {
            Button { app.router.sheet = nil; app.router.push(.ciGroup(groupId)) } label: { Label("Related CI failure", systemImage: "point.3.connected.trianglepath.dotted") }
        }
    }
}
