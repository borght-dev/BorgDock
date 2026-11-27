import SwiftUI

/// Over the list: why it is old (no connection, a token GitHub refuses, whatever else GitHub answered), or which
/// account isn't being read while the rest is.
struct PrListReadBanner: View {
    let icon: String
    let lead: String
    let rest: String
    var action: String?
    let perform: () -> Void

    init(trouble: ListTrouble, generatedAt: String, openSettings: @escaping () -> Void) {
        let readAt = GitHubTime.date(generatedAt)?.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)) ?? ""
        switch trouble.kind {
        case .offline:
            (icon, lead, action) = ("exclamationmark.triangle", "No connection.", nil)
            rest = "This is the list from \(readAt). Reviewing and merging need GitHub, so they wait."
        case .token:
            (icon, lead, action) = ("key.horizontal", "GitHub refused a token.", "Replace the token")
            rest = "\(trouble.message) This is the list from \(readAt)."
        case .other:
            (icon, lead, action) = ("exclamationmark.triangle", "GitHub didn't answer.", nil)
            rest = "\(trouble.message) This is the list from \(readAt)."
        }
        perform = openSettings
    }

    /// "kv-labs isn't being read. Its token expired yesterday, so pull requests from your personal account are missing here."
    init(account trouble: AccountTrouble, known: DirectCredentials.GitHub?, openSettings: @escaping () -> Void) {
        lead = "\(trouble.login) isn't being read."
        perform = openSettings
        guard trouble.tokenRefused else {
            (icon, action) = ("exclamationmark.triangle", nil)
            rest = "\(trouble.message) Its pull requests here are from the last read that worked."
            return
        }
        (icon, action) = ("key.horizontal", "Replace the token")
        let label = known?.label.flatMap { $0.isEmpty ? nil : $0.lowercased() }
        let whose = label.map { "your \($0) account" } ?? "that account"
        let why: String = switch known?.expiredDaysAgo() {
        case 0?: "Its token expired today"
        case 1?: "Its token expired yesterday"
        case let days?: "Its token expired \(days) days ago"
        case nil: "GitHub refuses its token"
        }
        rest = "\(why), so pull requests from \(whose) are missing here."
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.yellow)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 6) {
                Text("\(Text(lead).fontWeight(.semibold).foregroundStyle(BD.text)) \(rest)")
                    .font(.system(size: 13))
                    .foregroundStyle(BD.text2)
                    .fixedSize(horizontal: false, vertical: true)
                if let action {
                    Button(action, action: perform)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BD.accentText)
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("prs-read-banner-action")
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(BD.yellowSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("prs-read-banner")
    }
}
