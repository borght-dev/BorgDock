import SwiftUI

/// The one markdown renderer for pull request descriptions, PR comments and reviews, and ADO rich text (which the server
/// sends as markdown): headings, lists and task lists, tables, code, quotes, images and folded `<details>`, with HTML
/// comments, bot footers and badges dropped. Links open in Safari, BorgDock and GitHub pull request links in the app,
/// `AB#123` chips on the item. Mockup: design/ios-flow/mockups.html, section 04.
struct GitHubMarkdown: View {
    @Environment(AppModel.self) private var app
    let markdown: String
    var size: CGFloat = 15
    /// Images shown elsewhere on the screen (a PR's Proof row), left out here.
    var omittedImages: Set<String> = []

    init(_ markdown: String, size: CGFloat = 15, omittingImages omittedImages: Set<String> = []) {
        self.markdown = markdown
        self.size = size
        self.omittedImages = omittedImages
    }

    var body: some View {
        MarkdownBlocksView(blocks: MarkdownParser.parse(markdown), size: size)
            .foregroundStyle(BD.text)
            .tint(BD.accentText)
            .environment(\.markdownOmittedImages, omittedImages)
            .environment(\.openURL, OpenURLAction { MarkdownLinks.open($0, app: app) })
    }
}

extension EnvironmentValues {
    @Entry var markdownOmittedImages: Set<String> = []
    /// Work item types by id, for the glyph on AB# chips the overview doesn't know.
    @Entry var markdownWorkItemTypes: [Int: String] = [:]
}

/// Where a link in rendered markdown goes.
enum MarkdownLinks {
    enum Destination: Equatable {
        case workItem(Int)
        case pullRequest(PrKey)
        case app(URL)
        case external(URL)
    }

    static func destination(_ url: URL) -> Destination {
        if url.scheme == "borgdock" {
            if url.host() == "item", let id = url.pathComponents.dropFirst().first.flatMap(Int.init) { return .workItem(id) }
            return .app(url)
        }
        let parts = url.pathComponents.filter { $0 != "/" }
        if url.host()?.lowercased() == "github.com", parts.count >= 4, parts[2] == "pull", let number = Int(parts[3]) {
            return .pullRequest(PrKey(owner: parts[0], repo: parts[1], number: number))
        }
        return .external(url)
    }

    static func url(forWorkItem id: Int) -> URL { URL(string: "borgdock://item/\(id)")! }

    @MainActor
    static func open(_ url: URL, app: AppModel) -> OpenURLAction.Result {
        switch destination(url) {
        case .workItem(let id): app.router.push(.workItem(ItemRoute(id: id, prefill: app.itemOverview(id)?.item)))
        case .pullRequest(let key): app.router.push(.pullRequest(key))
        case .app(let url): app.open(url)
        case .external: return .systemAction
        }
        return .handled
    }
}

// MARK: - Blocks

struct MarkdownBlocksView: View {
    let blocks: [MarkdownBlock]
    let size: CGFloat
    var depth = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
                MarkdownBlockView(block: block, size: size, depth: depth)
                    .padding(.top, index == 0 ? 0 : spacing(before: block, after: blocks[index - 1]))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func spacing(before block: MarkdownBlock, after previous: MarkdownBlock) -> CGFloat {
        if case .heading = block { return size * 0.95 }
        if case .heading = previous { return 3 }
        return depth > 0 ? 4 : 8
    }
}

struct MarkdownBlockView: View {
    let block: MarkdownBlock
    let size: CGFloat
    let depth: Int

