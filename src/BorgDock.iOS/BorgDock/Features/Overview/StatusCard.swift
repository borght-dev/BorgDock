import SwiftUI

/// A warning or empty state in a card.
struct StatusCard: View {
    let icon: String
    let text: String
    var tone: Tone = .mute

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(tone.color)
            Text(text).foregroundStyle(BD.text).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .font(.system(size: 14.5))
        .padding(14)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }
}

/// ADO or a machine that isn't syncing, above the lanes.
struct SourceWarnings: View {
    let sources: OverviewSources

    var body: some View {
        if !sources.ado.ok {
            StatusCard(icon: "exclamationmark.triangle", text: "Azure DevOps isn't syncing\(detail(sources.ado.error, sources.ado.at))", tone: .warn)
        }
        if let environments = sources.environments {
            ForEach(environments.filter { !$0.ok }) { environment in
                StatusCard(icon: "desktopcomputer.trianglebadge.exclamationmark", text: "\(environment.label) is offline\(detail(environment.error, environment.at))", tone: .warn)
            }
        } else if !sources.t3.ok {
            StatusCard(icon: "exclamationmark.triangle", text: "T3 Code isn't reachable\(detail(sources.t3.error, sources.t3.at))", tone: .warn)
        }
    }

    private func detail(_ error: String?, _ at: String?) -> String {
        var text = error.map { ": \($0)" } ?? ""
        if let at { text += ". Last good sync \(RelativeTime.ago(at))." }
        return text.isEmpty ? "." : text
    }
}
