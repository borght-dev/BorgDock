import SwiftUI

/// One T3 thread: your messages, the agent's work folded to one line, its last message in full, the plan or the
/// questions waiting on you, and a composer. Every message, answer and approval is signed with the device key.
struct ThreadView: View {
    let id: String

    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    @State private var detail: ThreadDetail?
    @State private var loadError: String?
    @State private var text = ""
    @State private var sending = false
    @State private var draft: AnswerDraft?
    @State private var expandedActivity = false
    @FocusState private var composerFocused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if let detail {
                    content(detail)
                        .padding(.bottom, 16)
                } else if let loadError {
                    StatusCard(icon: "exclamationmark.triangle", text: loadError, tone: .warn)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 80)
                }
            }
            .defaultScrollAnchor(.top, for: .alignment)
            .defaultScrollAnchor(.bottom, for: .initialOffset)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: detail?.messages.count) { _, _ in
                withAnimation { proxy.scrollTo("end", anchor: .bottom) }
            }
        }
        .background(BD.bg)
        .safeAreaInset(edge: .bottom) { composer }
        .navigationTitle(detail?.thread.title ?? "Thread")
        .navigationSubtitle(detail.map(subtitle) ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { moreMenu } }
        .tint(BD.text)
        .task(id: id) { await load() }
        .refreshable { await load() }
    }

    private func subtitle(_ detail: ThreadDetail) -> String {
        [detail.machine, detail.thread.environmentLabel == detail.machine ? nil : detail.thread.environmentLabel, detail.place]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func load() async {
        do {
            let fresh = try await app.api.thread(id)
            detail = fresh
            loadError = nil
            if let requestId = fresh.thread.questionRequestId, draft?.requestId != requestId {
                draft = AnswerDraft(requestId: requestId, questions: fresh.thread.questions)
            } else if fresh.thread.questionRequestId == nil {
                draft = nil
            }
        } catch is CancellationError {
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error); return }
            loadError = error.localizedDescription
        }
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ detail: ThreadDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            chips(detail)
                .frame(maxWidth: .infinity)
            let lastAssistant = detail.messages.lastIndex { $0.role == .assistant }
            ForEach(Array(detail.messages.enumerated()), id: \.element.id) { index, message in
                if index == lastAssistant, let activity = detail.activity {
                    activityLine(activity)
                }
                switch message.role {
                case .user: UserBubble(text: message.text)
                case .assistant: ChatMarkdown(text: message.text).foregroundStyle(BD.text)
                }
            }
            if detail.planReady {
                planCard
            }
            if let draft, detail.thread.status == .question, !detail.thread.questions.isEmpty {
                QuestionCard(questions: detail.thread.questions, draft: Binding(get: { draft }, set: { self.draft = $0 })) { answers in
                    Task { await answer(detail.thread, requestId: draft.requestId, answers: answers) }
                }
            }
            Color.clear.frame(height: 1).id("end")
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private func chips(_ detail: ThreadDetail) -> some View {
        let thread = detail.thread
        let age = CompactTime.ago(thread.lastActivityAt)
        let status: (String, Tone) = if let label = thread.needsYouLabel {
            ("\(label) · \(age)", .bad)
        } else if thread.status == .running {
            ("Running", .run)
        } else {
            ("\(thread.status.sentence) · \(age)", .mute)
        }
        return HStack(spacing: 6) {
            ToneChip(text: status.0, tone: status.1)
            ToneChip(text: ModelName.display(thread.model).replacingOccurrences(of: "Claude ", with: ""), tone: .mute)
            if let itemId = detail.itemId {
                Button { app.router.push(ItemRoute(id: itemId)) } label: { ToneChip(text: "AB#\(String(itemId))", tone: .mute) }
                    .buttonStyle(.plain)
            }
        }
    }

    private func activityLine(_ activity: ThreadDetail.Activity) -> some View {
        Button { withAnimation(.snappy) { expandedActivity.toggle() } } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 7) {
                    Image(systemName: "apple.terminal")
                    Text("Read \(activity.reads) files · ran \(activity.commands) commands · \(activity.minutes) min")
                    Image(systemName: expandedActivity ? "chevron.up" : "chevron.down").font(.system(size: 11, weight: .semibold))
                }
                if expandedActivity {
                    Text("The agent's tool calls stay in T3. Open the thread there to see each read and command.")
                        .font(.system(size: 13))
                        .foregroundStyle(BD.text3)
                }
            }
            .font(.system(size: 14))
            .foregroundStyle(BD.text3)
        }
        .buttonStyle(.plain)
    }

    private var planCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "questionmark.circle").foregroundStyle(BD.yellow).font(.system(size: 18))
                Text("The agent waits for your go-ahead").font(.system(size: 15.5, weight: .semibold))
            }
            HStack(spacing: 8) {
                Button("Change something") {
                    text = "About the plan: "
                    composerFocused = true
                }
                .buttonStyle(.bd(.plain, height: 46))
                Button { Task { await approvePlan() } } label: {
                    if app.isBusy("approve:\(id)") { ProgressView() } else { Text("Approve plan") }
                }
                .buttonStyle(.bd(.primary, height: 46))
                .accessibilityIdentifier("approve-plan")
            }
        }
        .padding(14)
        .bdCard(radius: 22, fill: BD.card2)
        .padding(.top, 2)
    }

    private var moreMenu: some View {
        Menu {
            if let thread = detail?.thread {
                let urls = T3Link.candidates(appLink: thread.appLink, link: thread.link)
                if !urls.isEmpty {
                    Button { Task { await T3Link.open(urls) } } label: { Label("Open in T3", systemImage: "arrow.up.forward.app") }
                }
                Button {
                    app.router.present(.launch(LaunchContext(itemId: detail?.itemId, threadId: thread.id)))
                } label: { Label("Start an agent beside it", systemImage: "plus.square.on.square") }
                if let itemId = detail?.itemId {
                    Button { app.router.push(ItemRoute(id: itemId)) } label: { Label("Open AB#\(String(itemId))", systemImage: "square.text.square") }
                }
                if thread.status != .settled {
                    Button(role: .destructive) { Task { await settle(thread) } } label: { Label("Settle thread", systemImage: "checkmark.circle") }
                }
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("More")
    }

    // MARK: Composer

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            GlassIconButton(systemImage: "plus", label: "Start an agent beside this thread", size: 50) {
                app.router.present(.launch(LaunchContext(itemId: detail?.itemId, threadId: id)))
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Message the agent…", text: $text, axis: .vertical)
                    .font(.system(size: 16.5))
                    .lineLimit(1...6)
                    .focused($composerFocused)
                    .padding(.vertical, 14)
                    .accessibilityIdentifier("thread-composer")
                Button { Task { await send() } } label: {
                    Group {
                        if sending { ProgressView().controlSize(.small) } else { Image(systemName: "arrow.up").font(.system(size: 17, weight: .bold)) }
                    }
                    .frame(width: 38, height: 38)
                    .foregroundStyle(canSend ? BD.onAccent : BD.text3)
                    .background(canSend ? BD.accent : BD.fill2, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .padding(.bottom, 6)
                .accessibilityLabel("Send")
            }
            .padding(.leading, 18)
            .padding(.trailing, 6)
            .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 25, style: .continuous))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    private var canSend: Bool { !sending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    // MARK: Actions

    private func send() async {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, await app.account.authorize("Send a message to the agent") else { return }
        sending = true
        defer { sending = false }
        do {
            _ = try await app.api.sendMessage(threadId: id, text: message)
            text = ""
            composerFocused = false
            app.toasts.show("Sent. The agent is working again.")
            app.refreshAfterWrite()
            await load()
        } catch {
            app.report(error)
        }
    }

    private func approvePlan() async {
        guard await app.account.authorize("Approve the agent's plan") else { return }
        let key = "approve:\(id)"
        app.busy.insert(key)
        defer { app.busy.remove(key) }
        do {
            _ = try await app.api.approvePlan(threadId: id)
            app.toasts.show("Plan approved. The agent is working on it.")
            app.refreshAfterWrite()
            await load()
        } catch {
            app.report(error)
        }
    }

    private func answer(_ thread: ThreadSummary, requestId: String, answers: [String: AnswerValue]) async {
        guard await app.account.authorize("Answer the agent") else { return }
        if await app.answer(thread, requestId: requestId, answers: answers) { await load() }
    }

    private func settle(_ thread: ThreadSummary) async {
        guard await app.account.authorize("Settle the thread") else { return }
        if await app.settle(thread) { await load() }
    }
}

/// Your message, right-aligned in indigo.
private struct UserBubble: View {
    let text: String

    var body: some View {
        HStack {
            Spacer(minLength: 48)
            Text(ChatMarkdown.inline(text, size: 15))
                .font(.system(size: 15))
                .foregroundStyle(BD.text)
                .lineSpacing(3)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(BD.accentSoft, in: UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 20, bottomTrailingRadius: 6, topTrailingRadius: 20, style: .continuous))
                .textSelection(.enabled)
        }
    }
}

/// The agent's questions with their options; the recommended one starts picked.
private struct QuestionCard: View {
    let questions: [AgentQuestion]
    @Binding var draft: AnswerDraft
    let send: ([String: AnswerValue]) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(questions, id: \.id) { question in
                VStack(alignment: .leading, spacing: 8) {
                    Text(question.question).font(.system(size: 15.5, weight: .semibold))
                    let choice = draft.choice(for: question)
                    ForEach(Array(question.options.enumerated()), id: \.offset) { index, option in
                        Button { draft.pick(index, in: question) } label: {
                            HStack(spacing: 10) {
                                Image(systemName: choice.picked.contains(index) ? "largecircle.fill.circle" : "circle")
                                    .foregroundStyle(choice.picked.contains(index) ? BD.accent : BD.text3)
                                Text(option.label).foregroundStyle(BD.text).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                                if question.recommended == index { ToneChip(text: "Recommended", tone: .ok, small: true) }
                            }
                            .font(.system(size: 15))
                            .padding(.vertical, 4)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    if question.allowCustomAnswer {
                        TextField("Or answer in your own words", text: Binding(
                            get: { draft.choice(for: question).customText },
                            set: { value in
                                draft.setCustomText(value, for: question)
                                if !value.isEmpty, !draft.choice(for: question).custom { draft.pickCustom(in: question) }
                            }
                        ), axis: .vertical)
                        .font(.system(size: 15))
                        .padding(10)
                        .background(BD.fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
            }
            Button("Send answer") {
                if let answers = draft.answers(for: questions) { send(answers) }
            }
            .buttonStyle(.bd(.primary, height: 46))
            .disabled(draft.answers(for: questions) == nil)
        }
        .padding(14)
        .bdCard(radius: 22, fill: BD.card2)
    }
}
