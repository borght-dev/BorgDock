import Foundation

// What a GitHub token is and may do, read the moment you paste it, so the screen can say what it can and can't do
// before you go on. GitHub tells a classic token's scopes and any token's expiry in the headers of an answer. It never
// tells a fine-grained token's permissions, so those are tried: one read of pull requests and one of Actions.

/// A token as GitHub describes it.
struct GitHubTokenFacts: Equatable, Sendable {
    enum Kind: String, Codable, Sendable {
        /// `ghp_…`: scopes, named in every answer.
        case classic
        /// `github_pat_…`: permissions per repository, which GitHub doesn't name.
        case fineGrained
        /// An OAuth or app token.
        case other
    }

    enum Answer: Equatable, Sendable { case yes, no, unknown }

    let person: Person
    let kind: Kind
    /// A classic token's scopes; nil when GitHub named none.
    let scopes: [String]?
    let expiresAt: Date?
    /// How many repositories the token reads; nil when the list couldn't be read.
    let repositories: Int?
    /// Some organizations want single sign-on authorized for the token and haven't got it.
    let singleSignOnMissing: Bool
    let readsPullRequests: Answer
    let readsActions: Answer

    /// Whether Rerun can be offered: a classic token with `repo` may; a fine-grained one that can't even read Actions
    /// may not; for the rest GitHub says so the first time a rerun is tried.
    var mayRerun: Answer {
        switch kind {
        case .classic: scopes?.contains("repo") == true ? .yes : .no
        case .fineGrained, .other: readsActions == .no ? .no : .unknown
        }
    }

    /// The token can do nothing for this app: adding it would only show an empty list.
    var isUseless: Bool {
        switch kind {
        case .classic: !(scopes ?? []).contains { $0 == "repo" || $0 == "public_repo" }
        case .fineGrained, .other: readsPullRequests == .no
        }
    }
}

extension GitHubTokenFacts {
    /// One line of the "This token" card.
    struct Row: Equatable, Sendable, Identifiable {
        enum Mark: Equatable, Sendable { case ok, missing, optional, note, expiry }

        let mark: Mark
        let title: String
        let detail: String

        var id: String { title }
    }

    /// What the token may do and what a missing permission costs.
    func rows(now: Date = Date()) -> [Row] {
        var rows: [Row] = []
        switch kind {
        case .classic:
            let scopes = Set(scopes ?? [])
            if scopes.contains("repo") {
                rows.append(Row(mark: .ok, title: "Pull requests: read and write", detail: "Reviews, comments, merging"))
                rows.append(Row(mark: .ok, title: "Actions: read and write", detail: "The error from a check's log, and Rerun"))
            } else if scopes.contains("public_repo") {
                rows.append(Row(mark: .missing, title: "Public repositories only", detail: "Private ones need the repo scope"))
            } else {
                rows.append(Row(mark: .missing, title: "No repo scope", detail: "It can't read your pull requests"))
            }
            if !scopes.isDisjoint(with: ["read:org", "write:org", "admin:org"]) {
                rows.append(Row(mark: .ok, title: "Teams: read", detail: "Review requests for your teams"))
            } else {
                rows.append(Row(mark: .optional, title: "Teams: not readable", detail: "Requests for your teams won't show. read:org adds them."))
            }
        case .fineGrained, .other:
            switch readsPullRequests {
            case .yes: rows.append(Row(mark: .ok, title: "Pull requests: readable", detail: "Reviewing needs write, merging Contents write. GitHub says so on first use."))
            case .no: rows.append(Row(mark: .missing, title: "Pull requests: not readable", detail: "Give the token Pull requests: read and write"))
            case .unknown: rows.append(Row(mark: .note, title: "Pull requests: not checked", detail: "The token reads no repository to try it on"))
            }
            switch readsActions {
            case .yes: rows.append(Row(mark: .ok, title: "Actions: readable", detail: "The error from a check's log. Rerun needs write."))
            case .no: rows.append(Row(mark: .optional, title: "Actions: not readable", detail: "No failure reasons and no Rerun for this account"))
            case .unknown: break
            }
        }
        if singleSignOnMissing {
            rows.append(Row(mark: .optional, title: "Single sign-on not authorized", detail: "Some organizations' repositories are missing"))
        }
        if let expiresAt {
            let days = Int(expiresAt.timeIntervalSince(now) / 86_400)
            let date = expiresAt.formatted(.dateTime.day().month(.wide).year())
            rows.append(Row(mark: .expiry, title: expiresAt <= now ? "Expired \(date)" : "Expires \(date)", detail: days < 0 ? "" : days == 0 ? "Today" : days == 1 ? "Tomorrow" : days < 14 ? "In \(days) days" : ""))
        } else {
            rows.append(Row(mark: .expiry, title: "Doesn't expire", detail: ""))
        }
        return rows
    }

