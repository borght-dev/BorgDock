import SwiftUI
import WebKit

/// One recording, played by WebKit: it plays what GitHub's own page plays, WebM included, which AVPlayer does not.
/// The page is the app's and holds only the `<video>`; the controls are drawn by the app, so they stay where they are
/// while the picture is zoomed.
@MainActor
@Observable
final class RecordingPlayer: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    enum Phase {
        case loading, ready, failed
    }

    private(set) var phase = Phase.loading
    /// The video's own frame; 16:9 until it is known.
    private(set) var frame = CGSize(width: 1280, height: 720)
    private(set) var duration: Double = 0
    private(set) var time: Double = 0
    private(set) var isPlaying = false
    private(set) var hasEnded = false
    /// Whether it plays as soon as it can: the page on screen does, a page beside it waits.
    var wantsToPlay = false {
        didSet { if wantsToPlay != oldValue, phase == .ready { wantsToPlay ? play() : pause() } }
    }

    @ObservationIgnored let webView: WKWebView
    /// The page, and the recording itself when the app had to fetch it; removed with the player.
    @ObservationIgnored private let folder = FileManager.default.temporaryDirectory.appending(path: "recording-\(UUID().uuidString)", directoryHint: .isDirectory)
    @ObservationIgnored private var source = ""

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.allowsPictureInPictureMediaPlayback = false
        configuration.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        configuration.userContentController.add(Relay(self), name: "player")
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        // Every touch is the zoom view's: the page has nothing to press.
        webView.isUserInteractionEnabled = false
    }

    deinit {
        try? FileManager.default.removeItem(at: folder)
    }

    /// Streams the address, or plays the file the loader fetched for it when it needs one of the app's tokens.
    func open(_ url: URL, with loader: ImageLoader) async {
        phase = .loading
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            source = try await loader.recording(from: url, into: folder)?.lastPathComponent ?? url.absoluteString
            let page = folder.appending(path: "player.html")
            try Data(Self.page.utf8).write(to: page)
            webView.loadFileURL(page, allowingReadAccessTo: folder)
        } catch {
            // A page that was left stops asking; that is no failure.
            if !Task.isCancelled { phase = .failed }
        }
    }

    func toggle() {
        guard phase == .ready else { return }
        isPlaying ? pause() : play()
    }

    func play() { run(hasEnded ? "video.currentTime = 0; video.play()" : "video.play()") }

    func pause() { run("video.pause()") }

    func seek(to seconds: Double) {
        time = seconds
        run("video.currentTime = \(seconds)")
    }

    private func run(_ script: String) {
        webView.evaluateJavaScript(script) { _, _ in }
    }

    // MARK: The page

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let address = try? JSONEncoder().encode(source), let literal = String(data: address, encoding: .utf8) else { return }
        run("video.src = \(literal)")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { phase = .failed }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { phase = .failed }

    /// The player's own page and nothing else: a recording has nowhere to navigate to.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        navigationAction.request.url?.isFileURL == true && navigationAction.request.url?.lastPathComponent == "player.html" ? .allow : .cancel
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let event = body["event"] as? String else { return }
        func number(_ key: String) -> Double { (body[key] as? Double).flatMap { $0.isFinite ? $0 : nil } ?? 0 }
        switch event {
        case "frame":
            if number("width") > 0, number("height") > 0 { frame = CGSize(width: number("width"), height: number("height")) }
            duration = number("duration")
            if phase != .ready {
                phase = .ready
                if wantsToPlay { play() }
            }
        case "time":
            time = number("time")
        case "state":
            isPlaying = body["playing"] as? Bool ?? false
            hasEnded = body["ended"] as? Bool ?? false
        case "failed":
            phase = .failed
        default:
            break
        }
    }

    /// The content controller keeps its handler alive, and the player keeps the web view: this breaks the circle.
    private final class Relay: NSObject, WKScriptMessageHandler {
        weak var player: RecordingPlayer?

        init(_ player: RecordingPlayer) { self.player = player }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            player?.userContentController(userContentController, didReceive: message)
        }
    }

    private static let page = """
    <!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      video { display: block; width: 100%; height: 100%; object-fit: contain; }
    </style>
    <video id="video" playsinline preload="auto"></video>
    <script>
      const video = document.getElementById('video');
      const tell = (event, more) => window.webkit.messageHandlers.player.postMessage(Object.assign({ event }, more));
      const frame = () => tell('frame', { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 });
      video.addEventListener('loadedmetadata', frame);
      video.addEventListener('durationchange', frame);
      video.addEventListener('timeupdate', () => tell('time', { time: video.currentTime }));
      for (const name of ['play', 'playing', 'pause', 'ended', 'seeked']) {
        video.addEventListener(name, () => tell('state', { playing: !video.paused && !video.ended, ended: video.ended }));
      }
      video.addEventListener('error', () => tell('failed'));
    </script>
    """
}

