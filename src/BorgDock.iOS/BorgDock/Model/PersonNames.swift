import Foundation

/// How a person's name is shortened for avatars and rows. Main actor: it falls back to `PersonAvatar`'s initials.
@MainActor
enum PersonNames {
    /// "Koen van der Borght" → "Koen Borght", so avatars read KB.
    static func firstAndLast(_ name: String) -> String {
        let words = name.split(separator: " ")
        guard words.count > 2, let first = words.first, let last = words.last else { return name }
        return "\(first) \(last)"
    }

    /// First and last name: "Koen van der Borght" → "KB".
    static func initials(_ name: String) -> String {
        let words = name.split(separator: " ")
        guard let first = words.first?.first, words.count > 1, let last = words.last?.first else { return PersonAvatar.initials(name) }
        return String([first, last]).uppercased()
    }

    /// "Mara Visser" → "Mara".
    static func first(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}
