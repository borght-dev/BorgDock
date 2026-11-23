import SwiftUI

// BorgDock Review's additions to the walk (design/review-app/mockups.html, "Quick Review"): other people's threads
// under the line they belong to, a comment on several lines with a suggestion, and a re-review that reads only what
// changed since yours.

// MARK: - Threads on their lines

/// Where a file's review threads sit in its diff. Pure, for tests.
enum WalkThreads {
    struct Placed: Equatable {
        /// By the id of the diff line a thread sits under.
        var byLine: [Int: [ReviewThread]] = [:]
        /// On lines this diff doesn't show: outdated, or outside what changed since your review.
        var elsewhere: [ReviewThread] = []

        var count: Int { byLine.values.reduce(0) { $0 + $1.count } + elsewhere.count }
    }

    /// A thread sits under the line it names on its side; without a side it is the new file's line, else the old one.
    static func place(_ threads: [ReviewThread], path: String, lines: [DiffLine]) -> Placed {
        var placed = Placed()
        for thread in threads where thread.path == path {
            guard let number = thread.line, let line = line(number, side: thread.side, in: lines) else {
                placed.elsewhere.append(thread)
                continue
            }
            placed.byLine[line.id, default: []].append(thread)
        }
        return placed
    }

    private static func line(_ number: Int, side: DiffSide?, in lines: [DiffLine]) -> DiffLine? {
        let sides: [DiffSide] = side.map { [$0] } ?? [.right, .left]
        for side in sides {
            if let found = lines.first(where: { $0.anchor == DiffAnchor(line: number, side: side) }) { return found }
        }
        return nil
    }

    /// "1 thread", "2 threads, 1 draft": the file's line under the navigation bar.
    static func summary(threads: Int, drafts: Int) -> String {
        var parts: [String] = []
        if threads > 0 { parts.append(threads == 1 ? "1 thread" : "\(threads) threads") }
        if drafts > 0 { parts.append(drafts == 1 ? "1 draft" : "\(drafts) drafts") }
        return parts.joined(separator: ", ")
    }
}

