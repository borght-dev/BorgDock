import SwiftUI

/// A pull request on the Focus board: repo and number, title, why it's yours, check bar, chips and diff stat.
struct PrCard: View {
    let pr: PrSummary
    /// The line under the title; the PR's own reason unless a swipe hint replaces it.
    var reasonOverride: PrReason?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Text(pr.repo).fontWeight(.semibold).foregroundStyle(BD.text)
                Text(pr.repoLabel).foregroundStyle(BD.text3)
                Spacer(minLength: 8)
                Text(ShortTime.age(pr.updatedAt)).foregroundStyle(BD.text3)
            }
            .font(.system(size: 13.5))
            .lineLimit(1)

            Text(pr.title)
                .font(.system(size: 17, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(BD.text)
                .lineSpacing(1)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            ReasonLine(reason: reasonOverride ?? pr.reason)
                .padding(.top, 7)

            ViewThatFits(in: .horizontal) {
                ForEach(Array((0...chips.count).reversed()), id: \.self) { shown in
                    statusRow(chips: chips.prefix(shown))
                }
            }
            .padding(.top, 12)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard()
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var chips: [PrChip] { pr.cardChips }

    /// Check bar, chips and diff stat on one line. The card shows the most chips that fit, dropping from the end.
    private func statusRow(chips: ArraySlice<PrChip>) -> some View {
        HStack(spacing: 8) {
            if !pr.checks.segments.isEmpty {
                CheckBar(segments: pr.checks.segments)
                    .padding(.trailing, 6)
            }
            ForEach(chips, id: \.self) { PrChipView(chip: $0) }
            Spacer(minLength: 4)
            DiffStat(additions: pr.additions, deletions: pr.deletions)
        }
    }
}

/// "👁 Sanne asked for your review" in the reason's tone; review requests read in the accent.
struct ReasonLine: View {
    let reason: PrReason

    var body: some View {
        Label {
            Text(reason.text).lineLimit(2)
        } icon: {
            Image(systemName: reason.systemImage).font(.system(size: 13, weight: .medium))
        }
        .labelStyle(TightLabelStyle(spacing: 7))
        .font(.system(size: 14.5))
        .foregroundStyle(ReasonLine.color(reason.tone))
    }

    static func color(_ tone: Tone) -> Color {
        switch tone {
        case .run: BD.accentText
        case .mute: BD.text2
        default: tone.color
        }
    }
}

struct TightLabelStyle: LabelStyle {
    var spacing: CGFloat = 6

    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: spacing) {
            configuration.icon
            configuration.title
        }
    }
}

struct PrChipView: View {
    let chip: PrChip
    var small = false

    var body: some View {
        if chip.running {
            HStack(spacing: 5) {
                Circle().fill(BD.blue).frame(width: 6, height: 6)
                Text(chip.text)
            }
            .font(.system(size: small ? 11.5 : 12.5, weight: .semibold))
            .foregroundStyle(BD.blue)
            .padding(.horizontal, small ? 7 : 9)
            .frame(height: small ? 21 : 24)
            .background(BD.blueSoft, in: Capsule())
            .fixedSize()
        } else {
            switch chip.style {
            case .tone(let tone): ToneChip(text: chip.text, tone: tone, systemImage: chip.systemImage, small: small)
            case .accent: ToneChip(text: chip.text, systemImage: chip.systemImage, small: small, accent: true)
            }
        }
    }
}
