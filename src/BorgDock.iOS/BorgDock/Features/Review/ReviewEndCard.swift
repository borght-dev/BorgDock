import SwiftUI

/// Quick Review's end: what you decided on each pull request, what an author run left out and why, and what comes
/// next: the same author's next pull request, or the next by priority from someone else (the desktop's
/// `QuickReviewSummary`). Mockup: design/ios-pr-list/mockups.html, section 05.
struct ReviewEndCard: View {
    @Environment(AppModel.self) private var app
    let run: ReviewRun
    let onAuthorNext: (PrSummary) -> Void
    let onNext: (PrKey) -> Void

    var body: some View {
        let focus = app.focus
        let shown = run.shown
        let outcomes = shown.map { run.outcome($0, decisions: focus.reviewDecisions) }
        let summary = ReviewEndSummary(outcomes)
        let held = shown.filter { focus.reviewDecisions[$0.key]?.status == .held && focus.reviewDecisions[$0.key]?.event == .approve }.count
        let next = focus.nextReviews(after: run)
        let prefersAuthor = ReviewEndSummary.prefersAuthor(author: next.author, next: next.next)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(spacing: 8) {
                    Image(systemName: summary.reviewed + summary.walked > 0 ? "checkmark.circle.fill" : "forward.circle")
                        .font(.system(size: 50, weight: .regular))
                        .foregroundStyle(summary.reviewed + summary.walked > 0 ? BD.green : BD.text3)
                    Text(summary.title).font(.system(size: 22, weight: .bold)).foregroundStyle(BD.text)
                    Text(summary.detail(heldApprovals: held))
                        .font(.system(size: 15))
                        .foregroundStyle(BD.text2)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 20)
                .padding(.horizontal, 24)

                if shown.count > 1 { counts(summary).padding(.top, 16) }

                if !shown.isEmpty {
                    card {
                        ForEach(Array(zip(shown, outcomes).enumerated()), id: \.element.0.key) { index, entry in
                            if index > 0 { divider(leading: 58) }
                            decisionRow(entry.0, entry.1)
                        }
                    }
                    .padding(.top, 16)
                }

                if run.filling {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Reading E2E reports…").font(.system(size: 14)).foregroundStyle(BD.text2)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                }

                if !run.held.isEmpty {
                    sectionHeader("Left out of this run · \(run.held.count) PR\(run.held.count == 1 ? "" : "s")")
                    card {
                        ForEach(Array(run.held.enumerated()), id: \.element.id) { index, held in
                            if index > 0 { divider(leading: 16) }
                            heldRow(held)
                        }
                    }
                    .accessibilityIdentifier("review-end-held")
                }

                if next.author != nil || next.next != nil {
                    sectionHeader("What's next")
                    VStack(spacing: 10) {
                        if let author = next.author {
                            nextCard(author, highlighted: prefersAuthor, button: "Next from \(author.author.firstName)", id: "review-end-author") {
                                onAuthorNext(author)
                            }
                        }
                        if let other = next.next {
                            let button = next.author == nil ? "Review next PR" : "Review next from \(other.author.firstName)"
                            nextCard(other, highlighted: !prefersAuthor, button: button, id: "review-end-next") { onNext(other.prKey) }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .accessibilityIdentifier("review-end")
    }

    private func counts(_ summary: ReviewEndSummary) -> some View {
        HStack(spacing: 28) {
            if summary.approved > 0 { count(summary.approved, "Approved", BD.green) }
            if summary.commented > 0 { count(summary.commented, "Commented", BD.yellow) }
            if summary.walked > 0 { count(summary.walked, "Walked through", BD.text) }
            if summary.skipped > 0 { count(summary.skipped, "Skipped", BD.text3) }
        }
        .frame(maxWidth: .infinity)
    }

    private func count(_ value: Int, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text("\(value)").font(.system(size: 22, weight: .bold)).foregroundStyle(color).monospacedDigit()
            Text(label).font(.system(size: 12)).foregroundStyle(BD.text3)
        }
    }

    private func decisionRow(_ key: PrKey, _ outcome: ReviewOutcome) -> some View {
        let summary = app.focus.summary(key)
        let chip: (String, Tone) = switch outcome {
        case .approved: ("Approved", .ok)
        case .commented: ("Commented", .warn)
        case .skipped: ("Skipped", .mute)
        case .walked: ("Walked through", .mute)
        }
        return HStack(spacing: 12) {
            PersonAvatar(name: summary?.author.displayName ?? key.repo, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(summary?.title ?? "#\(key.number)")
                    .font(.system(size: 15.5, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                Text(verbatim: "\(key.owner)/\(key.repo) #\(key.number)").font(.system(size: 13)).foregroundStyle(BD.text2)
            }
            Spacer(minLength: 8)
            ToneChip(text: chip.0, tone: chip.1, small: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    private func heldRow(_ held: HeldPr) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(verbatim: "#\(held.pr.number)").foregroundStyle(BD.text3).monospacedDigit()
                Text(held.pr.title).foregroundStyle(BD.text).lineLimit(1)
            }
            .font(.system(size: 15, weight: .semibold))
            Text(held.why)
                .font(.system(size: 13.5))
                .foregroundStyle(held.reason == .failing || held.reason == .conflicts ? BD.red : BD.yellow)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    private func nextCard(_ pr: PrSummary, highlighted: Bool, button: String, id: String, action: @escaping () -> Void) -> some View {
        let checks = ReviewEndSummary.checks(pr)
        let asks = pr.bucket == .you && !pr.isMine
        let age = ShortTime.age(pr.createdAt)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                PersonAvatar(name: pr.author.displayName, size: 22)
                Text("Next from \(Text(pr.author.displayName).fontWeight(.semibold).foregroundStyle(BD.text))")
                    .foregroundStyle(BD.text2)
                    .font(.system(size: 14))
                    .lineLimit(1)
                Spacer(minLength: 6)
                ToneChip(text: checks.text, tone: checks.tone, systemImage: checks.icon, small: true)
            }
            Text(pr.title)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(BD.text)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Text(verbatim: "\(pr.owner)/\(pr.repo) #\(pr.number)" + (asks ? " · asks you" : "") + (age.isEmpty ? "" : " · opened \(age) ago"))
                .font(.system(size: 13))
                .foregroundStyle(BD.text2)
            Group {
                if highlighted {
                    Button(button, action: action).buttonStyle(.bd(.primary, height: 46))
                } else {
                    Button(button, action: action).buttonStyle(.bd(.plain, height: 46))
                }
            }
            .padding(.top, 6)
            .accessibilityIdentifier(id)
        }
        .padding(14)
        .background(BD.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            if highlighted {
                RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(BD.accent.opacity(0.55), lineWidth: 1.5)
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13.5, weight: .semibold))
            .foregroundStyle(BD.text2)
            .padding(.horizontal, 30)
            .padding(.top, 22)
            .padding(.bottom, 7)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0, content: content)
            .background(BD.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.horizontal, 16)
    }

    private func divider(leading: CGFloat) -> some View {
        Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, leading)
    }
}
