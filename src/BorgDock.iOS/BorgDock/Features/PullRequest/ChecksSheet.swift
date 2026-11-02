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
                    ChecksContent(detail: detail, cardFill: BD.card2)
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

/// Failed checks as cards, then the running ones and a row for everything that passed.
struct ChecksContent: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail
    var cardFill: Color = BD.card
    @State private var showPassed = false

    var body: some View {
        let failed = detail.checkRuns.filter { $0.state == .failure }
        let running = detail.checkRuns.filter { $0.state == .pending }
        let passed = detail.checkRuns.filter { $0.state == .success || $0.state == .neutral || $0.state == .skipped }
        VStack(spacing: 12) {
            ForEach(failed) { FailedCheckCard(run: $0, baseRef: detail.baseRef, fill: cardFill) }
            if !running.isEmpty || !passed.isEmpty {
                PrGroupCard(indent: 52, fill: cardFill) {
                    ForEach(running) { run in
                        CheckRunRow(icon: "circle.dashed", color: BD.blue, title: run.name, trailing: "running " + ShortTime.age(run.startedAt).replacingOccurrences(of: " min", with: " m"))
                    }
                    if !passed.isEmpty {
                        Button { withAnimation(.snappy) { showPassed.toggle() } } label: {
                            CheckRunRow(icon: "checkmark.circle", color: BD.green, title: "\(passed.count) passed", chevron: showPassed ? "chevron.down" : "chevron.right")
                        }
                        .buttonStyle(.plain)
                    }
                    if showPassed {
                        ForEach(passed) { run in
                            Link(destination: URL(string: run.url) ?? URL(string: detail.url)!) {
                                CheckRunRow(icon: run.state == .success ? "checkmark" : "minus", color: BD.text3, title: run.name, trailing: ShortTime.duration(run.durationSeconds), small: true)
                            }
                        }
                    }
                }
            }
            if detail.checkRuns.isEmpty {
                Text("No checks ran on this commit.").font(.subheadline).foregroundStyle(BD.text2).padding(.top, 20)
            }
        }
    }
}

struct CheckRunRow: View {
    let icon: String
    let color: Color
    let title: String
    var trailing: String?
    var chevron: String?
    var small = false

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: small ? 14 : 19, weight: .medium)).foregroundStyle(color).frame(width: 24)
            Text(title).font(.system(size: small ? 15 : 17)).foregroundStyle(BD.text).lineLimit(1)
            Spacer(minLength: 8)
            if let trailing { Text(trailing).font(.system(size: 14)).foregroundStyle(BD.text3) }
            if let chevron { Image(systemName: chevron).font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3) }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: small ? 40 : 52)
        .contentShape(Rectangle())
    }
}

struct FailedCheckCard: View {
    @Environment(AppModel.self) private var app
    let run: CheckRun
    let baseRef: String
    var fill: Color = BD.card

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "xmark.circle").font(.system(size: 19, weight: .medium)).foregroundStyle(BD.red)
                Text(run.name).font(.system(size: 18, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                Spacer(minLength: 6)
                Text(ShortTime.duration(run.durationSeconds)).font(.system(size: 14)).foregroundStyle(BD.text3)
            }
            if let failure = run.failure {
                HStack(spacing: 6) {
                    if let step = failure.step {
                        (Text("Step ").foregroundStyle(BD.text2) + Text(step).foregroundStyle(BD.text).fontWeight(.medium))
                            .lineLimit(1)
                    }
                    if failure.newInThisPr {
                        Text("·").foregroundStyle(BD.text3)
                        ToneChip(text: "New in this PR", tone: .bad, small: true)
                    }
                }
                .font(.system(size: 15))
                .padding(.top, 6)
                .padding(.leading, 30)
                if let snippet = failure.snippet ?? failure.summary {
                    LogSnippet(location: failure.location, text: snippet, background: BD.fill)
                        .padding(.top, 10)
                        .padding(.leading, 30)
                }
                if let base = failure.alsoOnBase {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle").font(.system(size: 14, weight: .semibold))
                        Text(verbatim: "Also red on \(baseRef). Not this PR.").lineLimit(2)
                        Spacer(minLength: 4)
                        if let person = base.claimedBy {
                            PersonBadge(person: person, size: 22)
                            Text(person.firstName)
                        }
                    }
                    .font(.system(size: 14.5, weight: .medium))
                    .foregroundStyle(BD.yellow)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(BD.yellowSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.top, 10)
                    .padding(.leading, 30)
                }
                if let groupId = failure.groupId {
                    Button { app.router.sheet = nil; app.router.push(.ciGroup(groupId)) } label: {
                        Label("Related CI failure", systemImage: "point.3.connected.trianglepath.dotted")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(BD.accentText)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 10)
                    .padding(.leading, 30)
                }
            } else {
                Text("Reading the log…").font(.system(size: 14)).foregroundStyle(BD.text3).padding(.top, 6).padding(.leading, 30)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(fill: fill)
    }
}