/// A review thread in the walk, under its line: who said what, and Resolve and Reply while it is open. A resolved one
/// folds to a line.
struct WalkThreadView: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    let thread: ReviewThread
    /// The line was changed after the thread started: the author answered in code.
    var changedSince = false
    let onReply: (ReviewThread) -> Void
    @State private var unfolded = false

    private static let shownComments = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if thread.isResolved, !unfolded {
                resolvedLine
            } else {
                let hidden = unfolded ? 0 : max(0, thread.comments.count - Self.shownComments)
                VStack(alignment: .leading, spacing: 9) {
                    if hidden > 0 {
                        Text(hidden == 1 ? "1 earlier comment" : "\(hidden) earlier comments")
                            .font(.system(size: 12.5, weight: .semibold))
                            .foregroundStyle(BD.accentText)
                            .tappable({ withAnimation(.snappy) { unfolded = true } }, label: "Show the earlier comments")
                    }
                    ForEach(Array(thread.comments.dropFirst(hidden).enumerated()), id: \.element.id) { index, comment in
                        self.comment(comment, first: index == 0 && hidden == 0)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 10)
                .padding(.bottom, thread.isResolved ? 10 : 8)
                if !thread.isResolved { actions }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BD.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5))
        .padding(.leading, 50)
        .padding(.trailing, 12)
        .padding(.vertical, 6)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("walk-thread-\(thread.id)")
    }

    private func comment(_ comment: PrComment, first: Bool) -> some View {
        let mine = app.focus.myLogins.contains(comment.author.login) || app.reviewAccounts.contains { $0.login.caseInsensitiveCompare(comment.author.login) == .orderedSame }
        return VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                if mine {
                    LedgerAvatar(person: comment.author, mine: true, size: 18)
                } else {
                    PersonAvatar(name: comment.author.displayName, size: 18)
                }
                Text(mine ? "You" : comment.author.displayName).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(BD.text)
                Text(ShortTime.age(comment.at)).font(.system(size: 12)).foregroundStyle(BD.text3)
                if first, changedSince { ToneChip(text: "Changed since", tone: .ok, systemImage: "checkmark", small: true) }
                Spacer(minLength: 0)
            }
            .lineLimit(1)
            GitHubMarkdown(comment.body, size: 14)
        }
    }

    private var resolvedLine: some View {
        HStack(spacing: 7) {
            Image(systemName: "checkmark.circle").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.green)
            Text("Resolved").fontWeight(.semibold).foregroundStyle(BD.text2)
            if let first = thread.comments.first {
                Text(verbatim: "\(first.author.firstName): \(DescriptionExcerpt.excerpt(first.body))").foregroundStyle(BD.text3)
            }
            Spacer(minLength: 0)
        }
        .font(.system(size: 12.5))
        .lineLimit(1)
        .padding(.horizontal, 12)
        .frame(minHeight: 36)
        .tappable({ withAnimation(.snappy) { unfolded = true } }, label: "Resolved thread, show it")
    }

    private var actions: some View {
        let resolving = app.busy.contains("resolve-\(thread.id)")
        return HStack(spacing: 0) {
            Text(resolving ? "Resolving…" : "Resolve")
                .frame(maxWidth: .infinity, minHeight: 38)
                .tappable(resolving ? nil : { Task { await app.focus.resolve(key, threadId: thread.id) } }, label: "Resolve the thread")
            Rectangle().fill(BD.separator).frame(width: 0.5, height: 38)
            Text("Reply")
                .frame(maxWidth: .infinity, minHeight: 38)
                .tappable({ onReply(thread) }, label: "Reply in the thread")
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(BD.accentText)
        .overlay(alignment: .top) { Rectangle().fill(BD.separator).frame(height: 0.5) }
    }
}

/// Threads on lines the diff on screen doesn't have, at the top of the file: nothing said about the file goes unseen.
struct WalkThreadsElsewhere: View {
    let key: PrKey
    let threads: [ReviewThread]
    let sinceReview: Bool
    let onReply: (ReviewThread) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.system(size: 12.5, weight: .semibold))
                .foregroundStyle(BD.text2)
                .padding(.horizontal, 16)
                .padding(.top, 10)
            ForEach(threads) { thread in
                WalkThreadView(key: key, thread: thread, onReply: onReply).padding(.leading, -34)
            }
        }
        .padding(.bottom, 4)
    }

    private var title: String {
        let count = threads.count == 1 ? "1 thread" : "\(threads.count) threads"
        return sinceReview ? "\(count) on lines that didn't change since your review" : "\(count) on lines this diff no longer shows"
    }
}

