import SwiftUI

/// Quick Review: one pull request after another, one file per page. Approve stays locked until every file is seen,
/// the decision opens after the last one, and an approval waits out its Undo before GitHub hears about it.
struct QuickReviewView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let keys: [PrKey]

    @State private var queue: [PrKey] = []
    @State private var position = 0
    @State private var sessions: [String: ReviewSession] = [:]
    @State private var walking = false
    @State private var deciding = false
    @State private var lineDraft: LineDraftTarget?

    private var key: PrKey? { queue.indices.contains(position) ? queue[position] : nil }
    private var session: ReviewSession? { key.flatMap { sessions[$0.key] } }

    var body: some View {
        NavigationStack {
            Group {
                if let key, let session {
                    if !session.isLoaded {
                        loading(session)
                    } else if walking {
                        FileWalk(session: session, draft: draftBinding(key)) { lineDraft = $0 }
                    } else {
                        ReviewIntro(session: session, error: app.focus.reviewErrors[key.key])
                    }
                } else if queue.isEmpty {
                    ProgressView()
                } else {
                    finished
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BD.bg)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .safeAreaInset(edge: .bottom) { bottomBar }
        }
        .tint(BD.text)
        .overlay(alignment: .bottom) { ApprovalToast().padding(.bottom, 92) }
        .sheet(isPresented: $deciding) {
            if let key, let session { DecideSheet(session: session, draft: draftBinding(key), onDecided: advance, onJump: jump) }
        }
        .sheet(item: $lineDraft) { target in
            if let key { LineDraftSheet(target: target, draft: draftBinding(key)) }
        }
        .onAppear {
            guard queue.isEmpty else { return }
            queue = keys
            #if DEBUG
            if let start = app.focus.debugReviewPosition { position = start }
            app.focus.debugReviewPosition = nil
            #endif
            prepare()
        }
        .onChange(of: position) { prepare() }
        .onChange(of: app.focus.reopenDecision) { reopenIfAsked() }
    }

    // MARK: - Flow

    private func prepare() {
        guard let key, sessions[key.key] == nil else {
            reopenIfAsked()
            return
        }
        let session = ReviewSession(key: key)
        sessions[key.key] = session
        let start = app.focus.reviewStartPath.removeValue(forKey: key.key)
        Task {
            await session.load(using: app.focus, startPath: start)
            if start != nil { walking = true }
            reopenIfAsked()
        }
    }

    /// An undone approval comes back to its decision with the draft intact.
    private func reopenIfAsked() {
        guard let wanted = app.focus.reopenDecision else { return }
        if let index = queue.firstIndex(where: { $0.key == wanted }) {
            app.focus.reopenDecision = nil
            if position != index { position = index }
            walking = true
            if sessions[wanted]?.isLoaded == true { deciding = true }
        }
    }

    private func advance() {
        deciding = false
        walking = false
        position += 1
    }

    private func jump(_ path: String) {
        deciding = false
        walking = true
        session?.jump(to: path)
    }

    private func draftBinding(_ key: PrKey) -> Binding<ReviewDraft> {
        Binding(get: { app.focus.reviewDrafts[key.key] ?? ReviewDraft() }, set: { app.focus.reviewDrafts[key.key] = $0 })
    }

    // MARK: - Chrome

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
        }
        ToolbarItem(placement: .principal) { title }
        if let session, session.isLoaded {
            ToolbarItem(placement: .topBarTrailing) { lockButton(session) }
        }
    }

    @ViewBuilder
    private var title: some View {
        if let key, let session, walking, session.isLoaded {
            Menu {
                ForEach(Array(session.allFiles.enumerated()), id: \.element.id) { index, file in
                    Button { session.fileIndex = index } label: {
                        Label(file.path, systemImage: session.isReviewed(file) ? "checkmark.circle.fill" : file.changedSinceReview ? "circle.badge.exclamationmark" : "circle")
                    }
                }
            } label: {
                VStack(spacing: 6) {
                    Text(verbatim: "#\(key.number) · file \(session.fileIndex + 1) of \(session.allFiles.count)")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(BD.text)
                        .monospacedDigit()
                    ReviewProgressBar(value: session.progress).frame(width: 120, height: 4)
                }
            }
            .accessibilityHint("Shows every file")
        } else if let key {
            VStack(spacing: 1) {
                Text(queue.count > 1 ? "Review · \(position + 1) of \(queue.count)" : "Review #\(key.number)")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(BD.text)
                if queue.indices.contains(position + 1) {
                    Text(verbatim: "Up next: #\(queue[position + 1].number)").font(.system(size: 13)).foregroundStyle(BD.text2)
                }
            }
        }
    }

    @ViewBuilder
    private func lockButton(_ session: ReviewSession) -> some View {
        if session.isDone {
            Button { deciding = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark")
                    Text("Done")
                }
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(BD.green)
                .padding(.horizontal, 6)
            }
        } else {
            Menu {
                Button("Next file to review", systemImage: "arrow.right") {
                    walking = true
                    if let next = session.firstUnreviewed(after: session.fileIndex) ?? session.firstUnreviewed(after: -1) { session.fileIndex = next }
                }
                Button("Comment or request changes…", systemImage: "text.bubble") { deciding = true }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "lock")
                    Text(verbatim: "\(session.left) left").monospacedDigit()
                }
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(BD.text3)
                .padding(.horizontal, 6)
            }
            .accessibilityLabel("Approve is locked, \(session.left) files left")
        }
    }

    @ViewBuilder
    private var bottomBar: some View {
        if let session, session.isLoaded {
            if walking {
                WalkBar(session: session, onPrevious: { session.fileIndex = max(0, session.fileIndex - 1) }, onNext: {
                    session.fileIndex = min(session.allFiles.count - 1, session.fileIndex + 1)
                }, onMark: {
                    if session.markCurrentReviewed() { deciding = true }
                }, onBack: { walking = false })
            } else {
                HStack(spacing: 12) {
                    if position > 0 {
                        GlassIconButton(systemImage: "chevron.left", label: "Previous pull request", size: 52) { position -= 1 }
                    }
                    if session.isDone {
                        Button { deciding = true } label: { Label("Decide", systemImage: "checkmark.seal") }.buttonStyle(.bdPrimary)
                    } else {
                        Button { walking = true } label: {
                            Label("Walk \(session.left) file\(session.left == 1 ? "" : "s")", systemImage: "eye")
                        }
                        .buttonStyle(.bdPrimary)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
            }
        }
    }

    private func loading(_ session: ReviewSession) -> some View {
        VStack(spacing: 12) {
            if let error = session.loadError {
                Text(error).foregroundStyle(BD.text2)
                Button("Skip") { position += 1 }.buttonStyle(.bordered)
            } else {
                ProgressView()
            }
        }
    }

    private var finished: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.circle").font(.system(size: 52, weight: .light)).foregroundStyle(BD.green)
            Text(queue.count == 1 ? "Reviewed" : "All \(queue.count) reviewed").font(.title2.bold()).foregroundStyle(BD.text)
            Text("Approvals post when their Undo runs out.").font(.subheadline).foregroundStyle(BD.text2)
            Button("Back to Focus") { dismiss() }.buttonStyle(.bd(.plain, height: 46)).frame(width: 200).padding(.top, 8)
        }
    }
}

