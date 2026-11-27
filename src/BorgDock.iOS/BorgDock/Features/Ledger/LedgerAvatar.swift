import SwiftUI

/// Who wrote it: initials on the person's colour, your own on BorgDock's indigo, a package for a dependency bot.
struct LedgerAvatar: View {
    let person: Person
    let mine: Bool
    var size: CGFloat = 22

    var body: some View {
        Group {
            if DependencyBot.isBot(person.login) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: size * 0.45, weight: .semibold))
                    .foregroundStyle(BD.text2)
                    .frame(width: size, height: size)
                    .background(BD.fill2, in: Circle())
            } else if mine {
                Text(PersonAvatar.initials(person.displayName))
                    .font(.system(size: size * 0.4, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: size, height: size)
                    .background(LinearGradient(colors: [BD.brandIndigo, Color(hex: 0x4F46E5)], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
            } else {
                PersonAvatar(name: person.displayName, size: size)
            }
        }
        .accessibilityHidden(true)
    }
}