    var body: some View {
        switch block {
        case .heading(let level, let text):
            MarkdownText(text, size: MarkdownBlockView.headingSize(level, base: size), weight: .bold)
                .foregroundStyle(level == 6 ? BD.text2 : BD.text)
                .accessibilityAddTraits(.isHeader)
        case .paragraph(let text):
            MarkdownText(text, size: size)
        case .list(let list):
            MarkdownListView(list: list, size: size, depth: depth)
        case .code(_, let text):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(verbatim: text)
                    .font(.system(size: size - 2.5, design: .monospaced))
                    .lineSpacing(3)
                    .fixedSize()
                    .padding(.horizontal, 11)
                    .padding(.vertical, 9)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BD.fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        case .quote(let blocks):
            MarkdownBlocksView(blocks: blocks, size: size, depth: depth + 1)
                .foregroundStyle(BD.text2)
                .padding(.leading, 11)
                .overlay(alignment: .leading) { Rectangle().fill(BD.fill2).frame(width: 3) }
        case .table(let table):
            MarkdownTableView(table: table, size: size - 2)
        case .images(let images):
            MarkdownImagesView(images: images)
        case .details(let summary, let content):
            MarkdownDetails(summary: summary, content: content, size: size)
        case .rule:
            Rectangle().fill(BD.fill2).frame(height: 1).padding(.vertical, 4)
        }
    }

    /// h1 to h6 in steps above the body size; the mockup's h5 is 15.5 on a 14.5 body.
    static func headingSize(_ level: Int, base: CGFloat) -> CGFloat {
        let steps: [CGFloat] = [7, 4.5, 2, 1.5, 1, 0]
        return base + steps[min(max(level, 1), 6) - 1]
    }
}

// MARK: - Inline text

/// A paragraph's inline markdown as one `Text`; inline code and AB# chips sit on rounded fills.
struct MarkdownText: View {
    @Environment(AppModel.self) private var app
    @Environment(\.markdownWorkItemTypes) private var workItemTypes
    let source: String
    let size: CGFloat
    var weight: Font.Weight = .regular

    init(_ source: String, size: CGFloat, weight: Font.Weight = .regular) {
        self.source = source
        self.size = size
        self.weight = weight
    }

    var body: some View {
        let pieces = MarkdownInline.pieces(source)
        MarkdownText.text(pieces, size: size) { id in
            WorkItemGlyph.color(workItemTypes[id] ?? app.itemOverview(id)?.item.typeName ?? "")
        }
        .font(.system(size: size, weight: weight))
        .tracking(weight == .bold ? -0.15 : 0)
        .lineSpacing(size * 0.25)
        .fixedSize(horizontal: false, vertical: true)
        .textRenderer(InlinePillRenderer())
        .textSelection(.enabled)
    }

    static func text(_ pieces: [InlinePiece], size: CGFloat, glyph: (Int) -> Color) -> Text {
        pieces.enumerated().reduce(Text(verbatim: "")) { result, entry in
            let (index, piece) = entry
            let next: Text
            switch piece {
            case .text(let text):
                next = Text(text)
            case .code(let code):
                next = Text(verbatim: "\u{202F}\(code)\u{202F}")
                    .font(.system(size: size - 2.5, design: .monospaced))
                    .foregroundStyle(BD.accentText)
                    .customAttribute(InlinePill(kind: .code, id: index))
            case .workItem(let id):
                var label = AttributedString("\u{202F}AB#\(id)\u{202F}")
                label.link = MarkdownLinks.url(forWorkItem: id)
                let mark = Text(Image(systemName: "square.fill")).font(.system(size: size * 0.55)).foregroundStyle(glyph(id))
                next = Text("\u{202F}\(mark)\(Text(label))")
                    .font(.system(size: size - 2.5, weight: .semibold))
                    .foregroundStyle(BD.accentText)
                    .customAttribute(InlinePill(kind: .workItem, id: index))
            }
            return Text("\(result)\(next)")
        }
    }
}

/// Marks the runs `InlinePillRenderer` draws a fill behind; `id` keeps one piece's runs together.
struct InlinePill: TextAttribute {
    enum Kind: Hashable { case code, workItem }
    let kind: Kind
    let id: Int
}

