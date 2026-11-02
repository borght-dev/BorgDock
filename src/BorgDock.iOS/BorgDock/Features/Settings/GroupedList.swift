import SwiftUI

/// A rounded group of cells on the grouped background, with hairlines between them that start at `indent`,
/// like the mockups' `.grp`.
struct CellGroup<Content: View>: View {
    var indent: CGFloat = 16
    var radius: CGFloat = 22
    var fill: Color = BD.card
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: content) { subviews in
                ForEach(Array(subviews.enumerated()), id: \.offset) { index, subview in
                    subview
                    if index < subviews.count - 1 {
                        BD.separator.frame(height: 0.5).padding(.leading, indent)
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .bdCard(radius: radius, fill: fill)
        .padding(.horizontal, 16)
    }
}

/// A small header above a group: "Machines", "Code Review   2".
struct CellGroupHeader: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            if let trailing { Text(trailing).monospacedDigit() }
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(BD.text2)
        .padding(.horizontal, 32)
        .padding(.top, 20)
        .padding(.bottom, 8)
    }
}

/// An icon on a coloured rounded square, as in Settings' source and machine rows.
struct IconTile: View {
    let systemImage: String
    var background: Color = BD.accent
    var foreground: Color = .white
    var size: CGFloat = 36

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.46, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: size, height: size)
            .background(background, in: RoundedRectangle(cornerRadius: size * 0.26, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// One cell: an optional leading view, a title with a subtitle, an optional value and a chevron.
struct Cell<Leading: View, Trailing: View>: View {
    let title: String
    var subtitle: String?
    var subtitleColor: Color = BD.text2
    var value: String?
    var chevron = false
    var titleColor: Color = BD.text
    var minHeight: CGFloat = 52
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 14) {
            leading
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(titleColor)
                    .lineLimit(1)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 14.5))
                        .foregroundStyle(subtitleColor)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            trailing
            if let value {
                Text(value)
                    .font(.system(size: 16))
                    .foregroundStyle(BD.text2)
                    .lineLimit(1)
            }
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(BD.text3)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: minHeight)
        .contentShape(Rectangle())
    }
}

extension Cell where Leading == EmptyView, Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, value: String? = nil, chevron: Bool = false, titleColor: Color = BD.text) {
        self.init(title: title, subtitle: subtitle, value: value, chevron: chevron, titleColor: titleColor, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

extension Cell where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, subtitleColor: Color = BD.text2, value: String? = nil, chevron: Bool = false,
         titleColor: Color = BD.text, @ViewBuilder leading: () -> Leading) {
        self.init(title: title, subtitle: subtitle, subtitleColor: subtitleColor, value: value, chevron: chevron, titleColor: titleColor,
                  leading: leading, trailing: { EmptyView() })
    }
}

/// A toggle cell with a subtitle, the system switch tinted green like the mockups.
struct ToggleCell: View {
    let title: String
    var subtitle: String?
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 17)).foregroundStyle(BD.text).lineLimit(1)
                if let subtitle {
                    Text(subtitle).font(.system(size: 14.5)).foregroundStyle(BD.text2)
                }
            }
        }
        .tint(BD.green)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 52)
    }
}

/// "● Online · 3 threads" in green, "Offline · seen 2 h ago" in grey.
struct OnlineLabel: View {
    let online: Bool
    let text: String

    var body: some View {
        HStack(spacing: 5) {
            if online {
                Circle().fill(BD.green).frame(width: 8, height: 8)
            }
            Text(text).lineLimit(1)
        }
        .font(.system(size: 14.5))
        .foregroundStyle(BD.text2)
    }
}

extension Machine {
    var symbol: String { kind == .ssh ? "server.rack" : "desktopcomputer" }

    /// "Online · 3 threads", "Offline · seen 2 h ago".
    var statusLine: String {
        if online { return "Online · \(threads) \(threads == 1 ? "thread" : "threads")" }
        let seen = lastSeenAt.map { " · seen \(CompactTime.ago($0)) ago" } ?? ""
        return "Offline\(seen)"
    }
}

/// "40 min", "2 h", "3 d": the mockups' compact ages.
enum CompactTime {
    static func ago(_ iso: String?, now: Date = .now) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let minutes = max(0, Int(now.timeIntervalSince(date) / 60))
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes) min" }
        if minutes < 60 * 24 { return "\(minutes / 60) h" }
        return "\(minutes / 1440) d"
    }

    /// "21:02" today, "Tue" this week, "12 Oct" before.
    static func clock(_ iso: String?, now: Date = .now, calendar: Calendar = .current) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        if calendar.isDate(date, inSameDayAs: now) { return date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)) }
        if now.timeIntervalSince(date) < 6 * 86400 { return date.formatted(.dateTime.weekday(.abbreviated)) }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }
}
