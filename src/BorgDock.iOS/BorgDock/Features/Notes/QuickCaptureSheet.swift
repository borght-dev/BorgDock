import SwiftUI

/// The desktop's Ctrl+F8 on the phone (Action button, Control Center, lock screen): a line for today's note under
/// `## Captured`, linked to the pull request or item you last opened. Dictation starts by default.
struct QuickCaptureSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var context: CaptureContext?
    @State private var dictation = Dictation()
    @State private var prefix = ""
    @State private var saving = false
    @FocusState private var focused: Bool

    static let dictateByDefaultKey = "notes.dictateByDefault"

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Text("Quick note")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(BD.text)
                Label("Today", systemImage: "arrow.right")
                    .labelStyle(TodayPillStyle())
                Spacer()
                Button {
                    Task { await add() }
                } label: {
                    Text("Add").font(.system(size: 17, weight: .semibold)).padding(.horizontal, 10)
                }
                .buttonStyle(.glassProminent)
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saving)
                .accessibilityIdentifier("capture-add")
            }
            if let context {
                HStack(spacing: 6) {
                    Image(systemName: "link")
                    Text("Links \(context.shortRef) · last opened").lineLimit(1)
                    Button { self.context = nil } label: { Image(systemName: "xmark").foregroundStyle(BD.text2) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Don't link \(context.shortRef)")
                }
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(BD.accentText)
                .padding(.horizontal, 12)
                .frame(height: 32)
                .background(BD.accentSoft, in: Capsule())
            }
            TextField("What's on your mind?", text: $text, axis: .vertical)
                .font(.system(size: 18))
                .foregroundStyle(BD.text)
                .lineLimit(3...8)
                .focused($focused)
                .accessibilityIdentifier("capture-text")
            DictationBar(dictation: dictation) {
                prefix = text
                Task { await dictation.toggle() }
            }
        }
        .padding(20)
        .frame(maxHeight: .infinity, alignment: .top)
        .presentationDetents([.height(context == nil ? 236 : 282)])
        .presentationDragIndicator(.hidden)
        .onChange(of: dictation.transcript) { _, transcript in
            guard dictation.isListening || !transcript.isEmpty else { return }
            text = prefix.isEmpty ? transcript : prefix + " " + transcript
        }
        .task {
            context = app.notes.captureContext
            #if DEBUG
            if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "-BorgDockCaptureText"), ProcessInfo.processInfo.arguments.indices.contains(index + 1) {
                text = ProcessInfo.processInfo.arguments[index + 1]
            }
            #endif
            focused = true
            if UserDefaults.standard.object(forKey: Self.dictateByDefaultKey) as? Bool ?? true, !Self.dictationDisabledByLaunch {
                prefix = text
                await dictation.start()
            }
        }
        .onDisappear { dictation.stop() }
    }

    private func add() async {
        saving = true
        defer { saving = false }
        dictation.stop()
        if app.notes.location == nil {
            app.toasts.show("Choose your vault in Notes first.", isError: true)
            return
        }
        if await app.notes.capture(text, context: context) {
            app.toasts.show("Added to today's note")
            dismiss()
        }
    }

    /// `-BorgDockNoDictation 1` for screenshots and UI tests (DEBUG only).
    private static var dictationDisabledByLaunch: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-BorgDockNoDictation")
        #else
        false
        #endif
    }
}

private struct TodayPillStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon.font(.system(size: 11, weight: .bold))
            configuration.title
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(BD.text2)
        .padding(.horizontal, 9)
        .frame(height: 26)
        .background(BD.fill2, in: Capsule())
    }
}

/// The waveform while listening, with a stop button; a microphone button otherwise.
struct DictationBar: View {
    let dictation: Dictation
    let toggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            if dictation.isListening {
                HStack(spacing: 3) {
                    ForEach(Array(dictation.levels.enumerated()), id: \.offset) { index, level in
                        Capsule()
                            .fill(index > dictation.levels.count - 4 ? BD.text3 : BD.accent)
                            .frame(width: 3, height: max(4, 30 * level))
                    }
                }
                .frame(height: 30)
                .animation(.easeOut(duration: 0.12), value: dictation.levels)
                Text("Listening…").font(.system(size: 16)).foregroundStyle(BD.text2)
            } else if case .unavailable(let reason) = dictation.state {
                Text(reason).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(2)
            } else {
                Text("Tap to dictate").font(.system(size: 16)).foregroundStyle(BD.text2)
            }
            Spacer(minLength: 4)
            Button(action: toggle) {
                Image(systemName: dictation.isListening ? "stop.fill" : "mic.fill")
                    .font(.system(size: dictation.isListening ? 14 : 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(dictation.isListening ? BD.red : BD.accent, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(dictation.isListening ? "Stop dictating" : "Dictate")
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .frame(height: 60)
        .background(BD.fill, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
