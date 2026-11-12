import SwiftUI

// The pages around the walk (mockup design/ios-flow/mockups.html, section 06): the brief of a pull request you
// haven't opened yet, the decision you made, and a load that failed twice.

/// Repository, number and state, the title, and who wrote it on which branch.
struct ReviewPrHeader: View {
    let summary: PrSummary
    var commits: Int?
    /// The error page names only the number: the rest comes from the list and may be old.
    var showsState = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.pull").font(.system(size: 14, weight: .semibold)).foregroundStyle(BD.green)
                Text(verbatim: "\(summary.owner)/\(summary.repo)").fontWeight(.semibold).foregroundStyle(BD.text)
                Text(verbatim: showsState ? "#\(summary.number) · \(summary.stateLabel)" : "#\(summary.number)").foregroundStyle(BD.text2)
            }
            .font(.system(size: 14))
            Text(summary.title)
                .font(.system(size: 23, weight: .bold))
                .tracking(-0.55)
                .foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)
            if let commits {
                HStack(spacing: 7) {
                    PersonAvatar(name: summary.author.displayName, size: 20)
                    Text(verbatim: "\(summary.author.displayName) · \(commits == 1 ? "1 commit" : "\(commits) commits") ·").lineLimit(1)
                    BranchName(name: summary.headRef, size: 12)
                }
                .font(.system(size: 14))
                .foregroundStyle(BD.text2)
                .padding(.top, 9)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }
}

extension PrSummary {
    var stateLabel: String {
        if isDraft { return "Draft" }
        switch state {
        case .open: return "Open"
        case .merged: return "Merged"
        case .closed: return "Closed"
        }
    }

    /// The brief's chips: checks, conflicts, linked work items.
    var briefChips: [PrChip] {
        var chips: [PrChip] = []
        if checks.failed > 0 {
            chips.append(PrChip(text: "\(checks.failed) failing", style: .tone(.bad), systemImage: "xmark"))
        } else if checks.pending > 0 {
            chips.append(PrChip(text: "\(checks.pending) running", style: .tone(.run), running: true))
        } else if checks.total > 0 {
            chips.append(PrChip(text: "Checks pass", style: .tone(.ok), systemImage: "checkmark"))
        }
        switch mergeable {
        case .conflicting: chips.append(PrChip(text: "Conflicts", style: .tone(.bad), systemImage: "exclamationmark.triangle"))
        case .mergeable: chips.append(PrChip(text: "No conflicts", style: .tone(.ok), systemImage: "checkmark"))
        case .unknown: break
        }
        chips += workItemIds.map { PrChip(text: "AB#\($0)", style: .accent) }
        return chips
    }
}

/// "Proof", "What changed  +412 −96": the small header above a card.
struct ReviewSectionLabel<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).foregroundStyle(BD.text2)
            Spacer()
            trailing.fontWeight(.medium).foregroundStyle(BD.text3)
        }
        .font(.system(size: 13, weight: .semibold))
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 8)
    }
}

extension ReviewSectionLabel where Trailing == EmptyView {
    init(title: String) {
        self.init(title: title) { EmptyView() }
    }
}

/// A soft banner: "You approved this at 4f2c1a9, 1 minute ago."
struct ReviewBanner: View {
    let icon: String
    let tone: Tone
    let title: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(tone.color).padding(.top, 1)
            (Text(title).fontWeight(.semibold).foregroundStyle(BD.text) + Text(" ") + Text(text).foregroundStyle(BD.text2))
                .font(.system(size: 14))
                .lineSpacing(2.5)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// A card on the review pages, like the mockups' `.desc`.
private struct ReviewCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BD.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.horizontal, 16)
    }
}

// MARK: - Brief

/// A pull request before its files: what it is and why (checks, proof, description), and what changed by kind.
struct ReviewBrief: View {
    let session: ReviewSession
    @State private var readsAll = false
    @State private var descriptionHeight: CGFloat = 0
    @State private var zoomed: ProofImage?

    private static let foldedHeight: CGFloat = 92