/// Draws inline code on a soft fill and AB# references as accent chips, behind the text.
struct InlinePillRenderer: TextRenderer {
    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            var pills: [Int: (kind: InlinePill.Kind, rect: CGRect)] = [:]
            for run in line {
                guard let pill = run[InlinePill.self] else { continue }
                let rect = run.typographicBounds.rect
                pills[pill.id] = (pill.kind, pills[pill.id].map { $0.rect.union(rect) } ?? rect)
            }
            for (kind, rect) in pills.values {
                let padded = rect.insetBy(dx: 0, dy: kind == .code ? -1.5 : -2.5)
                let shape = RoundedRectangle(cornerRadius: kind == .code ? 5 : padded.height / 2, style: .continuous)
                context.fill(shape.path(in: padded), with: .color(kind == .code ? BD.fill : BD.accentSoft))
            }
        }
        for line in layout {
            for run in line { context.draw(run) }
        }
    }
}

// MARK: - Lists

struct MarkdownListView: View {
    let list: MarkdownList
    let size: CGFloat
    let depth: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            ForEach(Array(list.items.enumerated()), id: \.offset) { index, item in
                HStack(alignment: item.task == nil ? .firstTextBaseline : .top, spacing: 8) {
                    marker(item, number: list.start + index)
                    MarkdownBlocksView(blocks: item.blocks, size: size, depth: depth + 1)
                }
            }
        }
        .padding(.leading, list.items.contains { $0.task != nil } ? 0 : 3)
    }

    @ViewBuilder
    private func marker(_ item: MarkdownList.Item, number: Int) -> some View {
        if let checked = item.task {
            TaskBox(checked: checked).padding(.top, 2)
        } else if list.ordered {
            Text(verbatim: "\(number).").font(.system(size: size).monospacedDigit()).frame(minWidth: 16, alignment: .trailing)
        } else {
            Text(verbatim: ["•", "◦", "▪︎"][depth % 3]).font(.system(size: size)).frame(width: 8)
        }
    }
}

/// A task list box: a rounded square, filled with the accent and a white check once done.
struct TaskBox: View {
    let checked: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(checked ? BD.accent : .clear)
            .strokeBorder(checked ? .clear : BD.text3, lineWidth: 1.5)
            .frame(width: 17, height: 17)
            .overlay {
                if checked { Image(systemName: "checkmark").font(.system(size: 10, weight: .heavy)).foregroundStyle(BD.onAccent) }
            }
            .accessibilityLabel(checked ? "Done" : "Not done")
    }
}

// MARK: - Tables

/// The header row in the secondary colour, hairlines under each row. Long cells wrap first, narrower and narrower;
/// a table that still doesn't fit scrolls sideways.
struct MarkdownTableView: View {
    let table: MarkdownTable
    let size: CGFloat

    var body: some View {
        ViewThatFits(in: .horizontal) {
            grid(cellWidth: 240, stretch: true)
            grid(cellWidth: 180, stretch: true)
            grid(cellWidth: 140, stretch: true)
            grid(cellWidth: 110, stretch: true)
            ScrollView(.horizontal, showsIndicators: false) { grid(cellWidth: 180, stretch: false) }
        }
    }

    private func grid(cellWidth: CGFloat, stretch: Bool) -> some View {
        Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
            if !table.header.isEmpty {
                row(table.header, header: true, cellWidth: cellWidth, stretch: stretch)
            }
            ForEach(Array(table.rows.enumerated()), id: \.offset) { _, cells in
                row(cells, header: false, cellWidth: cellWidth, stretch: stretch)
            }
        }
    }

    private func row(_ cells: [String], header: Bool, cellWidth: CGFloat, stretch: Bool) -> some View {
        GridRow {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                MarkdownText(cell, size: size, weight: header ? .semibold : .regular)
                    .foregroundStyle(header ? BD.text2 : BD.text)
                    .frame(maxWidth: cellWidth, alignment: .leading)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 6)
                    .frame(maxWidth: stretch ? .infinity : nil, maxHeight: .infinity, alignment: .topLeading)
                    .overlay(alignment: .bottom) { Rectangle().fill(BD.separator).frame(height: 0.5) }
            }
        }
    }
}