    /// "acme · reads 41 repositories".
    var reach: String {
        switch repositories {
        case nil: "Reads your repositories"
        case 0?: "Reads no repository"
        case 1?: "Reads 1 repository"
        case let count?: "Reads \(count) repositories"
        }
    }
}

enum GitHubTokenCheck {
    static func kind(of token: String) -> GitHubTokenFacts.Kind {
        if token.hasPrefix("github_pat_") { return .fineGrained }
        if token.hasPrefix("ghp_") { return .classic }
        return .other
    }

    /// Whether the text can be a token at all: GitHub's are one word of forty characters or more.
    static func looksLikeToken(_ text: String) -> Bool {
        let token = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return token.count >= 20 && !token.contains(where: \.isWhitespace)
    }

    /// Asks GitHub who the token is and what it may do. Throws when GitHub refuses it.
    static func inspect(token: String, session: URLSession = .shared) async throws -> GitHubTokenFacts {
        let client = GitHubClient(account: GitHubAccount(login: "this token", token: token), session: session)
        do {
            let (userBody, user) = try await client.answer("GET", "/user")
            guard user.statusCode == 200, let me = try? JSONDecoder().decode(RawUser.self, from: userBody) else {
                throw GitHubError(status: user.statusCode, message: user.statusCode == 401 ? "GitHub doesn't know this token. Check that all of it was copied." : "GitHub answered \(user.statusCode) for this token.")
            }
            var kind = kind(of: token)
            let named = user.value(forHTTPHeaderField: "X-OAuth-Scopes")
            let scopes = named.map { $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
            // A token GitHub names scopes for is a classic one, whatever it starts with.
            if kind == .other, let scopes, !scopes.isEmpty { kind = .classic }

            let (reposBody, repos) = try await client.answer("GET", "/user/repos?per_page=1&sort=pushed")
            let first = repos.statusCode == 200 ? (try? JSONDecoder().decode([RawRepository].self, from: reposBody))?.first : nil
            let count: Int? = repos.statusCode == 200 ? (lastPage(repos.value(forHTTPHeaderField: "Link")) ?? (first == nil ? 0 : 1)) : nil
            let singleSignOn = [user, repos].contains { ($0.value(forHTTPHeaderField: "X-GitHub-SSO") ?? "").contains("partial-results") }

            var pulls = GitHubTokenFacts.Answer.unknown
            var actions = GitHubTokenFacts.Answer.unknown
            if kind != .classic, let name = first?.full_name {
                pulls = try await reads(client, "/repos/\(name)/pulls?per_page=1&state=all")
                actions = try await reads(client, "/repos/\(name)/actions/runs?per_page=1")
            }
            return GitHubTokenFacts(
                person: Person(login: me.login, name: me.name, avatarUrl: me.avatar_url), kind: kind, scopes: kind == .classic ? scopes ?? [] : nil,
                expiresAt: expiry(user.value(forHTTPHeaderField: "github-authentication-token-expiration")), repositories: count,
                singleSignOnMissing: singleSignOn, readsPullRequests: pulls, readsActions: actions
            )
        } catch let error as GitHubError {
            throw error.shown
        }
    }

    private static func reads(_ client: GitHubClient, _ path: String) async throws -> GitHubTokenFacts.Answer {
        switch try await client.answer("GET", path).1.statusCode {
        case 200..<300: .yes
        case 403: .no
        // 404 is also what a repository without Actions answers: that says nothing about the token.
        default: .unknown
        }
    }

    /// `<…&page=41>; rel="last"`: with one item a page, the last page's number is the count.
    static func lastPage(_ link: String?) -> Int? {
        guard let link else { return nil }
        for part in link.split(separator: ",") where part.contains("rel=\"last\"") {
            if let match = part.firstMatch(of: #/[?&]page=(\d+)/#) { return Int(match.output.1) }
        }
        return nil
    }

    /// "2027-02-20 10:00:00 UTC", or with a numeric offset.
    static func expiry(_ header: String?) -> Date? {
        guard let header, !header.isEmpty else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        for format in ["yyyy-MM-dd HH:mm:ss zzz", "yyyy-MM-dd HH:mm:ss Z", "yyyy-MM-dd HH:mm:ss ZZZZZ"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: header) { return date }
        }
        return GitHubTime.date(header)
    }

    private struct RawUser: Decodable {
        let login: String
        let name: String?
        let avatar_url: String?
    }

    private struct RawRepository: Decodable {
        let full_name: String
    }
}

/// A repository an account can read, for the list of what to watch.
struct AvailableRepository: Codable, Hashable, Sendable, Identifiable {
    /// `owner/repo`.
    let name: String
    let pushedAt: String?
    let isPrivate: Bool
    let isArchived: Bool

