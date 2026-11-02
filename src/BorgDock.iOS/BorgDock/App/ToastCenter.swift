import Foundation
import Observation

/// One short message at a time at the top of the screen, optionally with a link.
@MainActor
@Observable
final class ToastCenter {
    struct Toast: Identifiable, Equatable {
        let id = UUID()
        let message: String
        let isError: Bool
        let link: Link?
    }

    struct Link: Equatable {
        let title: String
        /// Tried in order until one opens (T3 Code app, then the web UI).
        let urls: [URL]
    }

    private(set) var current: Toast?
    @ObservationIgnored private var dismissTask: Task<Void, Never>?

    func show(_ message: String, isError: Bool = false, link: Link? = nil) {
        let toast = Toast(message: message, isError: isError, link: link)
        current = toast
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(isError || link != nil ? 6 : 4))
            guard !Task.isCancelled else { return }
            if self?.current?.id == toast.id { self?.current = nil }
        }
    }

    func dismiss() {
        dismissTask?.cancel()
        current = nil
    }
}