// MARK: - Images

/// One image as a card with its caption; several in a row of thumbnails. Tap one to zoom.
struct MarkdownImagesView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.markdownOmittedImages) private var omitted
    let images: [MarkdownImage]
    @State private var zoomed: ZoomedImage?

    var body: some View {
        let shown = images.filter { !omitted.contains($0.url) }
        Group {
            if shown.count == 1, let image = shown.first {
                Button { zoomed = zoom(image) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        RemoteImage(url: app.api.resolve(image.url), contentMode: .fit)
                            .frame(maxWidth: .infinity, maxHeight: 260)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        if !image.alt.isEmpty {
                            Text(image.alt).font(.system(size: 12, weight: .medium)).foregroundStyle(BD.text2).lineLimit(2)
                        }
                    }
                    .padding(10)
                    .background(BD.card2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5))
                }
                .buttonStyle(.plain)
            } else if !shown.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(shown, id: \.self) { image in
                            Button { zoomed = zoom(image) } label: {
                                ImageThumbnail(url: app.api.resolve(image.url), caption: image.alt)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .fullScreenCover(item: $zoomed) { ImageZoomView(image: $0) }
    }

    private func zoom(_ image: MarkdownImage) -> ZoomedImage? {
        app.api.resolve(image.url).map { ZoomedImage(url: $0, caption: image.alt) }
    }
}

/// A 108-point-wide screenshot with its caption under it: the PR page's Proof row and image rows in markdown.
struct ImageThumbnail: View {
    let url: URL?
    let caption: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            RemoteImage(url: url, contentMode: .fill)
                .frame(width: 108, height: 186)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5))
            if !caption.isEmpty {
                Text(caption).font(.system(size: 12)).foregroundStyle(BD.text2).lineLimit(2).frame(width: 108, alignment: .leading)
            }
        }
    }
}

struct RemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image): image.resizable().aspectRatio(contentMode: contentMode)
            case .failure: Image(systemName: "photo").font(.title2).foregroundStyle(BD.text3).frame(maxWidth: .infinity, maxHeight: .infinity).background(BD.fill)
            default: BD.fill
            }
        }
    }
}

struct ZoomedImage: Identifiable, Hashable {
    let url: URL
    let caption: String

    var id: URL { url }
}

/// An image over black: pinch to zoom, double tap to fit again.
struct ImageZoomView: View {
    @Environment(\.dismiss) private var dismiss
    let image: ZoomedImage
    @State private var scale: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            RemoteImage(url: image.url, contentMode: .fit)
                .scaleEffect(scale * pinch)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .gesture(MagnifyGesture().updating($pinch) { value, state, _ in state = value.magnification }
                    .onEnded { scale = min(max(scale * $0.magnification, 1), 5) })
                .onTapGesture(count: 2) { withAnimation(.snappy) { scale = scale > 1 ? 1 : 2.5 } }
            GlassIconButton(systemImage: "xmark", label: "Close") { dismiss() }.padding()
        }
        .overlay(alignment: .bottom) {
            if !image.caption.isEmpty {
                Text(image.caption).font(.system(size: 14)).foregroundStyle(.white.opacity(0.8)).padding(.bottom, 24)
            }
        }
        .environment(\.colorScheme, .dark)
    }
}

// MARK: - Details

/// `<details>`: one row with its summary, opening to the rendered content.
struct MarkdownDetails: View {
    let summary: String
    let content: [MarkdownBlock]
    let size: CGFloat
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation(.snappy) { open.toggle() } } label: {
                HStack(spacing: 7) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .rotationEffect(.degrees(open ? 90 : 0))
                    MarkdownText(summary, size: size - 1, weight: .semibold)
                }
                .foregroundStyle(BD.text2)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(BD.fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(open ? .isSelected : [])
            if open {
                MarkdownBlocksView(blocks: content, size: size).padding(.horizontal, 4)
            }
        }
    }
}
