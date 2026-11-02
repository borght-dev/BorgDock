import SwiftUI

struct AppChrome: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 11) {
                BrandMark()
                Text("Dispatch")
                    .appFont(21, weight: .bold, relativeTo: .title2)
                    .tracking(-0.8)
                    .foregroundStyle(Palette.text)
                Spacer()
                Button { app.router.present(.settings) } label: {
                    Image(systemName: "sun.max")
                        .font(.system(size: 19))
                        .foregroundStyle(Palette.muted)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel("Settings")
            }
            .padding(.horizontal, 18)
            if let overview = app.overview {
                let summary = OverviewSummary(overview)
                HStack(spacing: 8) {
                    Text("\(summary.waiting) waiting on you, \(summary.drift) out of sync, \(summary.running) running")
                        .appFont(12, weight: .regular, relativeTo: .caption)
                        .foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button(app.isLoadingOverview ? "Syncing…" : "Sync") {
                        Task { await app.refreshFromSources() }
                    }
                    .appFont(11, weight: .regular, relativeTo: .caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .foregroundStyle(Palette.muted)
                    .background(RoundedRectangle(cornerRadius: 6).strokeBorder(Palette.line))
                    .disabled(app.isLoadingOverview)
                }
                .padding(.horizontal, 18)
                WorktreeRack(worktrees: overview.worktrees) { app.router.openItem($0) }
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 13)
        .background(Palette.consoleDeep)
        .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
    }
}
