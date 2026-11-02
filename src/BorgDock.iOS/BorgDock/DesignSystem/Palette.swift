import SwiftUI

/// The Dispatch-era names, now mapped onto BorgDock's tokens (`BD`) so older screens follow the new design
/// and both appearances. New code uses `BD` directly.
enum Palette {
    static let console = BD.bg
    static let consoleDeep = BD.bg
    static let panel = BD.card
    static let line = BD.separator
    static let text = BD.text
    static let muted = BD.text2
    static let accent = BD.accent
    static let accentSoft = BD.accentSoft
    static let needsYouText = BD.red
    static let ink = text
    static let inkSoft = muted
    static let rule = line
    static let inkRed = needsYouText
    static let inkAmber = BD.yellow
    static let amberBar = BD.yellow
    static let inkGreen = BD.green
    static let liveGreen = inkGreen
    static let merged = BD.merged
    static let sheet = BD.sheet
    static let paper = BD.card
    static let paperHi = BD.card2
    static let inkPlan = accent
    static let card = BD.card

    enum Signal {
        static let waiting = BD.red
        static let drift = BD.yellow
        static let working = BD.green
        static let next = accent
        static let idle = BD.text3
    }

    enum Paper {
        static let bug = BD.redSoft
        static let pbi = BD.blueSoft
        static let qi = BD.greenSoft
        static let task = BD.yellowSoft
        static let other = paperHi
        static let thread = paperHi
    }
}

extension ItemType {
    var paper: Color {
        switch self {
        case .bug: Palette.Paper.bug
        case .pbi: Palette.Paper.pbi
        case .qi: Palette.Paper.qi
        case .task: Palette.Paper.task
        case .other: Palette.Paper.other
        }
    }
}

extension Bay {
    var lamp: Color {
        switch self {
        case .waiting: Palette.Signal.waiting
        case .drift: Palette.Signal.drift
        case .working: Palette.Signal.working
        case .next: Palette.Signal.next
        case .idle, .paused, .handed: Palette.Signal.idle
        }
    }
}
