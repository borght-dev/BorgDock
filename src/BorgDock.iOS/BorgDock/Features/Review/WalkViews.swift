import SwiftUI
import UIKit

// The walk: one page per file or step (mockup design/ios-flow/mockups.html, section 05).

/// The page `session.position` names, and only that one: it can't show another file than the title and the count.
/// Swipe sideways to move; the new page slides in from the side you moved to.
struct WalkPager<Page: View>: View {
    let session: ReviewSession
    @ViewBuilder let page: (ReviewWalk.Position) -> Page
    @State private var drag: CGFloat = 0

    var body: some View {
        ZStack {
            if let position = session.position {
                page(position)
                    .id(position)
                    .transition(.asymmetric(insertion: .move(edge: session.movedForward ? .trailing : .leading), removal: .opacity))
            }
        }
        .offset(x: drag)
        .simultaneousGesture(swipe)
        .accessibilityAction(named: "Next page") { session.goForward() }
        .accessibilityAction(named: "Previous page") { session.goBack() }
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 24)
            .onChanged { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 1.5 else { return }
                let possible = value.translation.width < 0 ? session.canGoForward : session.canGoBack
                drag = value.translation.width * (possible ? 0.45 : 0.15)
            }
            .onEnded { value in
                let width = value.predictedEndTranslation.width
                let horizontal = abs(value.translation.width) > abs(value.translation.height) * 1.5
                withAnimation(.snappy(duration: 0.28)) {
                    if horizontal, width < -120 { session.goForward() }
                    if horizontal, width > 120 { session.goBack() }
                    drag = 0
                }
            }
    }
}

/// The navigation bar's title on the walk: the folder over the file name, and the progress under it. Tap for every file.
struct WalkTitle: View {
    let session: ReviewSession

    var body: some View {
        VStack(spacing: 0) {
            Text(caption)
                .font(.system(size: 11.5, weight: .medium, design: .monospaced))
                .foregroundStyle(BD.text3)
                .lineLimit(1)
                .truncationMode(.head)
            HStack(spacing: 4) {
                Text(name).font(.system(size: 16.5, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1).truncationMode(.middle)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(BD.text3)
            }
            WalkProgressBar(segments: session.walk.progress(at: session.position, reviewed: session.reviewed))
                .frame(width: 128, height: 4)
                .padding(.top, 5)
        }
        .frame(maxWidth: 220)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name), \(session.left) left")
        .accessibilityHint("Shows every file")
        .accessibilityIdentifier("walk-title")
        .accessibilityValue(session.position?.path ?? name)
    }

    private var caption: String {
        switch session.position {
        case .file(let path): path.splitPath.folder.isEmpty ? "#\(session.key.number)" : path.splitPath.folder
        case .step: "one step"
        case nil: ""
        }
    }

    private var name: String {
        switch session.position {
        case .file(let path): path.splitPath.name
        case .step(let group): "\(group.shortTitle) · \(session.walk.members(of: group).count) files"
        case nil: ""
        }
    }
}

/// Green for what you've reviewed, grey for the rest, one stretch per step after the files.
struct WalkProgressBar: View {
    let segments: [ReviewWalk.Segment]

    var body: some View {
        GeometryReader { proxy in
            let total = max(1, segments.reduce(0) { $0 + $1.weight })
            let gaps = CGFloat(max(0, segments.count - 1))
            let unit = max(0, proxy.size.width - gaps) / CGFloat(total)
            HStack(spacing: 1) {
                ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                    Rectangle().fill(color(segment.fill)).frame(width: unit * CGFloat(segment.weight))
                }
            }
        }
        .background(BD.fill2)
        .clipShape(Capsule())
        .animation(.snappy, value: segments)
        .accessibilityHidden(true)
    }

    private func color(_ fill: ReviewWalk.Segment.Fill) -> Color {
        switch fill {
        case .reviewed: BD.green
        case .open: BD.fill2
        case .current: BD.blue
        case .step: BD.fill2.opacity(0.55)
        }
    }
}

// MARK: - Pages

struct LineDraftTarget: Identifiable, Hashable {
    let path: String
    let anchor: DiffAnchor
    let code: String

    var id: String { "\(path)#\(anchor.side.rawValue)\(anchor.line)" }
}

/// One file: a slim line with its status, your drafts and its size, then the diff. The name is in the navigation bar.
struct FilePage: View {
    let session: ReviewSession
    let file: PrFile
    let draft: ReviewDraft
    let onLine: (LineDraftTarget) -> Void

