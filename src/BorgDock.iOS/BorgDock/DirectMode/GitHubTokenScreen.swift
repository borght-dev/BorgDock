import SwiftUI

/// A GitHub token, checked the moment you paste it: who it is, what it may do and what a missing permission costs,
/// before it is kept. One account per token; the label is only for you. Used by the first run's step 1, by Add an
/// account and by Replace the token in Settings.
struct GitHubTokenScreen: View {
    @Environment(AppModel.self) private var app
    let session: DirectSession
    var step: String?
    /// The login whose token is being replaced; another account's token is refused there.
    var replacing: String?
    let onAdded: (Person) -> Void

    @State private var token = ""
    @State private var check = Check.idle
    @State private var label = AccountLabel.work
    @State private var customLabel = ""
    @State private var saveError: String?

    enum Check: Equatable {
        case idle, checking
        case facts(GitHubTokenFacts)
        case failed(String)
    }

    /// Repo and read:org ticked: the scopes the app is known to work with.
    private static let classicURL = URL(string: "https://github.com/settings/tokens/new?scopes=repo,read:org&description=BorgDock%20Review")!
    /// GitHub's page for a fine-grained token, with its name filled in.
    private static let fineGrainedURL = URL(string: "https://github.com/settings/personal-access-tokens/new?name=BorgDock%20Review&pull_requests=write&contents=write&actions=write")!

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SetupLabel(title: "Token")
                VStack(spacing: 0) {
                    TokenField(placeholder: "ghp_… or github_pat_…", text: $token, identifier: "github-token")
                    Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, 16)
                    SetupLinkRow(title: "Create a token on github.com", detail: "Opens with repo and read:org ticked", url: Self.classicURL)
                }
                .bdCard(radius: 20)
                Text("Make it on your Mac, copy it, and Paste picks it up from the shared clipboard. A fine-grained token works too: give it Pull requests and Contents read and write, and Actions read and write for Rerun.")
                    .font(.system(size: 13))
                    .foregroundStyle(BD.text3)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
                    .padding(.top, 8)
                Link("Create a fine-grained token instead", destination: Self.fineGrainedURL)
                    .font(.system(size: 13, weight: .semibold))
                    .tint(BD.accentText)
                    .padding(.horizontal, 4)
                    .padding(.top, 6)

                switch check {
                case .idle:
                    EmptyView()
                case .checking:
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Asking GitHub what this token may do…").font(.system(size: 14.5)).foregroundStyle(BD.text2)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 24)
                case .failed(let message):
                    notice(message, tone: .bad, icon: "exclamationmark.triangle.fill").padding(.top, 20)
                case .facts(let facts):
                    tokenCard(facts)
                    if let mismatch = mismatch(facts) {
                        notice(mismatch, tone: .bad, icon: "person.crop.circle.badge.exclamationmark").padding(.top, 12)
                    } else {
                        labelPicker
                    }
                }
                if let saveError { notice(saveError, tone: .bad, icon: "exclamationmark.triangle.fill").padding(.top, 12) }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(BD.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { SetupTitle(title: replacing == nil ? "GitHub account" : "Replace the token", step: step) }
        .safeAreaInset(edge: .bottom) { addButton }
        .task(id: token) { await checkToken() }
        .onAppear(perform: prefill)
        .accessibilityIdentifier("github-token-screen")
    }

    // MARK: Parts

    private func tokenCard(_ facts: GitHubTokenFacts) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SetupLabel(title: "This token")
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    PersonAvatar(name: facts.person.displayName, size: 36)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(facts.person.login).font(.system(size: 16, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                        Text(facts.reach).font(.system(size: 13.5)).foregroundStyle(BD.text2).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    if facts.isUseless {
                        ToneChip(text: "Can't read", tone: .bad, systemImage: "xmark", small: true)
                    } else {
                        ToneChip(text: "Works", tone: .ok, systemImage: "checkmark", small: true)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("token-who")
                ForEach(facts.rows()) { row in
                    Rectangle().fill(BD.separator).frame(height: 0.5).padding(.leading, 50)
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: icon(row.mark))
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(color(row.mark))
                            .frame(width: 22)
                            .padding(.top, 1)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(row.title).font(.system(size: 15, weight: .medium)).foregroundStyle(row.mark == .optional ? BD.text2 : BD.text)
                            if !row.detail.isEmpty {
                                Text(row.detail).font(.system(size: 13)).foregroundStyle(BD.text2).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .accessibilityElement(children: .combine)
                }
            }
            .bdCard(radius: 20)
        }
    }

    private var labelPicker: some View {
        VStack(alignment: .leading, spacing: 0) {
            SetupLabel(title: "Show it as")
            HStack(spacing: 8) {
                ForEach(AccountLabel.allCases) { choice in
                    let on = label == choice
                    Button { label = choice } label: {
                        Text(choice.title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(on ? BD.bg : BD.text2)
                            .padding(.horizontal, 14)
                            .frame(height: 36)
                            .background(on ? BD.text : BD.fill2, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("account-label-\(choice.rawValue)")
                }
            }
            if label == .other {
                TextField("A word for this account", text: $customLabel)
                    .font(.system(size: 16))
                    .padding(.horizontal, 16)
                    .frame(height: 48)
                    .bdCard(radius: 16)
                    .padding(.top, 10)
                    .accessibilityIdentifier("account-label-custom")
            }
            Text("Only for you: it names the account in Settings and when its token runs out.")
                .font(.system(size: 13))
                .foregroundStyle(BD.text3)
                .padding(.horizontal, 4)
                .padding(.top, 8)
        }
    }

    @ViewBuilder
    private var addButton: some View {
        if case .facts(let facts) = check {
            Button { add(facts) } label: {
                Text(replacing == nil ? "Add \(facts.person.login)" : "Use this token for \(facts.person.login)")
            }
            .buttonStyle(.bdPrimary)
            .disabled(facts.isUseless || mismatch(facts) != nil)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            .accessibilityIdentifier("github-add")
        }
    }

    private func notice(_ text: String, tone: Tone, icon: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(tone.color).padding(.top, 1)
            Text(text).font(.system(size: 14)).foregroundStyle(BD.text).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("token-notice")
    }

    private func icon(_ mark: GitHubTokenFacts.Row.Mark) -> String {
        switch mark {
        case .ok: "checkmark.circle"
        case .missing: "xmark.circle"
        case .optional: "minus.circle"
        case .note: "info.circle"
        case .expiry: "clock"
        }
    }

    private func color(_ mark: GitHubTokenFacts.Row.Mark) -> Color {
        switch mark {
        case .ok: BD.green
        case .missing: BD.red
        case .optional, .note, .expiry: BD.text3
        }
    }

    // MARK: Checking and adding

    /// A token for someone else can't replace this account's.
    private func mismatch(_ facts: GitHubTokenFacts) -> String? {
        guard let replacing, facts.person.login.caseInsensitiveCompare(replacing) != .orderedSame else { return nil }
        return "This token belongs to \(facts.person.login), not \(replacing). Add it as its own account instead."
    }

    private func checkToken() async {
        saveError = nil
        guard GitHubTokenCheck.looksLikeToken(token) else {
            check = .idle
            return
        }
        // Typing fires this per character; a paste settles at once.
        try? await Task.sleep(for: .milliseconds(450))
        if Task.isCancelled { return }
        check = .checking
        do {
            let facts = try await session.checkGitHubToken(token)
            if Task.isCancelled { return }
            check = .facts(facts)
        } catch is CancellationError {
        } catch {
            check = .failed(error.localizedDescription)
        }
    }

    private func prefill() {
        if let replacing, let account = session.credentials.gitHub.first(where: { $0.login.caseInsensitiveCompare(replacing) == .orderedSame }) {
            (label, customLabel) = AccountLabel.parse(account.label)
        } else if !session.credentials.gitHub.isEmpty {
            // The second account is usually the other one.
            let taken = Set(session.credentials.gitHub.compactMap(\.label))
            label = taken.contains(AccountLabel.work.title) ? .personal : .work
        }
        #if DEBUG
        if SetupDebugRoute.isOn, token.isEmpty { token = SetupDebugRoute.token }
        #endif
    }

    private func add(_ facts: GitHubTokenFacts) {
        do {
            try session.addGitHubAccount(token: token, facts: facts, label: label == .other ? customLabel : label.title)
            token = ""
            onAdded(facts.person)
        } catch {
            saveError = error.localizedDescription
        }
    }
}

/// "Work", "Personal" or a word of your own.
enum AccountLabel: String, CaseIterable, Identifiable {
    case work, personal, other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .work: "Work"
        case .personal: "Personal"
        case .other: "Other…"
        }
    }

    /// The choice and the custom word a stored label stands for.
    static func parse(_ label: String?) -> (AccountLabel, String) {
        guard let label, !label.isEmpty, label != AccountLabel.work.title else { return (.work, "") }
        return label == AccountLabel.personal.title ? (.personal, "") : (.other, label)
    }
}