    var body: some View {
        if let detail = session.detail {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ReviewPrHeader(summary: detail.summary, commits: detail.commits)
                    chips(detail.summary)
                    if session.isReReview, let files = session.files {
                        let changed = files.files.filter(\.changedSinceReview).count
                        ReviewBanner(icon: "arrow.counterclockwise", tone: .warn, title: "Re-review.",
                                     text: "\(changed) file\(changed == 1 ? "" : "s") changed since your review of \(files.reviewedHeadSha?.shortSha ?? "an older commit"). Only \(changed == 1 ? "that one is" : "those are") left.")
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }
                    if !detail.proofImages.isEmpty { proof(detail.proofImages) }
                    if !detail.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { description(detail.body) }
                    changes(detail.summary)
                }
                .padding(.bottom, 120)
            }
            .scrollIndicators(.hidden)
            .fullScreenCover(item: $zoomed) { image in
                ZStack(alignment: .topTrailing) {
                    Color.black.ignoresSafeArea()
                    ProofImageView(image: image).aspectRatio(contentMode: .fit).frame(maxWidth: .infinity, maxHeight: .infinity)
                    GlassIconButton(systemImage: "xmark", label: "Close") { zoomed = nil }.padding()
                }
            }
        }
    }

    private func chips(_ summary: PrSummary) -> some View {
        let chips = summary.briefChips
        return HStack(spacing: 6) {
            ForEach(chips, id: \.self) { PrChipView(chip: $0) }
        }
        .padding(.horizontal, 16)
        .padding(.top, 11)
    }

    private func proof(_ images: [ProofImage]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ReviewSectionLabel(title: "Proof") { Text(images.count == 1 ? "1 image" : "\(images.count) images") }
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(images, id: \.self) { image in
                        Button { zoomed = image } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                ProofImageView(image: image)
                                    .frame(width: 150, height: 70)
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5))
                                Text(image.alt).font(.system(size: 12)).foregroundStyle(BD.text2).lineLimit(2).multilineTextAlignment(.leading)
                                    .frame(width: 150, alignment: .leading)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func description(_ body: String) -> some View {
        let folds = descriptionHeight > ReviewBrief.foldedHeight + 8
        return VStack(alignment: .leading, spacing: 0) {
            ReviewSectionLabel(title: "Description")
            ReviewCard {
                VStack(alignment: .leading, spacing: 6) {
                    GitHubMarkdown(body, size: 14.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { descriptionHeight = $0 }
                        .frame(maxHeight: folds && !readsAll ? ReviewBrief.foldedHeight : nil, alignment: .top)
                        .clipped()
                        .overlay(alignment: .bottom) {
                            if folds, !readsAll {
                                LinearGradient(colors: [BD.card.opacity(0), BD.card], startPoint: .top, endPoint: .bottom).frame(height: 44)
                            }
                        }
                    if folds {
                        Button(readsAll ? "Show less" : "Read all") { withAnimation(.snappy) { readsAll.toggle() } }
                            .font(.system(size: 14.5, weight: .semibold))
                            .foregroundStyle(BD.accentText)
                    }
                }
            }
        }
    }

    private func changes(_ summary: PrSummary) -> some View {
        let mix = ChangeMix(files: session.files?.files ?? [])
        return VStack(alignment: .leading, spacing: 0) {
            ReviewSectionLabel(title: "What changed") {
                ChangeCount(additions: summary.additions, deletions: summary.deletions, size: 13, design: .default)
            }
            ReviewCard {
                VStack(alignment: .leading, spacing: 8) {
                    GeometryReader { proxy in
                        let unit = max(0, proxy.size.width - CGFloat(max(0, mix.parts.count - 1)) * 2) / CGFloat(max(1, mix.total))
                        HStack(spacing: 2) {
                            ForEach(mix.parts, id: \.kind) { part in
                                Rectangle().fill(part.kind.color).frame(width: unit * CGFloat(part.count))
                            }
                        }
                    }
                    .frame(height: 8)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .padding(.top, 2)
                    HStack(spacing: 14) {
                        ForEach(mix.parts, id: \.kind) { part in
                            HStack(spacing: 5) {
                                RoundedRectangle(cornerRadius: 2).fill(part.kind.color).frame(width: 8, height: 8)
                                Text("\(part.count) \(part.kind.legend)")
                            }
                        }
                    }
                    .font(.system(size: 12.5))
                    .foregroundStyle(BD.text2)
                }
            }
        }
    }
}

/// How many files of each kind a pull request changes, for the brief's stacked bar.
struct ChangeMix: Equatable {
    struct Part: Equatable {
        let kind: PrFileCategory
        let count: Int
    }

    let parts: [Part]

    init(files: [PrFile]) {
        let order: [PrFileCategory] = [.source, .docs, .tests, .generated]
        parts = order.compactMap { kind in
            let count = files.filter { $0.kind == kind }.count
            return count > 0 ? Part(kind: kind, count: count) : nil
        }
    }