    var body: some View {
        let language = SyntaxHighlighter.language(for: file.path)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                meta
                if file.patch == nil {
                    Text(file.status == .removed ? "File removed." : "No diff to show: binary or too large.")
                        .font(.subheadline).foregroundStyle(BD.text2).padding(16)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(session.lines(file)) { line in
                            DiffLineRow(line: line, language: language, fontSize: 11.5) {
                                if let anchor = line.anchor { onLine(LineDraftTarget(path: file.path, anchor: anchor, code: line.text)) }
                            }
                            if let anchor = line.anchor, let text = draft.comment(path: file.path, anchor: anchor) {
                                DraftBubble(line: anchor.line, text: text)
                                    .tappable({ onLine(LineDraftTarget(path: file.path, anchor: anchor, code: line.text)) }, label: "Edit your draft on line \(anchor.line)")
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.bottom, 170)
        }
        .scrollIndicators(.hidden)
        .background(BD.bg)
        .accessibilityIdentifier("walk-page-\(file.path)")
    }

    private var meta: some View {
        let drafts = draft.comments[file.path]?.count ?? 0
        return VStack(spacing: 0) {
            HStack(spacing: 8) {
                ToneChip(text: file.status.label, small: true)
                if session.isReReview, file.changedSinceReview {
                    ToneChip(text: "Changed since your review", tone: .warn, small: true)
                }
                if drafts > 0 {
                    Text(drafts == 1 ? "1 draft comment" : "\(drafts) draft comments").lineLimit(1)
                }
                Spacer(minLength: 6)
                ChangeCount(additions: file.additions, deletions: file.deletions, size: 12.5)
            }
            .font(.system(size: 13))
            .foregroundStyle(BD.text2)
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 10)
            BD.separator.frame(height: 0.5)
        }
    }
}

/// Tests or generated files as one page: what the step holds, its files (open one to read it), one Mark reviewed.
struct StepPage: View {
    let session: ReviewSession
    let group: ReviewWalk.Group
    @State private var showsAll = false

    var body: some View {
        let members = session.walk.members(of: group)
        let visible = showsAll ? members : Array(members.prefix(6))
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                StepKindCard(group: group, count: members.count)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                HStack {
                    Text("\(members.count) files")
                    Spacer()
                    ChangeCount(additions: members.reduce(0) { $0 + $1.additions }, deletions: members.reduce(0) { $0 + $1.deletions }, size: 13, design: .default)
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(BD.text2)
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 8)
                CellGroup(indent: 40) {
                    ForEach(visible) { file in
                        Button { withAnimation(.snappy(duration: 0.28)) { session.open(file.path) } } label: {
                            ReviewFileRow(file: file, showsChevron: true) {
                                Circle().fill(session.opened.contains(file.path) ? BD.green : BD.text3).frame(width: 7, height: 7)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint(session.opened.contains(file.path) ? "Opened" : "Not opened yet")
                    }
                    if members.count > visible.count {
                        MoreRow(count: members.count - visible.count) { withAnimation(.snappy) { showsAll = true } }
                    }
                }
            }
            .padding(.bottom, 170)
        }
        .scrollIndicators(.hidden)
        .background(BD.bg)
        .accessibilityIdentifier("walk-page-step-\(group.rawValue)")
    }
}

/// The card on top of a step page: the flask or the cog, and what the step covers.
struct StepKindCard: View {
    let group: ReviewWalk.Group
    let count: Int

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            StepIcon(group: group)
            VStack(alignment: .leading, spacing: 1) {
                Text(group.heading).font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text)
                Text(LocalizedStringKey(group.explanation(count: count)))
                    .font(.system(size: 14))
                    .foregroundStyle(BD.text2)
                    .lineSpacing(2.5)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(BD.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// The step's icon on a soft circle: blue for tests, grey for generated files.
struct StepIcon: View {
    let group: ReviewWalk.Group

    var body: some View {
        let color = group == .tests ? BD.blue : BD.text2
        Image(systemName: group.systemImage)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: 30, height: 30)
            .background(color.opacity(0.18), in: Circle())
            .accessibilityHidden(true)
    }
}

/// A file in a list: a mark, the folder dim before the name, the size, and a chevron when it opens.
struct ReviewFileRow<Mark: View>: View {
    let file: PrFile
    var showsChevron = false
    var highlighted = false
    @ViewBuilder let mark: Mark

