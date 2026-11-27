import Foundation

extension LedgerContext {
    /// Who is looking, from what the list was read with: the accounts' logins and teams, everyone the list names, and
    /// which red pull requests are red by a failure they share with others.
    @MainActor
    init(focus: Focus, app: AppModel, now: Date) {
        let store = app.focus
        let accounts = app.reviewAccounts
        var people: [String: Person] = [:]
        for person in focus.pullRequests.map(\.author) + accounts { people[person.login.lowercased()] = person }
        let ciOf = CiLens.lookup(store.ciGroups, focus.pullRequests)
        self.init(
            logins: Set(store.myLogins.map { $0.lowercased() } + accounts.map { $0.login.lowercased() }),
            teams: Array(Set((focus.teams ?? [:]).values.flatMap { $0 })).sorted(),
            now: now,
            people: people,
            failsOutside: { ciOf($0)?.outside == true }
        )
    }
}
