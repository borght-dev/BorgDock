import SwiftUI

/// An item in an open lane. Two lines when it asks something: AB# and verdict, the title, then who said what last or
/// the evidence. One line when it needs nothing from you. Mockup: design/ios-flow, section 07.
struct WorkRow: View {
    let entry: WorkEntry
    var showsState = false

    var body: some View {
        switch WorkRowLayout.of(entry, showsState: showsState) {
        case .oneLine(let trailing): oneLine(trailing)
        case .twoLines(let detail): twoLines(detail)
        }
    }

    private func oneLine(_ trailing: String) -> some View {
        HStack(spacing: 11) {
            WorkItemGlyph(typeName: entry.item.typeName, size: 11)
            Text(entry.item.title)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(BD.text)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(trailing)
                .font(.system(size: 12.5))
                .foregroundStyle(BD.text3)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func twoLines(_ detail: WorkRowLayout.Detail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                WorkItemGlyph(typeName: entry.item.typeName, size: 11)
                Text(verbatim: "AB#\(entry.item.id)")
                if showsState { Text("· \(entry.item.state)").lineLimit(1) }
                Spacer(minLength: 8)
                if let verdict = entry.verdict { VerdictChip(verdict: verdict, small: true) }
            }
            .font(.system(size: 12.5))
            .foregroundStyle(BD.text2)
            Text(entry.item.title)
                .font(.system(size: 15.5, weight: .semibold))
                .tracking(-0.2)
                .foregroundStyle(BD.text)
                .lineLimit(1)
                .padding(.top, 3)
            switch detail {
            case .message(let by, let text):
                Text("\(Text("\(by)").foregroundStyle(BD.text).fontWeight(.medium))\(Text(" — \(text)").foregroundStyle(BD.text2))")
                    .font(.system(size: 13))
                    .lineLimit(1)
                    .padding(.top, 3)
            case .evidence(let evidence):
                HStack(spacing: 5) {
                    ForEach(Array(evidence.prefix(3).enumerated()), id: \.offset) { _, item in
                        ToneChip(text: item.label, tone: item.tone ?? .mute, systemImage: WalkDisplay.symbol(for: item.kind, tone: item.tone), small: true)
                    }
                }
                .padding(.top, 6)
            case .none:
                EmptyView()
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .padding(.top, 10)
        .padding(.bottom, 11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

/// The verdict in its tone; a pulsing dot while an agent runs.
struct VerdictChip: View {
    let verdict: Verdict
    var small = false

    var body: some View {
        HStack(spacing: 5) {
            if verdict.tone == .run { PulseDot(color: BD.blue, size: 6) }
            Text(verdict.label).lineLimit(1)
        }
        .font(.system(size: small ? 11.5 : 13, weight: .semibold))
        .foregroundStyle(verdict.tone.color)
        .padding(.horizontal, small ? 7 : 9)
        .frame(height: small ? 21 : 25)
        .background(verdict.tone.soft, in: Capsule())
        .fixedSize()
    }
}

/// "▾ ● Testing Failed 2": an open lane's header; tapping it folds the lane.
struct LaneHeader: View {
    let lane: WorkLane
    let open: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 8) {
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(BD.text3)
                    .rotationEffect(.degrees(open ? 0 : -90))
                Circle().fill(LaneHue.of(lane).hue.color).frame(width: 8, height: 8)
                Text(lane.title).lineLimit(1)
                Text(verbatim: "\(lane.entries.count)").monospacedDigit().foregroundStyle(BD.text3)
                Spacer(minLength: 0)
            }
            .font(.system(size: 13.5, weight: .semibold))
            .foregroundStyle(BD.text2)
            .padding(.leading, -14)
            .padding(.top, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .textCase(nil)
        .accessibilityLabel("\(lane.title), \(lane.entries.count) items")
        .accessibilityHint(open ? "Folds the lane" : "Opens the lane")
        .accessibilityIdentifier("lane-\(lane.id)")
    }
}

/// A folded lane as one row: its symbol in a soft circle, the name, what it holds, the count.
struct FoldedLaneRow: View {
    let lane: WorkLane

    var body: some View {
        let style = LaneHue.of(lane)
        HStack(spacing: 10) {
            Image(systemName: style.symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(style.hue.color)
                .frame(width: 30, height: 30)
                .background(style.hue.color.opacity(0.16), in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(lane.title)
                    .font(.system(size: 15.5, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                ToneSentence(parts: LaneRows.summary(lane), size: 12.5, boldTones: false)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(verbatim: "\(lane.entries.count)")
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(BD.text2)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(BD.text3)
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 54)
        .contentShape(Rectangle())
    }
}

/// "2 failed QA · 2 questions · 4 running": parts joined with dots, each in its tone.
struct ToneSentence: View {
    let parts: [WalkDisplay.BriefingPart]
    var size: CGFloat = 15
    /// The briefing sets what asks something in bold; a folded lane's summary only colours it.
    var boldTones = true

    var body: some View {
        parts.enumerated().reduce(Text("")) { text, part in
            let separator = part.offset == 0 ? Text("") : Text(" · ").foregroundStyle(BD.text2)
            let piece = Text(part.element.text)
                .foregroundStyle(part.element.tone?.color ?? BD.text2)
                .fontWeight(boldTones && part.element.tone != nil ? .semibold : .regular)
            return Text("\(text)\(separator)\(piece)")
        }
        .font(.system(size: size))
    }
}

extension LaneHue {
    var color: Color {
        switch self {
        case .red: BD.red
        case .yellow: BD.yellow
        case .blue: BD.blue
        case .accent: BD.accent
        case .green: BD.green
        case .merged: BD.merged
        case .gray: BD.text3
        }
    }
}
