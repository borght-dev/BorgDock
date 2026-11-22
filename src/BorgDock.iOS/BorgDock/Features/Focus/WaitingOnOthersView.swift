import SwiftUI

/// Focus's Waiting on others: the pull requests that involve you and wait on someone else (yours under review, the ones
/// you reviewed), oldest first. The desktop's list has no such tab, so Focus keeps it as its own screen.
struct WaitingOnOthersView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let store = app.focus
        let waiting = (store.focus?.pullRequests ?? [])
            .filter { $0.isWaitingOnOthers(myLogins: store.myLogins) }
            .sorted { $0.waitingSince.sortDate < $1.waitingSince.sortDate }
        List {
            if waiting.isEmpty {
                ContentUnavailableView("Nothing waits on anyone", systemImage: "checkmark.circle", description: Text("Your pull requests and your reviews are with you."))
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(waiting) { pr in
                        Button { app.router.push(.pullRequest(pr.prKey)) } label: {
                            PrListRow(pr: pr, age: ShortTime.age(pr.waitingSince))
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(BD.card)
                        .alignmentGuide(.listRowSeparatorLeading) { _ in 58 }
                        .contextMenu { PrContextMenu(pr: pr) }
                        .prSwipeActions(pr, app: app)
                        .accessibilityIdentifier("pr-row-\(pr.key)")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(BD.bg)
        .navigationTitle("Waiting on others")
        .refreshable { await store.load(reportErrors: true) }
    }
}
