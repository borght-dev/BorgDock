import SwiftUI
import UniformTypeIdentifiers

/// The Notes tab: the vault folder you picked in Files, today's note first, then workstreams and recent notes.
/// It opens on today's daily note once per launch.
struct NotesView: View {
    @Environment(AppModel.self) private var app
    @State private var picking = false
    @State private var naming = false
    @State private var newTitle = ""

    private var notes: NotesStore { app.notes }

    var body: some View {
        Group {
            if notes.location == nil {
                ChooseVaultView { picking = true }
            } else {
                vaultList
            }
        }
        .background(BD.bg)
        .navigationTitle("Notes")
        .toolbar {
            if notes.location != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { app.router.present(.quickCapture) } label: { Image(systemName: "square.and.pencil") }
                        .accessibilityLabel("Quick note")
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { newTitle = ""; naming = true } label: { Label("New note", systemImage: "doc.badge.plus") }
                        Button { picking = true } label: { Label("Choose another folder", systemImage: "folder") }
                    } label: { Image(systemName: "ellipsis") }
                        .accessibilityLabel("More")
                }
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { result in
            if case .success(let url) = result { Task { await notes.choose(url) } }
        }
        .alert("New note", isPresented: $naming) {
            TextField("Title", text: $newTitle)
            Button("Cancel", role: .cancel) {}
            Button("Create") {
                Task {
                    if let path = await notes.createNote(title: newTitle) { app.router.push(.note(path)) }
                }
            }
        }
        .task(id: notes.location?.picked) {
            openTodayOnce()
            await notes.reload()
            await notes.indexAll()
        }
        .onChange(of: app.router.tab) { openTodayOnce() }
    }

    private var vaultList: some View {
        List {
            Section {
                Button { app.router.push(.note(notes.todayPath)) } label: { TodayRow(date: .now) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("notes-today")
            }
            if !notes.workstreams.isEmpty {
                Section {
                    ForEach(notes.workstreams) { workstream in
                        Button { app.router.push(.workstream(workstream.id)) } label: { WorkstreamRow(workstream: workstream) }
                            .buttonStyle(.plain)
                    }
                } header: { sectionHeader("Workstreams") }
            }
            Section {
                ForEach(notes.files.filter { $0.path != notes.todayPath }.prefix(60)) { file in
                    Button { app.router.push(.note(file.path)) } label: { NoteRow(file: file, preview: notes.texts[file.path]) }
                        .buttonStyle(.plain)
                }
                if notes.files.isEmpty && !notes.isLoading {
                    Text("No notes yet. Today's note is the first.")
                        .font(.system(size: 15))
                        .foregroundStyle(BD.text2)
                }
            } header: { sectionHeader("Recent") }
            if let location = notes.location {
                Section {
                    Label(location.displayName, systemImage: "folder")
                        .font(.system(size: 14))
                        .foregroundStyle(BD.text3)
                        .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable {
            await notes.reload()
            await notes.indexAll()
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title).font(.system(size: 14, weight: .semibold)).foregroundStyle(BD.text2).textCase(nil)
    }

    /// Once per launch, the first time the Notes tab shows: today's note.
    private func openTodayOnce() {
        guard !notes.openedTodayThisLaunch, app.router.tab == .notes, app.router.notesPath.isEmpty, notes.location != nil else { return }
        notes.openedTodayThisLaunch = true
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-BorgDockNotesList") { return }
        #endif
        app.router.notesPath = [.note(notes.todayPath)]
    }
}

private struct ChooseVaultView: View {
    let choose: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "folder.badge.person.crop")
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(BD.accent)
            Text("Choose your vault")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(BD.text)
            Text("Pick the sync folder that holds BorgDock Notes, or the notes folder itself. They're the same Markdown files the desktop and Obsidian open; they never go to the server.")
                .font(.system(size: 15))
                .foregroundStyle(BD.text2)
                .multilineTextAlignment(.center)
            Button("Choose folder", action: choose)
                .buttonStyle(.bd(.primary))
                .padding(.top, 8)
                .accessibilityIdentifier("choose-vault")
        }
        .padding(28)
        .bdCard()
        .padding(20)
        .frame(maxHeight: .infinity)
    }
}

private struct TodayRow: View {
    let date: Date

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "calendar")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(BD.accent)
                .frame(width: 42, height: 42)
                .background(BD.accentSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text("Today").font(.system(size: 17, weight: .semibold)).foregroundStyle(BD.text)
                Text(NoteEdits.dailyTitle(date)).font(.system(size: 14)).foregroundStyle(BD.text2)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
        }
        .contentShape(Rectangle())
    }
}

struct NoteRow: View {
    let file: NoteFile
    let preview: String?

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: NoteEdits.isDailyPath(file.path) ? "calendar" : "doc.text")
                .font(.system(size: 18))
                .foregroundStyle(BD.yellow)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(file.title).font(.system(size: 17)).foregroundStyle(BD.text).lineLimit(1)
                Text(detail).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    private var detail: String {
        let when = file.modified.formatted(.relative(presentation: .named))
        let folder = file.folder.isEmpty ? nil : file.folder
        return [folder, "Updated \(when)"].compactMap { $0 }.joined(separator: " · ")
    }
}