/// A reply in a review thread, from the walk. It posts at once, like on the pull request's page.
struct ThreadReplySheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let key: PrKey
    let thread: ReviewThread
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let busy = app.busy.contains("comment-\(key.key)")
        let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                if let last = thread.comments.last {
                    Text(verbatim: "\(last.author.firstName): \(DescriptionExcerpt.excerpt(last.body))")
                        .font(.system(size: 13.5))
                        .foregroundStyle(BD.text2)
                        .lineLimit(2)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(BD.fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                TextField("Reply", text: $text, axis: .vertical)
                    .lineLimit(3...8)
                    .font(.system(size: 17))
                    .focused($focused)
                    .accessibilityIdentifier("thread-reply-text")
                Spacer()
            }
            .padding(16)
            .background(BD.sheet)
            .navigationTitle("Reply to \(thread.comments.last?.author.firstName ?? "the thread")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Sending…" : "Send") {
                        Task {
                            if await app.focus.postComment(key, body: text.trimmingCharacters(in: .whitespacesAndNewlines), threadId: thread.id) { dismiss() }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(busy || empty)
                    .accessibilityIdentifier("thread-reply-send")
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear { focused = true }
    }
}

// MARK: - A comment on one line or several

extension ReviewSession {
    /// The comment sheet's target for a tapped line: the draft already on it with its lines, else the line alone.
    func draftTarget(for line: DiffLine, in file: PrFile, draft: ReviewDraft) -> LineDraftTarget? {
        guard let anchor = line.anchor else { return nil }
        let lines = self.lines(file)
        // A tap inside a draft's lines opens that draft.
        if let end = (draft.comments[file.path] ?? [:]).keys.first(where: { end in
            end.side == anchor.side && (draft.startLine(path: file.path, anchor: end) ?? end.line) <= anchor.line && anchor.line <= end.line
        }) {
            let start = draft.startLine(path: file.path, anchor: end)
            return LineDraftTarget(path: file.path, anchor: end, startLine: start, code: Self.code(lines, side: end.side, from: start ?? end.line, to: end.line), saved: end)
        }
        return LineDraftTarget(path: file.path, anchor: anchor, code: line.text)
    }

    /// The target grown to take `line` too. Nil when it can't: another side, or another hunk, which GitHub refuses
    /// for one comment.
    func extended(_ target: LineDraftTarget, to line: DiffLine, in file: PrFile) -> LineDraftTarget? {
        guard target.path == file.path, let tapped = line.anchor, tapped.side == target.anchor.side else { return nil }
        let lines = self.lines(file)
        let first = min(target.startLine ?? target.anchor.line, tapped.line)
        let last = max(target.anchor.line, tapped.line)
        func index(_ number: Int) -> Int? { lines.firstIndex { $0.anchor == DiffAnchor(line: number, side: tapped.side) } }
        guard let from = index(first), let to = index(last), from <= to else { return nil }
        if lines[from...to].contains(where: { $0.kind == .hunk }) { return nil }
        var grown = target
        grown.anchor = DiffAnchor(line: last, side: tapped.side)
        grown.startLine = first < last ? first : nil
        grown.code = Self.code(lines, side: tapped.side, from: first, to: last)
        return grown
    }

    private static func code(_ lines: [DiffLine], side: DiffSide, from: Int, to: Int) -> String {
        lines.filter { line in
            guard let anchor = line.anchor, anchor.side == side else { return false }
            return from <= anchor.line && anchor.line <= to
        }
        .map(\.text)
        .joined(separator: "\n")
    }
}

/// GitHub's suggestion block for the lines a comment covers: the author applies it with one tap on GitHub.
enum ReviewSuggestion {
    static func block(_ code: String) -> String { "```suggestion\n\(code)\n```" }

    /// The comment with a suggestion for `code` added, ready to edit.
    static func adding(_ code: String, to text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? block(code) : trimmed + "\n\n" + block(code)
    }

    static func has(_ text: String) -> Bool { text.contains("```suggestion") }
}

/// The comment box of the walk in BorgDock Review. It leaves the diff in reach: tap another line and the comment
/// takes every line up to it. A suggestion puts those lines in the box to edit.
struct LineRangeDraftSheet: View {
    @Environment(\.dismiss) private var dismiss
    let target: LineDraftTarget
    @Binding var draft: ReviewDraft
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let suggests = target.anchor.side == .right && !ReviewSuggestion.has(text)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    TextField("Comment on \(target.startLine == nil ? "this line" : "these lines")", text: $text, axis: .vertical)
                        .lineLimit(3...10)
                        .font(.system(size: 17))
                        .focused($focused)
                        .accessibilityIdentifier("line-draft-text")
                    HStack(spacing: 8) {
                        if suggests {
                            chip("Suggest a change", systemImage: "doc.badge.plus", id: "line-draft-suggest") { text = ReviewSuggestion.adding(target.code, to: text) }
                        }
                        chip(isNit ? "Nit ✓" : "Nit", systemImage: nil, id: "line-draft-nit", on: isNit) { toggleNit() }
                        Spacer(minLength: 0)
                    }
                    Text("Posts with your review. Tap another line to take more lines.")
                        .font(.system(size: 13))
                        .foregroundStyle(BD.text3)
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(BD.sheet)
            .navigationTitle(target.path.splitPath.name)
            .navigationSubtitle(target.startLine.map { "lines \($0) to \(target.anchor.line)" } ?? "line \(target.anchor.line)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).fontWeight(.semibold).accessibilityIdentifier("line-draft-save")
                }
                if target.saved != nil {
                    ToolbarItem(placement: .bottomBar) {
                        Button("Delete draft", role: .destructive) {
                            if let saved = target.saved { draft.set("", path: target.path, anchor: saved) }
                            dismiss()
                        }
                    }
                }
            }
        }
        .presentationDetents([.fraction(0.42), .large])
        .presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.42)))
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .onAppear {
            text = target.saved.flatMap { draft.comment(path: target.path, anchor: $0) } ?? ""
            focused = true
        }
        .accessibilityIdentifier("line-draft-sheet")
    }

    private var isNit: Bool { text.lowercased().hasPrefix("nit:") }

    private func toggleNit() {
        if isNit {
            text = String(text.dropFirst(4)).trimmingCharacters(in: .whitespaces)
        } else {
            text = "Nit: " + text
        }
    }

    private func save() {
        // A draft that moved to other lines leaves its old place.
        if let saved = target.saved, saved != target.anchor { draft.set("", path: target.path, anchor: saved) }
        draft.set(text, path: target.path, anchor: target.anchor, startLine: target.startLine)
        dismiss()
    }

    private func chip(_ title: String, systemImage: String?, id: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage { Image(systemName: systemImage).font(.system(size: 12, weight: .semibold)) }
                Text(title)
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(on ? BD.accentText : BD.text)
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(on ? BD.accentSoft : BD.fill2, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

// MARK: - Re-review

/// On top of a re-review's first look at a file: what was pushed since your review, and the choice between that diff
/// and every file.
struct ReReviewBanner: View {
    let session: ReviewSession

    var body: some View {
        if let since = session.sinceFiles, let all = session.files {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: "arrow.counterclockwise").font(.system(size: 14, weight: .semibold)).foregroundStyle(BD.yellow).padding(.top, 2)
                    Text("\(Text("Re-review.").fontWeight(.semibold).foregroundStyle(BD.text)) \(sentence(since: since, all: all))")
                        .font(.system(size: 13.5))
                        .foregroundStyle(BD.text2)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                Picker("Show", selection: Binding(get: { session.scope }, set: { scope in withAnimation(.snappy) { session.setScope(scope) } })) {
                    Text("Since your review").tag(ReviewSession.Scope.sinceReview)
                    Text(all.files.count == 1 ? "The 1 file" : "All \(all.files.count) files").tag(ReviewSession.Scope.all)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("rereview-scope")
            }
            .padding(12)
            .background(BD.yellowSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 4)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("rereview-banner")
        }
    }

    /// "Tom pushed 2 commits since your review, 1 d ago. They touch 3 of the 14 files."
    private func sentence(since: PrFiles, all: PrFiles) -> String {
        let detail = session.detail
        let mine = (detail?.latestReviews ?? []).first { $0.commitSha == since.reviewedHeadSha && $0.commitsSince != nil }
        let who = detail?.author.firstName ?? "The author"
        let pushed: String = switch mine?.commitsSince {
        case 1?: "\(who) pushed 1 commit"
        case let count?: "\(who) pushed \(count) commits"
        case nil: "\(who) pushed commits"
        }
        let ago = ShortTime.age(mine?.submittedAt)
        let when = ago.isEmpty ? " since your review." : " since your review, \(ago) ago."
        let touched = since.files.count == 1 ? "It touches 1" : "They touch \(since.files.count)"
        return pushed + when + " \(touched) of the \(all.files.count) file\(all.files.count == 1 ? "" : "s")."
    }
}
