import SwiftUI
import UIKit

/// BorgDock's design tokens, the same values as the desktop app's `src/styles/index.css` and the
/// iPhone mockups (`design/ios-app/mockups.html` in the BorgDock repo). Every colour follows the system appearance.
enum BD {
    // Surfaces
    static let bg = Color(light: 0xF2F2F7, dark: 0x111214)
    static let card = Color(light: 0xFFFFFF, dark: 0x1B1C1F)
    static let card2 = Color(light: 0xF7F7F9, dark: 0x232428)
    static let sheet = Color(light: 0xF2F2F7, dark: 0x1B1C1F)
    static let fill = Color(light: (0x17181C, 0.055), dark: (0xFFFFFF, 0.07))
    static let fill2 = Color(light: (0x17181C, 0.09), dark: (0xFFFFFF, 0.11))
    static let separator = Color(light: (0xE3E4E8, 1), dark: (0xFFFFFF, 0.08))

    // Text
    static let text = Color(light: 0x17181C, dark: 0xEDEDEF)
    static let text2 = Color(light: 0x5D606A, dark: 0x9C9DA4)
    static let text3 = Color(light: 0x8F929C, dark: 0x6C6D74)

    // Accent and status
    static let accent = Color(light: 0x4F46E5, dark: 0x7F7EFF)
    static let accentSoft = Color(light: (0x4F46E5, 0.10), dark: (0x7F7EFF, 0.16))
    static let accentText = Color(light: 0x4338CA, dark: 0xB4B3FF)
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x12121A)
    static let green = Color(light: 0x1F9D6B, dark: 0x5CC98F)
    static let greenSoft = Color(light: (0xE3F5EC, 1), dark: (0x5CC98F, 0.14))
    static let onGreen = Color(light: 0xFFFFFF, dark: 0x0B2416)
    static let red = Color(light: 0xD64560, dark: 0xF0616D)
    static let redSoft = Color(light: (0xFBE9EC, 1), dark: (0xF0616D, 0.15))
    static let yellow = Color(light: 0xB07A0E, dark: 0xE5B454)
    static let yellowSoft = Color(light: (0xFBF1DC, 1), dark: (0xE5B454, 0.15))
    static let blue = Color(light: 0x2D6BE4, dark: 0x6FA8FF)
    static let blueSoft = Color(light: (0xE6EEFC, 1), dark: (0x6FA8FF, 0.15))
    static let merged = Color(light: 0x8250DF, dark: 0xA371F7)
    static let mergedSoft = Color(light: (0xF0E8FC, 1), dark: (0xA371F7, 0.16))

    // Work item types
    static let bug = Color(hex: 0xE5484D)
    static let pbi = Color(hex: 0x3E7BFA)
    static let task = Color(hex: 0xE5A33D)

    /// The mark's indigo on graphite, as on the app icon. Fixed in both appearances.
    static let brandIndigo = Color(hex: 0x7F7EFF)
    static let graphite = Color(hex: 0x151618)

    enum Syntax {
        static let keyword = Color(light: 0x8250DF, dark: 0xC4A7FF)
        static let string = Color(light: 0x0A3069, dark: 0x9ECBFF)
        static let function = Color(light: 0x6639BA, dark: 0xDCBDFB)
        static let type = Color(light: 0x116329, dark: 0x7EE787)
        static let comment = Color(light: 0x6E7781, dark: 0x8B949E)
    }
}

/// How alarming something is. The same five tones as the desktop's verdicts (`services/dispatch/verdict.ts`).
enum Tone: String, Codable, Sendable, CaseIterable {
    case bad, warn, ok, run, mute

    var color: Color {
        switch self {
        case .bad: BD.red
        case .warn: BD.yellow
        case .ok: BD.green
        case .run: BD.blue
        case .mute: BD.text2
        }
    }

    var soft: Color {
        switch self {
        case .bad: BD.redSoft
        case .warn: BD.yellowSoft
        case .ok: BD.greenSoft
        case .run: BD.blueSoft
        case .mute: BD.fill
        }
    }

    /// Sort order: what needs you first.
    var rank: Int {
        switch self {
        case .bad: 0
        case .warn: 1
        case .ok: 2
        case .run: 3
        case .mute: 4
        }
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }

    init(light: UInt32, dark: UInt32) {
        self.init(light: (light, 1), dark: (dark, 1))
    }

    init(light: (UInt32, Double), dark: (UInt32, Double)) {
        self.init(uiColor: UIColor { traits in
            let (hex, alpha) = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: alpha
            )
        })
    }

    /// GitHub label colours come as "d93f0b".
    init?(hexString: String) {
        let trimmed = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        guard trimmed.count == 6, let value = UInt32(trimmed, radix: 16) else { return nil }
        self.init(hex: value)
    }
}
