import SwiftUI

/// A note from the vault, rendered: BorgDock's blocks as cards, references as live chips, tasks you can tick,
/// `[[links]]` that open other notes. Edit switches to the Markdown; saving never writes over a file that changed
/// since it was read.
struct NoteView: View {
    @Environment(AppModel.self) private var app
    let path: String

    @State private var loaded = false
    @State private var missing = false
    @State private var editing = false
    @State private var draft = ""
    @FocusState private var editorFocused: Bool

    private var notes: NotesStore { app.notes }
    private var text: String { notes.texts[path] ?? "" }
    private var isDaily: Bool { NoteEdits.isDailyPath(path) }

    var body: some View {
        Group {
            if editing {
                editor
            } else {
                reader
            }
        }
        .background(BD.bg)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let current = notes.conflicts[path] {
                ConflictBanner(deleted: current == nil) {
                    notes.takeDisk(path)
                    draft = text
                } keepMine: {
                    Task { if await notes.keepMine(path, text: editing ? draft : text) { editing = false } }
                }
            }
        }
        .task(id: path) { await load() }
        .refreshable { await load() }
    }

    // MARK: Reader

    private var reader: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(subtitle)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BD.text2)
                Text(NoteText.title(ofPath: path))
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(BD.text)
                    .padding(.top, 2)
                    .padding(.bottom, 12)
                if missing {
                    Text("This note doesn't exist any more.")
                        .font(.system(size: 17))
                        .foregroundStyle(BD.text2)
                } else if loaded && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button("Start writing") { startEditing() }
                        .font(.system(size: 17, weight: .semibold))
                }
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    blockView(block)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    /// The blocks, without the leading `# Title` that repeats the header.
    private var blocks: [NoteBlock] {
        var blocks = NoteText.blocks(text)
        if case .heading(1, let heading, _)? = blocks.first {
            let title = NoteText.title(ofPath: path).lowercased()
            let daily = dailyDate.map { NoteEdits.dailyTitle($0).lowercased() }
            if heading.lowercased() == title || heading.lowercased() == daily { blocks.removeFirst() }
        }
        return blocks
    }

    @ViewBuilder
    private func blockView(_ block: NoteBlock) -> some View {
        switch block {
        case .heading(let level, let text, _):
            NoteInlineText(text: text, size: level <= 2 ? 23 : 19, openNote: openNote)
                .fontWeight(.bold)
                .padding(.top, level <= 2 ? 18 : 12)
                .padding(.bottom, 6)
        case .paragraph(let text, _):
            NoteInlineText(text: text, openNote: openNote)
                .padding(.vertical, 5)
        case .task(let done, let text, let indent, let line):
            HStack(alignment: .top, spacing: 14) {
                Button {
                    Task { await notes.setTask(path, task: NoteTask(line: line, done: done, text: text), done: !done) }
                } label: { TaskCheckbox(done: done) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(done ? "Done" : "Not done")
                NoteInlineText(text: text, done: done, openNote: openNote)
                    .padding(.top, 1)
            }
            .padding(.leading, CGFloat(indent) * 22)
            .padding(.vertical, 6)
        case .bullet(let text, let indent, let ordinal, _):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(ordinal ?? "•").font(.system(size: 17.5)).foregroundStyle(BD.text2)
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                        NoteInlineText(text: line, openNote: openNote)
                    }
                }
            }
            .padding(.leading, CGFloat(indent) * 22)
            .padding(.vertical, 3)
        case .quote(let text, _):
            NoteInlineText(text: text, color: BD.text2, openNote: openNote)
                .padding(.leading, 12)
                .overlay(alignment: .leading) { Capsule().fill(BD.separator).frame(width: 3) }
                .padding(.vertical, 5)
        case .code(let text, _):
            Text(text)
                .font(.system(size: 14, design: .monospaced))
                .foregroundStyle(BD.text)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(BD.card2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.vertical, 6)
        case .borgdock(_, let title, let lines, _):
            BorgDockBlock(title: title, lines: lines, openNote: openNote)
                .padding(.vertical, 8)
        case .rule:
            Rectangle().fill(BD.separator).frame(height: 1).padding(.vertical, 12)
        }
    }

    private var dailyDate: Date? {
        guard isDaily else { return nil }
        let key = NoteText.title(ofPath: path)
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// "Daily · Friday 30 October", else the note's folder.
    private var subtitle: String {
        if let dailyDate { return "Daily · \(NoteEdits.dailyTitle(dailyDate))" }
        let folder = path.contains("/") ? String(path[..<path.lastIndex(of: "/")!]) : ""
        return folder.isEmpty ? (notes.location?.displayName ?? "Note") : folder
    }

    private func openNote(_ target: String) {
        if let path = notes.path(forLink: target) {
            app.router.push(.note(path))
        } else {
            Task {
                if let created = await notes.createNote(title: target) { app.router.push(.note(created)) }
            }
        }
    }

    // MARK: Editor

    private var editor: some View {
        TextEditor(text: $draft)
            .font(.system(size: 17, design: .default))
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 14)
            .focused($editorFocused)
            .onAppear { editorFocused = true }
    }

    private func startEditing(appending task: Bool = false) {
        draft = text
        if task {
            draft = NoteEdits.appendTask(draft, task: "")
            while draft.hasSuffix("\n") { draft.removeLast() }
        }
        editing = true
    }

    private func finishEditing() {
        guard draft != text else {
            editing = false
            return
        }
        Task {
            if await notes.save(path, text: draft) {
                editing = false
                await notes.resolve(NoteText.refs(in: draft))
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if editing {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Cancel", role: .cancel) { editing = false }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { finishEditing() }
                    .buttonStyle(.glassProminent)
                    .accessibilityIdentifier("note-save")
            }
        } else {
            ToolbarItem(placement: .topBarTrailing) {
                Button { startEditing(appending: true) } label: { Image(systemName: "checklist") }
                    .accessibilityLabel("Add a task")
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { startEditing() } label: { Label("Edit", systemImage: "pencil") }
                    Button { app.router.present(.quickCapture) } label: { Label("Quick note", systemImage: "square.and.pencil") }
                    Button { UIPasteboard.general.string = "[[\(NoteText.title(ofPath: path))]]" } label: {
                        Label("Copy link", systemImage: "link")
                    }
                } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel("More")
            }
        }
    }

    // MARK: Loading

    private func load() async {
        var current = await notes.open(path)
        if current == nil, path == notes.todayPath, await notes.ensureDaily() != nil {
            current = notes.texts[path]
        }
        missing = current == nil
        loaded = true
        await notes.resolve(NoteText.refs(in: current ?? ""))
    }
}