    var id: String { name.lowercased() }
}

/// An account whose last read of the list failed entirely: its pull requests on screen are old, or missing.
struct AccountTrouble: Equatable, Sendable, Identifiable {
    let login: String
    /// GitHub refused the token: expired, revoked, or mistyped.
    let tokenRefused: Bool
    let message: String

    var id: String { login.lowercased() }
}

extension GitHubDirect {
    private struct RawRepository: Decodable, Sendable {
        let full_name: String
        let pushed_at: String?
        let `private`: Bool?
        let archived: Bool?
    }

    /// Pages of an account's repositories read for the list: the three hundred pushed to last.
    private static let repositoryPages = 3

    /// The repositories each account reads, newest push first; archived ones are left out. An account that can't be
    /// read has none.
    func availableRepositories() async -> [String: [AvailableRepository]] {
        var found: [String: [AvailableRepository]] = [:]
        for login in logins {
            guard let client = try? client(login) else { continue }
            var list: [AvailableRepository] = []
            for page in 1...Self.repositoryPages {
                guard let batch = try? await client.rest("GET", "/user/repos?per_page=100&sort=pushed&page=\(page)", as: [RawRepository].self) else { break }
                list += batch.filter { $0.archived != true }.map {
                    AvailableRepository(name: $0.full_name, pushedAt: $0.pushed_at, isPrivate: $0.private ?? false, isArchived: false)
                }
                if batch.count < 100 { break }
            }
            found[login] = list
        }
        return found
    }

    /// Open pull requests that involve you, per repository (`owner/repo`, lower-cased), from the last read of the
    /// list: the repositories you work in, which start switched on.
    func involvement() -> [String: Int] {
        var counts: [String: Int] = [:]
        for record in records.values where record.state == .open {
            let mine = record.isMine(record.account) || record.needsYou(record.account, teams: teamsOf(record.account)) || record.myReview(record.account) != nil
            if mine { counts["\(record.owner)/\(record.repo)".lowercased(), default: 0] += 1 }
        }
        return counts
    }

    /// The accounts the last read got nothing from, and why.
    func accountTroubles() -> [AccountTrouble] {
        logins.compactMap { login in
            guard let status = accountStatus(of: login), let cause = status.cause else { return nil }
            let refused = (cause as? GitHubError)?.status == 401 || (cause as? APIError)?.isUnauthorized == true
            return AccountTrouble(login: login, tokenRefused: refused, message: status.error ?? cause.localizedDescription)
        }
    }
}
