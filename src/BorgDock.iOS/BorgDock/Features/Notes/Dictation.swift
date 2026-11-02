import AVFoundation
import Observation
import Speech

/// Live dictation for the quick note: the microphone's levels for the waveform and the transcript so far.
@MainActor
@Observable
final class Dictation {
    enum State: Equatable {
        case idle
        case listening
        case unavailable(String)
    }

    private(set) var state: State = .idle
    private(set) var transcript = ""
    /// The last few input levels, 0…1, newest last.
    private(set) var levels: [Double] = Array(repeating: 0.08, count: 18)

    @ObservationIgnored private let engine = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?

    var isListening: Bool { state == .listening }

    func toggle() async {
        if isListening { stop() } else { await start() }
    }

    func start() async {
        guard !isListening else { return }
        guard await Self.authorize() else {
            state = .unavailable("Allow speech recognition and the microphone in Settings to dictate.")
            return
        }
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            state = .unavailable("Dictation isn't available right now.")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.addsPunctuation = true
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else { throw DictationError.noMicrophone }
            input.installTap(onBus: 0, bufferSize: 1024, format: format, block: Self.tap(request: request, dictation: self))
            engine.prepare()
            try engine.start()
            self.request = request
            transcript = ""
            task = recognizer.recognitionTask(with: request, resultHandler: Self.results(dictation: self))
            state = .listening
        } catch {
            cleanUp()
            state = .unavailable("Couldn't start dictation: \(error.localizedDescription)")
        }
    }

    func stop() {
        request?.endAudio()
        cleanUp()
        state = .idle
    }

    private func cleanUp() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        task?.finish()
        task = nil
        request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    fileprivate func push(level: Double) {
        levels.removeFirst()
        levels.append(level)
    }

    fileprivate func receive(text: String?, final: Bool) {
        if let text { transcript = text }
        if final, isListening { stop() }
    }

    // The audio tap and the recognizer call back on their own threads, so their closures are made outside the
    // main actor and hop back to it.

    private nonisolated static func tap(request: SFSpeechAudioBufferRecognitionRequest, dictation: Dictation) -> AVAudioNodeTapBlock {
        nonisolated(unsafe) let request = request
        return { buffer, _ in
            request.append(buffer)
            let level = rms(buffer)
            Task { @MainActor in dictation.push(level: level) }
        }
    }

    private nonisolated static func results(dictation: Dictation) -> @Sendable (SFSpeechRecognitionResult?, Error?) -> Void {
        { result, error in
            let text = result?.bestTranscription.formattedString
            let final = (result?.isFinal ?? false) || error != nil
            Task { @MainActor in dictation.receive(text: text, final: final) }
        }
    }

    private nonisolated static func rms(_ buffer: AVAudioPCMBuffer) -> Double {
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for index in 0..<Int(buffer.frameLength) { sum += samples[index] * samples[index] }
        let rms = sqrt(sum / Float(buffer.frameLength))
        return min(1, max(0.06, Double(rms) * 9))
    }

    private static func authorize() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }

    enum DictationError: LocalizedError {
        case noMicrophone
        var errorDescription: String? { "No microphone." }
    }
}