/// BorgDock's text between its markers, e.g. the "Since yesterday" digest. Yours to read; BorgDock wrote it.
struct BorgDockBlock: View {
    let title: String?
    let lines: [String]
    var openNote: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(title ?? "BorgDock") · written by BorgDock")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.accentText)
                .padding(.bottom, 2)
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    Text("•").foregroundStyle(BD.text2)
                    NoteInlineText(text: Self.stripBullet(line), size: 16.5, openNote: openNote)
                }
                .font(.system(size: 16.5))
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BD.accentSoft, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18, style: .continuous)
                .fill(BD.accent)
                .frame(width: 4)
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    static func stripBullet(_ line: String) -> String {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        for prefix in ["- ", "* ", "+ "] where trimmed.hasPrefix(prefix) { return String(trimmed.dropFirst(2)) }
        return trimmed
    }
}

/// The file changed under an unsaved edit: take the file's version or write yours over the one you now see.
struct ConflictBanner: View {
    let deleted: Bool
    let takeDisk: () -> Void
    let keepMine: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(deleted ? "Deleted on another device" : "Changed on disk", systemImage: "exclamationmark.triangle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(BD.yellow)
            Text(deleted ? "Your edit isn't saved. Keep it to write the note again." : "Another device changed this note after you opened it. Your edit isn't saved yet.")
                .font(.system(size: 14))
                .foregroundStyle(BD.text2)
            HStack(spacing: 10) {
                Button("Use the file's", action: takeDisk).buttonStyle(.bd(.plain, height: 38))
                Button("Keep mine", action: keepMine).buttonStyle(.bd(.primary, height: 38))
            }
        }
        .padding(14)
        .bdCard(radius: 18)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }
}
