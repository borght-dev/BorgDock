import SwiftUI

/// Decide where you finished: the overall comment, your line drafts with a jump to each, and the outcomes.
/// Request changes and Comment post at once; Approve moves on and waits out its Undo.
struct DecideSheet: View {
    @Environment(AppModel.self) private var app
    let session: ReviewSession
    @Binding var draft: ReviewDraft
    let onDecided: () -> Void
    let onJump: (String) -> Void
    @FocusState private var focused: Bool

    var body: some View {
        let key = session.key
        let locked = session.left > 0
        let busy = app.busy.contains("review-\(key.key)")
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: locked ? "lock.circle" : "checkmark.circle")
                        .font(.system(size: 30))
                        .foregroundStyle(locked ? BD.text3 : BD.green)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(locked ? "\(session.left) left to review" : "All \(session.walk.total) files reviewed")
                            .font(.system(size: 21, weight: .bold))
                            .foregroundStyle(BD.text)
                        Text(verbatim: "Your decision on #\(key.number)").font(.system(size: 15)).foregroundStyle(BD.text2)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, 20)

                TextField("Leave a comment", text: $draft.body, axis: .vertical)
                    .lineLimit(3...8)
                    .font(.system(size: 17))
                    .focused($focused)
                    .padding(14)
                    .frame(minHeight: 96, alignment: .topLeading)
                    .background(BD.fill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

                let comments = draft.lineComments
                if !comments.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(Array(comments.enumerated()), id: \.offset) { index, comment in
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(verbatim: "\(comment.path.splitPath.name):\(comment.line)")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(BD.accentText)
                                    Text(comment.body).font(.system(size: 15.5)).foregroundStyle(BD.text).lineLimit(1)
                                }
                                Spacer(minLength: 6)
                                Button("Jump") { onJump(comment.path) }
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(BD.accentText)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 11)
                            if index < comments.count - 1 { Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, 16) }
                        }
                    }
                    .background(BD.fill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }

                HStack(spacing: 12) {
                    Button("Request changes") { post(.requestChanges) }
                        .buttonStyle(.bd(.danger, height: 50))
                        .disabled(busy || draft.isEmpty)
                    Button("Comment") { post(.comment) }
                        .buttonStyle(.bd(.plain, height: 50))
                        .disabled(busy || draft.isEmpty)
                }
                .padding(.top, 4)

                Button { approve(thenMerge: false) } label: {
                    if locked {
                        Label("Approve · \(session.left) left", systemImage: "lock")
                    } else {
                        Label("Approve", systemImage: "checkmark")
                    }
                }
                .buttonStyle(.bdPrimary)
                .disabled(locked || busy)

                if let detail = session.detail, !detail.isMine, !detail.autoMerge {
                    Button("Approve & auto-merge") { approve(thenMerge: true) }
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(locked ? BD.text3 : BD.green)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 2)
                        .disabled(locked || busy)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(BD.sheet)
        .presentationDetents([.fraction(0.64), .large])
        .presentationDragIndicator(.visible)
    }

    private func post(_ event: ReviewEvent) {
        guard let headSha = session.files?.headSha else { return }
        let key = session.key
        let snapshot = draft
        Task {
            if await app.focus.submitReview(key, event: event, draft: snapshot, headSha: headSha) { onDecided() }
        }
    }

    private func approve(thenMerge: Bool) {
        guard let headSha = session.files?.headSha, let detail = session.detail else { return }
        let key = session.key
        let snapshot = draft
        let merge = thenMerge ? MergeRequest(method: detail.defaultMergeMethod, commitTitle: detail.squashTitle, commitMessage: "",
                                             deleteBranch: detail.deleteBranchOnMerge, headSha: headSha) : nil
        let app = self.app
        Task {
            let held = await app.focus.approve(key, draft: snapshot, headSha: headSha, thenMerge: merge) {
                app.focus.reopenDecision = key.key
                if app.router.cover == nil { app.router.review([key]) }
            }
            if held {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                onDecided()
            }
        }
    }
}