/// A recording's page in the gallery: the picture zooms and moves like a screenshot, a tap plays or pauses it, and the
/// controls sit under it.
struct RecordingPage: View {
    @Environment(\.imageLoader) private var loader
    @Environment(\.openURL) private var openURL
    let recording: ZoomedMedia
    let isCurrent: Bool
    @State private var player: RecordingPlayer?
    @State private var opening: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                if let player {
                    ZoomView(natural: player.frame, isCurrent: isCurrent, label: recording.caption.isEmpty ? "Recording" : recording.caption, onTap: player.toggle) { player.webView }
                        .opacity(player.phase == .ready ? 1 : 0)
                }
                switch player?.phase {
                case .ready: EmptyView()
                case .failed: unplayable
                default: ProgressView().tint(.white)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if let player, player.phase == .ready { RecordingControls(player: player) }
        }
        // A page beside the one on screen loads nothing: a recording can be large.
        .onChange(of: isCurrent, initial: true) {
            if isCurrent, player == nil { open() }
            player?.wantsToPlay = isCurrent
        }
        .onDisappear(perform: leave)
    }

    private func open() {
        let player = RecordingPlayer()
        player.wantsToPlay = true
        self.player = player
        opening = Task { await player.open(recording.url, with: loader) }
    }

    /// Stops what was still loading, so coming back starts it again; a recording that was ready stays, paused.
    private func leave() {
        opening?.cancel()
        player?.wantsToPlay = false
        if player?.phase != .ready { player = nil }
    }

    private var unplayable: some View {
        VStack(spacing: 14) {
            Image(systemName: "play.slash").font(.largeTitle).foregroundStyle(.white.opacity(0.4))
            Text("This recording can't be played here.").font(.system(size: 15)).foregroundStyle(.white.opacity(0.8))
            Button("Open in the browser") { openURL(recording.url) }
                .font(.system(size: 15, weight: .semibold))
                .buttonStyle(.bordered)
                .tint(.white)
                .accessibilityIdentifier("recording-open-browser")
        }
        .padding(24)
    }
}

/// Play or pause, where it is, a bar to move through it, and how long it is.
private struct RecordingControls: View {
    let player: RecordingPlayer
    /// Where the thumb is while it is dragged; the player follows it.
    @State private var dragged: Double?

    var body: some View {
        HStack(spacing: 12) {
            Button(action: player.toggle) {
                Image(systemName: player.isPlaying ? "pause.fill" : player.hasEnded ? "arrow.counterclockwise" : "play.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
            .accessibilityIdentifier("recording-play")
            Text(Self.clock(dragged ?? player.time)).accessibilityIdentifier("recording-time")
            Slider(
                value: Binding(get: { dragged ?? player.time }, set: { dragged = $0; player.seek(to: $0) }),
                in: 0...max(player.duration, 0.1)
            ) { editing in
                if !editing { dragged = nil }
            }
            .tint(.white)
            .accessibilityLabel("Position")
            Text(Self.clock(player.duration)).accessibilityIdentifier("recording-duration")
        }
        .font(.system(size: 13, weight: .medium))
        .monospacedDigit()
        .foregroundStyle(.white.opacity(0.85))
        .padding(.horizontal, 12)
        .padding(.top, 6)
    }

    static func clock(_ seconds: Double) -> String {
        let whole = max(0, Int(seconds.rounded(.down)))
        return "\(whole / 60):" + String(format: "%02d", whole % 60)
    }
}

/// A recording among the screenshots of a Proof row: dark, with a play mark, and its caption under it.
struct RecordingThumbnail: View {
    let caption: String
    var size = CGSize(width: 108, height: 186)

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.86))
                Image(systemName: "play.fill")
                    .font(.system(size: min(size.height * 0.26, 22), weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: min(size.height * 0.62, 52), height: min(size.height * 0.62, 52))
                    .background(.white.opacity(0.18), in: Circle())
            }
            .frame(width: size.width, height: size.height)
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5))
            if !caption.isEmpty {
                Text(caption).font(.system(size: 12)).foregroundStyle(BD.text2).lineLimit(2).multilineTextAlignment(.leading)
                    .frame(width: size.width, alignment: .leading)
            }
        }
    }
}