    var total: Int { parts.reduce(0) { $0 + $1.count } }
}

extension PrFileCategory {
    var legend: String {
        switch self {
        case .source: "source"
        case .docs: "docs"
        case .tests: "tests"
        case .generated: "generated"
        }
    }

    var color: Color {
        switch self {
        case .source: BD.accent
        case .docs: BD.merged
        case .tests: BD.blue
        case .generated: BD.text3
        }
    }
}

// MARK: - Decision

/// A pull request you decided on: the track as GitHub has it now, what you decided at which commit, your review,
/// and while an approval waits out its Undo, how long it has left.
struct ReviewDecisionPage: View {
    @Environment(AppModel.self) private var app
    let session: ReviewSession
    let decision: ReviewDecisionRecord

    var body: some View {
        if let detail = session.detail {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 12) {
                        ReviewPrHeader(summary: detail.summary, commits: detail.commits)
                        PrTrackView(steps: detail.summary.track).padding(.horizontal, 16)
                    }
                    TimelineView(.periodic(from: .now, by: 30)) { context in
                        let banner = decision.banner(detail: detail, now: context.date)
                        ReviewBanner(icon: icon, tone: tone, title: banner.title, text: banner.text)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    ReviewSectionLabel(title: "Your review")
                    ReviewCard {
                        VStack(alignment: .leading, spacing: 8) {
                            if decision.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Text("No comment.").font(.system(size: 14.5)).foregroundStyle(BD.text2)
                            } else {
                                GitHubMarkdown(decision.body, size: 14.5)
                            }
                            if let lines = decision.lineCommentSummary {
                                Text(lines).font(.system(size: 13)).foregroundStyle(BD.text2)
                            }
                        }
                    }
                    if let pending = app.focus.hold.pending.first(where: { $0.key == session.key }) {
                        ReviewSectionLabel(title: "While the Undo runs")
                        TimelineView(.periodic(from: .now, by: 0.25)) { context in
                            let seconds = Int(pending.remaining(at: context.date).rounded(.up))
                            ReviewBanner(icon: "clock", tone: .warn, title: "Approving, posts in \(seconds) s.",
                                         text: "Undo brings the decision sheet back with your comments.")
                        }
                        .padding(.horizontal, 16)
                    }
                    Button("Open the files again") { session.revisiting = true }
                        .font(.system(size: 14.5, weight: .semibold))
                        .foregroundStyle(BD.accentText)
                        .padding(.horizontal, 20)
                        .padding(.top, 18)
                }
                .padding(.bottom, 140)
            }
            .scrollIndicators(.hidden)
        }
    }

    private var tone: Tone {
        if case .failed = decision.status { return .bad }
        switch decision.event {
        case .approve: return .ok
        case .requestChanges: return .bad
        case .comment: return .run
        }
    }

    private var icon: String {
        if case .failed = decision.status { return "exclamationmark.octagon" }
        switch decision.event {
        case .approve: return "checkmark.circle"
        case .requestChanges: return "xmark.circle"
        case .comment: return "text.bubble"
        }
    }
}

// MARK: - Loading

/// While a pull request loads, and when it failed twice: the header from the list, so you know which one it is.
struct ReviewLoadPage: View {
    let summary: PrSummary?
    let key: PrKey
    let failure: String?
    let nextNumber: Int?
    let onSkip: () -> Void
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let summary { ReviewPrHeader(summary: summary, showsState: false) }
            Spacer(minLength: 40)
            if let failure {
                VStack(spacing: 0) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 27, weight: .regular))
                        .foregroundStyle(BD.text2)
                        .frame(width: 64, height: 64)
                        .background(BD.fill, in: Circle())
                        .padding(.bottom, 16)
                    Text(verbatim: "#\(key.number) didn't load").font(.system(size: 21, weight: .bold)).foregroundStyle(BD.text)
                    Text(failure)
                        .font(.system(size: 14.5))
                        .foregroundStyle(BD.text2)
                        .multilineTextAlignment(.center)
                        .lineSpacing(2.5)
                        .padding(.top, 6)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        Button(nextNumber.map { "Skip to #\($0)" } ?? "Skip", action: onSkip).buttonStyle(.bdPlain)
                        Button(action: onRetry) { Label("Retry", systemImage: "arrow.clockwise") }.buttonStyle(.bdPrimary)
                    }
                    .padding(.top, 22)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
            Spacer(minLength: 40)
            Spacer(minLength: 40)
        }
    }
}
