import SwiftUI

/// Stands in for a screen that isn't built yet, so navigation works end to end.
struct PendingScreen: View {
    let title: String

    var body: some View {
        VStack(spacing: 12) {
            BDAppTile(size: 56)
            Text(title).font(.title2.bold()).foregroundStyle(BD.text)
            Text("Coming in this build.").font(.subheadline).foregroundStyle(BD.text2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BD.bg)
        .navigationTitle(title)
    }
}
