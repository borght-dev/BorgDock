import SwiftUI

/// The chip row over a one-page screen (a pull request, a work item): tap a chip to scroll to its section; the
/// selected chip follows the section on screen. Mockup: design/ios-flow/mockups.html, sections 04 and 08.
struct JumpBar: View {
    struct Item: Identifiable, Hashable {
        let id: String
        let title: String
        var count: Int? = nil
    }

    let items: [Item]
    @Binding var selection: String?
    let onJump: (String) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(items) { item in
                        let selected = selection == item.id
                        Button {
                            selection = item.id
                            onJump(item.id)
                        } label: {
                            HStack(spacing: 5) {
                                Text(item.title)
                                if let count = item.count, count > 0 { Text(verbatim: "\(count)").monospacedDigit() }
                            }
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(selected ? BD.bg : BD.text2)
                            .padding(.horizontal, 11)
                            .frame(height: 30)
                            .background(selected ? BD.text : BD.fill, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .id(item.id)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
                .padding(.horizontal, 16)
            }
            .onChange(of: selection) { _, id in
                guard let id else { return }
                withAnimation(.snappy) { proxy.scrollTo(id, anchor: .center) }
            }
            .onAppear {
                if let selection { proxy.scrollTo(selection, anchor: .center) }
            }
        }
        .padding(.vertical, 10)
        .background(BD.bg)
        .overlay(alignment: .bottom) { Rectangle().fill(BD.separator).frame(height: 0.5) }
    }
}
