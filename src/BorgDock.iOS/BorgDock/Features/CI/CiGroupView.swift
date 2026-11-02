import SwiftUI

/// One failure fingerprint across the base branch and pull requests: the signal, where it fails, the suspect commit,
/// who claimed it, and the rerun caveat from the desktop's Rerun sheet. Investigate starts an agent on it.
struct CiGroupView: View {
    @Environment(AppModel.self) private var app
    let id: String
    @State private var group: CiFailureGroup?
    @State private var error: String?
    @State private var claiming = false
    @State private var note = ""

    var body: some View {
        ScrollView {
            if let group {
                content(group)
            } else if let error {
                ContentUnavailableView("Can't load this failure", systemImage: "exclamationmark.triangle", description: Text(error))
                    .padding(.top, 60)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 120)
            }
        }
        .background(BD.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let group {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if isMine(group.claim) {
                            Button("Release my claim", systemImage: "hand.raised.slash") { Task { await release() } }
                        } else {
                            Button("Claim it…", systemImage: "hand.raised") { claiming = true }
                        }
                        Button("Copy the signal", systemImage: "doc.on.doc") { UIPasteboard.general.string = group.signal }
                    } label: { Image(systemName: "ellipsis") }
                }
            }
        }
        .tint(BD.text)
        .safeAreaInset(edge: .bottom) { if let group { actions(group) } }
        .refreshable { await load() }
        .task { await load() }
        .alert("Claim this failure", isPresented: $claiming) {
            TextField("What you're doing about it", text: $note)
            Button("Claim") { Task { await claim() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Others see your name on it, and their launch guard asks before they start an agent on it.")
        }
    }

    private func content(_ group: CiFailureGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Related CI failure").font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text2)
            Text(group.title).font(.system(size: 26, weight: .bold)).tracking(-0.4).foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
            LogSnippet(location: group.signal.hasPrefix(group.location ?? "\u{0}") ? nil : group.location, text: group.signal, background: BD.fill2)
                .padding(.top, 14)

            HStack(spacing: 0) {
                stat("\(group.failures)", group.failures == 1 ? "failure" : "failures")
                Rectangle().fill(BD.separator).frame(width: 0.5, height: 44)
                stat("\(group.branches.count)", group.branches.count == 1 ? "branch" : "branches")
                Rectangle().fill(BD.separator).frame(width: 0.5, height: 44)
                stat(ShortTime.clock(group.firstFailedAt), "first failed")
            }
            .padding(.vertical, 14)
            .bdCard()
            .padding(.top, 14)

            PrSectionLabel(title: "Where it fails").padding(.horizontal, -8)
            PrGroupCard(indent: 52) {
                ForEach(group.branches) { hit in branchRow(hit) }
            }

            if let claim = group.claim {
                HStack(alignment: .top, spacing: 12) {
                    PersonBadge(person: claim.by, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(isMine(claim) ? "You claimed it" : "\(claim.by.firstName) claimed it").font(.system(size: 17, weight: .semibold))
                            Text(ShortTime.age(claim.at) + " ago").font(.system(size: 14)).foregroundStyle(BD.text3)
                        }
                        if let note = claim.note, !note.isEmpty {
                            Text(verbatim: "“\(note)”").font(.system(size: 16)).lineSpacing(2)
                        }
                    }
                    .foregroundStyle(BD.text)
                    Spacer(minLength: 0)
                }
                .padding(16)
                .bdCard()
                .padding(.top, 14)
            }

            Text(caveat(group))
                .font(.system(size: 14))
                .foregroundStyle(BD.text3)
                .lineSpacing(2)
                .padding(.horizontal, 8)
                .padding(.top, 12)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 110)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 24, weight: .bold)).monospacedDigit().foregroundStyle(BD.text)
            Text(label).font(.system(size: 14)).foregroundStyle(BD.text2)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func branchRow(_ hit: CiBranchHit) -> some View {
        let row = HStack(spacing: 14) {
            Image(systemName: hit.prKey == nil ? "arrow.triangle.branch" : "arrow.triangle.pull")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(BD.red)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(hit.prKey.flatMap(PrKey.init(key:)).map { "#\($0.number) \(hit.title ?? hit.branch)" } ?? hit.branch)
                    .font(.system(size: 17))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                Text(detailLine(hit)).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 6)
            if hit.suspect != nil { ToneChip(text: "suspect", tone: .warn, small: true) }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 64)
        .contentShape(Rectangle())

        if let key = hit.prKey.flatMap(PrKey.init(key:)) {
            Button { app.router.push(.pullRequest(key)) } label: { row }.buttonStyle(.plain)
        } else {
            row
        }
    }

    private func detailLine(_ hit: CiBranchHit) -> String {
        if let suspect = hit.suspect { return "Red since \(suspect.sha.shortSha) · \(suspect.message)" }
        return "Failed \(hit.failures)× on \(hit.sha.shortSha)"
    }

    private func caveat(_ group: CiFailureGroup) -> String {
        let firstPr = group.branches.compactMap { $0.prKey.flatMap(PrKey.init(key:)) }.first
        let who = group.claim.map { isMine($0) ? "your" : "\($0.by.firstName)'s" } ?? "the"
        let update = firstPr.map { "Update #\($0.number) from \(baseBranch(group)) once it lands." } ?? "Update the branch once it lands."
        return "A rerun uses the original commit and won't pick up \(who) fix. \(update)"
    }

    private func baseBranch(_ group: CiFailureGroup) -> String {
        group.branches.first { $0.prKey == nil }?.branch ?? "the base branch"
    }

    @ViewBuilder
    private func actions(_ group: CiFailureGroup) -> some View {
        HStack(spacing: 12) {
            if let claim = group.claim, !isMine(claim) {
                ShareLink(item: "About \(group.title): \(claim.note ?? "")", subject: Text(group.title)) {
                    Text(verbatim: "Message \(claim.by.firstName)")
                }
                .buttonStyle(.bdPlain)
            } else if group.claim == nil {
                Button("Claim") { claiming = true }.buttonStyle(.bdPlain)
            } else {
                Button("Release") { Task { await release() } }.buttonStyle(.bdPlain)
            }
            Button { investigate(group) } label: { Label("Investigate", systemImage: "apple.terminal") }
                .buttonStyle(.bdPrimary)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func investigate(_ group: CiFailureGroup) {
        let where_ = group.branches.map { hit in hit.prKey ?? hit.branch }.joined(separator: ", ")
        var message = "Investigate the CI failure \"\(group.title)\". It fails on \(where_)."
        if let location = group.location { message += " Location: \(location)." }
        if let suspect = group.branches.compactMap(\.suspect).first { message += " The first red commit on the base branch is \(suspect.sha.shortSha) (\(suspect.message))." }
        message += "\n\nSignal:\n\(group.signal)"
        app.router.present(.launch(LaunchContext(prKey: group.branches.compactMap(\.prKey).first, ciGroupId: group.id, message: message, title: "Investigate \(group.title)")))
    }

    private func isMine(_ claim: CiClaim?) -> Bool {
        guard let claim else { return false }
        return app.focus.myLogins.contains(claim.by.login)
    }

    private func load() async {
        do {
            group = try await app.api.ciGroup(id)
            error = nil
        } catch {
            if group == nil { self.error = (error as? APIError)?.message ?? error.localizedDescription } else { app.report(error) }
        }
    }

    private func claim() async {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            group = try await app.api.claimCiGroup(id, note: text.isEmpty ? nil : text)
            note = ""
        } catch {
            app.report(error)
        }
    }

    private func release() async {
        do { group = try await app.api.releaseCiGroup(id) } catch { app.report(error) }
    }
}
