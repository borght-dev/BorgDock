import SwiftUI

private struct AppFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight

    init(size: CGFloat, weight: Font.Weight, relativeTo style: Font.TextStyle) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: style)
        self.weight = weight
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight))
    }
}

extension View {
    func appFont(_ size: CGFloat, weight: Font.Weight = .bold, relativeTo style: Font.TextStyle = .title3) -> some View {
        modifier(AppFont(size: size, weight: weight, relativeTo: style))
    }
}
