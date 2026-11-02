import SwiftUI
import WidgetKit

// Views shared by the widget extension and the app (the app renders them in its DEBUG gallery for screenshots).

/// The small header every home screen widget starts with: an SF Symbol or the mark, and a title.
struct WidgetHeader<Trailing: View>: View {
    let title: String
    var systemImage: String?
    var tint: Color = BD.accent
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage).font(.system(size: 13, weight: .semibold)).foregroundStyle(tint)
            } else {
                BDMark().fill(BD.brandIndigo).frame(width: 14, height: 14)
            }
            Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.text)
            Spacer(minLength: 4)
            trailing
        }
        .lineLimit(1)
    }
}

extension WidgetHeader where Trailing == EmptyView {
    init(title: String, systemImage: String? = nil, tint: Color = BD.accent) {
        self.init(title: title, systemImage: systemImage, tint: tint) { EmptyView() }
    }
}