struct ReviewProgressBar: View {
    let value: Double

    var body: some View {
        GeometryReader { proxy in
            Capsule().fill(BD.fill2)
                .overlay(alignment: .leading) { Capsule().fill(BD.green).frame(width: proxy.size.width * min(1, max(0, value))) }
        }
        .animation(.snappy, value: value)
    }
}

// MARK: - Intro

/// The pull request before its files: who, which branch, a re-review banner, and the files left to review.
struct ReviewIntro: View {
    let session: ReviewSession
    let error: String?

    var body: some View {
        if let detail = session.detail {
            ScrollView {
              VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.pull").font(.system(size: 14, weight: .semibold)).foregroundStyle(BD.green)
                        Text(verbatim: "\(detail.owner)/\(detail.repo)").fontWeight(.semibold).foregroundStyle(BD.text)
                        Text(verbatim: "#\(detail.number)").foregroundStyle(BD.text2)
                    }
                    .font(.system(size: 15))
                    Text(detail.title).font(.system(size: 28, weight: .bold)).tracking(-0.5).foregroundStyle(BD.text)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                    HStack(spacing: 7) {
                        PersonBadge(person: detail.author, size: 22)
                        Text(verbatim: "\(detail.author.displayName) ·").lineLimit(1)
                        BranchName(name: detail.headRef)
                    }
                    .font(.system(size: 15))
                    .foregroundStyle(BD.text2)
                    .padding(.top, 10)

                    if let error {
                        ReviewBanner(icon: "exclamationmark.octagon", tone: .bad, title: "Not submitted.", text: error).padding(.top, 14)
                    }
                    if session.isReReview, let files = session.files {
                        let changed = files.files.filter(\.changedSinceReview).count
                        ReviewBanner(icon: "arrow.counterclockwise", tone: .warn, title: "Re-review.",
                               text: "\(changed) file\(changed == 1 ? "" : "s") changed since your review of \(files.reviewedHeadSha?.shortSha ?? "an older commit"). Only \(changed == 1 ? "that one is" : "those are") left.")
                            .padding(.top, 14)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                let files = session.toReview
                let prefix = PathPrefix.common(files.map(\.path))
                PrSectionLabel(title: "Files", trailing: session.isDone ? "all reviewed" : "\(files.count) to review")
                if !files.isEmpty {
                    PrGroupCard(indent: 42) {
                        ForEach(files.prefix(12)) { PrFileRow(file: $0, prefix: prefix, reviewed: false) }
                        if files.count > 12 {
                            Text(verbatim: "and \(files.count - 12) more").font(.system(size: 14)).foregroundStyle(BD.text2).padding(14)
                        }
                    }
                    .padding(.horizontal, 16)
                }
              }
              .padding(.bottom, 120)
            }
        }
    }
}