    var body: some View {
        let (folder, name) = file.path.splitPath
        HStack(spacing: 10) {
            mark.frame(width: 16)
            (Text(folder).foregroundStyle(BD.text3) + Text(name).foregroundStyle(BD.text))
                .font(.system(size: 12, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.head)
                .frame(maxWidth: .infinity, alignment: .leading)
            ChangeCount(additions: file.additions, deletions: file.deletions, size: 11.5)
            if showsChevron {
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(BD.text3)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 46)
        .background(highlighted ? BD.accentSoft : .clear)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// "25 more" at the end of a shortened list.
struct MoreRow: View {
    let count: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("\(count) more")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(BD.accentText)
                .padding(.leading, 40)
                .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// "+38" or "+21 −4": GitHub's counts, leaving out a side that is zero.
struct ChangeCount: View {
    let additions: Int
    let deletions: Int
    var size: CGFloat = 12
    var design: Font.Design = .monospaced

    var body: some View {
        HStack(spacing: 4) {
            if additions > 0 || deletions == 0 { Text("+" + DiffStat.compact(additions)).foregroundStyle(BD.green) }
            if deletions > 0 { Text("−" + DiffStat.compact(deletions)).foregroundStyle(BD.red) }
        }
        .font(.system(size: size, weight: .medium, design: design))
        .lineLimit(1)
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(additions) lines added, \(deletions) removed")
    }
}

extension PrFileStatus {
    var label: String {
        switch self {
        case .added: "Added"
        case .modified: "Modified"
        case .removed: "Removed"
        case .renamed: "Renamed"
        }
    }
}

// MARK: - Bottom bar

/// Previous, Mark reviewed, Next, and under them where you are: "File 4 of 12 · then tests and generated, one step each".
struct WalkBar: View {
    let session: ReviewSession
    let onMark: () -> Void

    var body: some View {
        VStack(spacing: 11) {
            HStack(spacing: 12) {
                GlassIconButton(systemImage: "chevron.left", label: "Previous", size: 52) { move { session.goBack() } }
                    .disabled(!session.canGoBack)
                markButton
                GlassIconButton(systemImage: "chevron.right", label: "Next", size: 52) { move { session.goForward() } }
                    .disabled(!session.canGoForward)
            }
            if let position = session.position {
                let caption = session.walk.caption(at: position, reviewed: session.reviewed)
                (Text(caption.lead).fontWeight(.semibold).foregroundStyle(BD.text) + Text(caption.rest.isEmpty ? "" : " " + caption.rest).foregroundStyle(BD.text3))
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .accessibilityIdentifier("walk-caption")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 4)
        .background(LinearGradient(stops: [.init(color: BD.bg.opacity(0), location: 0), .init(color: BD.bg, location: 0.38)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
    }

    @ViewBuilder
    private var markButton: some View {
        if let position = session.position, session.isReviewed(position) {
            Button { session.unmarkCurrent() } label: { Label("Reviewed", systemImage: "checkmark") }
                .buttonStyle(.bd(.plain))
                .accessibilityHint("Marks it not reviewed")
        } else {
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                move(onMark)
            } label: { Label(markTitle, systemImage: "checkmark").minimumScaleFactor(0.8) }
                .buttonStyle(.bdGo)
                .accessibilityIdentifier("walk-mark")
        }
    }

    private var markTitle: String {
        guard let position = session.position, case .step(let group) = session.walk.anchor(of: position) else { return "Mark reviewed" }
        return group.markTitle(count: session.walk.members(of: group).count)
    }

    private func move(_ change: () -> Void) {
        withAnimation(.snappy(duration: 0.28)) { change() }
    }
}

// MARK: - Line drafts

struct LineDraftSheet: View {
    @Environment(\.dismiss) private var dismiss
    let target: LineDraftTarget
    @Binding var draft: ReviewDraft
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(target.code.trimmingCharacters(in: .whitespaces))
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(BD.text2)
                    .lineLimit(2)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(BD.fill, in: RoundedRectangle(cornerRadius: 12))
                TextField("Comment on this line", text: $text, axis: .vertical)
                    .lineLimit(3...8)
                    .font(.system(size: 17))
                    .focused($focused)
                Spacer()
            }
            .padding(16)
            .background(BD.sheet)
            .navigationTitle("\(target.path.splitPath.name):\(target.anchor.line)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        draft.set(text, path: target.path, anchor: target.anchor)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
                if draft.comment(path: target.path, anchor: target.anchor) != nil {
                    ToolbarItem(placement: .bottomBar) {
                        Button("Delete draft", role: .destructive) {
                            draft.set("", path: target.path, anchor: target.anchor)
                            dismiss()
                        }
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            text = draft.comment(path: target.path, anchor: target.anchor) ?? ""
            focused = true
        }
    }
}
