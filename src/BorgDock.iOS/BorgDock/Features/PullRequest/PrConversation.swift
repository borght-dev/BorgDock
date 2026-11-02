import SwiftUI

/// Review threads with the lines they were left on, then the conversation. Reply, resolve, jump to the proof.
struct PrConversationContent: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    let detail: PrDetail
    let onProof: () -> Void
    @State private var showResolved = false

    var body: some View {
        Group {
            if let conversation = app.focus.conversations[key.key] {
                let open = conversation.threads.filter { !$0.isResolved }
                let resolved = conversation.threads.filter(\.isResolved)
                VStack(spacing: 12) {
                    if open.isEmpty, conversation.comments.isEmpty, resolved.isEmpty {
                        Text("No comments yet.").font(.subheadline).foregroundStyle(BD.text2).padding(.top, 30)
                    }
                    ForEach(open) { ReviewThreadCard(key: key, thread: $0) }
                    ForEach(conversation.comments.sorted { $0.at < $1.at }) { comment in
                        CommentCard(comment: comment, showProof: !detail.proofImages.isEmpty && mentionsProof(comment.body), onProof: onProof)
                    }
                    if !resolved.isEmpty {
                        Button { withAnimation(.snappy) { showResolved.toggle() } } label: {
                            Label("\(resolved.count) resolved thread\(resolved.count == 1 ? "" : "s")", systemImage: showResolved ? "chevron.down" : "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(BD.text2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 8)
                        }
                        .buttonStyle(.plain)
                        if showResolved { ForEach(resolved) { ReviewThreadCard(key: key, thread: $0).opacity(0.7) } }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            }
        }
    }

    private func mentionsProof(_ body: String) -> Bool {
        let lower = body.lowercased()
        return lower.contains("proof") || lower.contains("screenshot")
    }
}

struct ReviewThreadCard: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    let thread: ReviewThread

    var body: some View {
        VStack(spacing: 0) {
            if let path = thread.path {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text").font(.system(size: 13))
                    Text(path).lineLimit(1).truncationMode(.head)
                    Spacer(minLength: 6)
                    if let line = thread.line { Text(verbatim: "L\(line)") }
                }
                .font(.system(size: 13.5, design: .monospaced))
                .foregroundStyle(BD.text2)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .overlay(alignment: .bottom) { Rectangle().fill(BD.separator).frame(height: 0.5) }
            }
            if let hunk = thread.diffHunk {
                let lines = UnifiedDiff.parse(hunk).filter { $0.kind != .hunk }.suffix(4)
                let language = SyntaxHighlighter.language(for: thread.path ?? "")
                VStack(spacing: 0) {
                    ForEach(Array(lines)) { DiffLineRow(line: $0, language: language, fontSize: 12.5) }
                }
                .padding(.vertical, 4)
            }
            VStack(alignment: .leading, spacing: 14) {
                ForEach(thread.comments) { CommentBody(comment: $0) }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 14)
            if !thread.isResolved {
                HStack(spacing: 0) {
                    Button { Task { await app.focus.resolve(key, threadId: thread.id) } } label: {
                        Text(app.busy.contains("resolve-\(thread.id)") ? "Resolving…" : "Resolve").frame(maxWidth: .infinity, minHeight: 48)
                    }
                    Rectangle().fill(BD.separator).frame(width: 0.5, height: 48)
                    Button { app.focus.replyTarget[key.key] = .thread(thread.id, name: thread.comments.last?.author.firstName ?? "") } label: {
                        Text("Reply").frame(maxWidth: .infinity, minHeight: 48)
                    }
                }
                .buttonStyle(.plain)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(BD.accentText)
                .overlay(alignment: .top) { Rectangle().fill(BD.separator).frame(height: 0.5) }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .bdCard()
    }
}

struct CommentCard: View {
    let comment: PrComment
    var showProof = false
    var onProof: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CommentBody(comment: comment)
            if !comment.reactions.isEmpty || showProof {
                HStack(spacing: 8) {
                    ForEach(comment.reactions, id: \.self) { reaction in
                        Text(verbatim: "\(ReactionContent.emoji(reaction.content)) \(reaction.count)")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(BD.text2)
                            .padding(.horizontal, 10)
                            .frame(height: 28)
                            .background(BD.fill, in: Capsule())
                    }
                    if showProof {
                        Button(action: onProof) { ToneChip(text: "Proof", systemImage: "photo", accent: true) }.buttonStyle(.plain)
                    }
                }
                .padding(.leading, 48)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard()
    }
}

struct CommentBody: View {
    let comment: PrComment

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PersonBadge(person: comment.author, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(comment.author.displayName).font(.system(size: 17, weight: .semibold)).foregroundStyle(BD.text)
                    Text(ShortTime.age(comment.at)).font(.system(size: 14)).foregroundStyle(BD.text3)
                }
                Text((try? AttributedString(markdown: comment.body, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(comment.body))
                    .font(.system(size: 16))
                    .foregroundStyle(BD.text)
                    .lineSpacing(3)
                    .tint(BD.accentText)
                    .textSelection(.enabled)
            }
        }
    }
}

/// Where a comment goes: a reply in a review thread, or the conversation.
enum ReplyTarget: Hashable {
    case conversation
    case thread(String, name: String)
}

/// The glass composer at the bottom of the Comments tab: keyboard or dictation, send.
struct CommentComposer: View {
    @Environment(AppModel.self) private var app
    let key: PrKey
    let detail: PrDetail
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        let target = app.focus.replyTarget[key.key] ?? .conversation
        let busy = app.busy.contains("comment-\(key.key)")
        HStack(spacing: 8) {
            if case .thread = target {
                Button { app.focus.replyTarget[key.key] = nil } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 20)).foregroundStyle(BD.text3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Comment on the pull request instead")
            }
            TextField(placeholder(target), text: $text, axis: .vertical)
                .lineLimit(1...5)
                .font(.system(size: 17))
                .focused($focused)
            if text.isEmpty {
                Image(systemName: "mic").font(.system(size: 19)).foregroundStyle(BD.text2)
                    .accessibilityHidden(true)
            }
            Button { send(target) } label: {
                Image(systemName: busy ? "ellipsis" : "arrow.up")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? BD.text3 : BD.accent, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send")
        }
        .padding(.leading, 20)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 27, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
        .onChange(of: target) { if case .thread = target { focused = true } }
    }

    private func placeholder(_ target: ReplyTarget) -> String {
        switch target {
        case .thread(_, let name): return name.isEmpty ? "Reply…" : "Reply to \(name)…"
        case .conversation:
            let last = app.focus.conversations[key.key]?.comments.max { $0.at < $1.at }
            if let last, !app.focus.myLogins.contains(last.author.login) { return "Reply to \(last.author.firstName)…" }
            return "Comment on #\(detail.number)…"
        }
    }

    private func send(_ target: ReplyTarget) {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        let threadId: String? = if case .thread(let id, _) = target { id } else { nil }
        Task {
            if await app.focus.postComment(key, body: body, threadId: threadId) {
                text = ""
                focused = false
                app.focus.replyTarget[key.key] = nil
            }
        }
    }
}