struct ReviewBanner: View {
    let icon: String
    let tone: Tone
    let title: String
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(tone.color)
            (Text(title).fontWeight(.semibold) + Text(" ") + Text(text))
                .font(.system(size: 15.5))
                .foregroundStyle(BD.text)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// MARK: - File walk

struct LineDraftTarget: Identifiable, Hashable {
    let path: String
    let anchor: DiffAnchor
    let code: String

    var id: String { "\(path)#\(anchor.side.rawValue)\(anchor.line)" }
}

/// One file per page; swipe sideways between files.
struct FileWalk: View {
    @Bindable var session: ReviewSession
    @Binding var draft: ReviewDraft
    let onLine: (LineDraftTarget) -> Void

    var body: some View {
        TabView(selection: $session.fileIndex) {
            ForEach(Array(session.allFiles.enumerated()), id: \.element.id) { index, file in
                FilePage(session: session, file: file, draft: draft, onLine: onLine).tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .ignoresSafeArea(edges: .bottom)
    }
}

struct FilePage: View {
    let session: ReviewSession
    let file: PrFile
    let draft: ReviewDraft
    let onLine: (LineDraftTarget) -> Void

    var body: some View {
        let (folder, name) = file.path.splitPath
        let language = SyntaxHighlighter.language(for: file.path)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .lastTextBaseline, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        if !folder.isEmpty {
                            Text(folder).font(.system(size: 13, design: .monospaced)).foregroundStyle(BD.text3).lineLimit(1).truncationMode(.head)
                        }
                        HStack(spacing: 8) {
                            Text(name).font(.system(size: 22, weight: .bold)).tracking(-0.3).foregroundStyle(BD.text).lineLimit(2)
                            if session.isReviewed(file) {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(BD.green).font(.system(size: 17))
                            }
                        }
                    }
                    Spacer(minLength: 8)
                    DiffStat(additions: file.additions, deletions: file.deletions).font(.system(size: 14, weight: .medium, design: .monospaced))
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .padding(.bottom, 12)
                Rectangle().fill(BD.separator).frame(height: 0.5)

                if file.patch == nil {
                    Text(file.status == .removed ? "File removed." : "No diff to show: binary or too large.")
                        .font(.subheadline).foregroundStyle(BD.text2).padding(16)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(session.lines(file)) { line in
                            DiffLineRow(line: line, language: language, fontSize: 12.5) {
                                if let anchor = line.anchor { onLine(LineDraftTarget(path: file.path, anchor: anchor, code: line.text)) }
                            }
                            if let anchor = line.anchor, let text = draft.comment(path: file.path, anchor: anchor) {
                                Button { onLine(LineDraftTarget(path: file.path, anchor: anchor, code: line.text)) } label: {
                                    DraftBubble(line: anchor.line, text: text)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(.bottom, 170)
        }
        .scrollIndicators(.hidden)
    }
}

/// The dots (the file tree in miniature) and Previous, Mark reviewed, Next.
struct WalkBar: View {
    let session: ReviewSession
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onMark: () -> Void
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            FileDots(session: session)
            HStack(spacing: 12) {
                GlassIconButton(systemImage: "chevron.left", label: "Previous file", size: 52, action: session.fileIndex == 0 ? onBack : onPrevious)
                if let file = session.currentFile, session.isReviewed(file) {
                    Button { session.unmark(file) } label: { Label("Reviewed", systemImage: "checkmark") }
                        .buttonStyle(.bd(.plain))
                } else {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        withAnimation(.snappy) { onMark() }
                    } label: { Label("Mark reviewed", systemImage: "checkmark") }
                        .buttonStyle(.bdGo)
                }
                GlassIconButton(systemImage: "chevron.right", label: "Next file", size: 52, action: onNext)
                    .disabled(session.fileIndex >= session.allFiles.count - 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 4)
        .background(LinearGradient(colors: [BD.bg.opacity(0), BD.bg.opacity(0.92), BD.bg], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
    }
}

struct FileDots: View {
    let session: ReviewSession

    var body: some View {
        let files = session.allFiles
        if files.count <= 24 {
            HStack(spacing: 4) {
                ForEach(Array(files.enumerated()), id: \.element.id) { index, file in
                    Capsule()
                        .fill(color(file, current: index == session.fileIndex))
                        .frame(width: index == session.fileIndex ? 18 : 6, height: 6)
                }
            }
            .animation(.snappy, value: session.fileIndex)
            .accessibilityElement()
            .accessibilityLabel("\(files.count - session.left) of \(files.count) files reviewed")
        } else {
            ReviewProgressBar(value: session.progress).frame(width: 160, height: 5)
        }
    }

    private func color(_ file: PrFile, current: Bool) -> Color {
        if current { return BD.text }
        if session.isReviewed(file) { return BD.green }
        if file.changedSinceReview { return BD.yellow }
        return BD.fill2
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
