import SwiftUI
import UIKit

/// Pinch to zoom, drag to move around, double tap to zoom in on that spot and back: one view in a `UIScrollView`, the
/// way Photos does it. At rest the content fits the space, so a sideways swipe still turns the page of a gallery
/// around it; zoomed in, the same swipe moves the picture until its edge.
struct ZoomView: UIViewRepresentable {
    /// The content's own size: an image's pixels, a video's frame. Its shape fits it to the space, and its width says
    /// how far zooming in still shows more.
    let natural: CGSize
    /// False puts the zoom back: the page of a gallery that was swiped away.
    var isCurrent = true
    /// What VoiceOver calls the picture.
    var label = ""
    var onTap: (() -> Void)?
    /// Made once.
    let content: () -> UIView

    func makeUIView(context: Context) -> ZoomScrollView {
        ZoomScrollView(content: content())
    }

    func updateUIView(_ view: ZoomScrollView, context: Context) {
        view.natural = natural
        view.onTap = onTap
        view.accessibilityLabel = label
        if !isCurrent { view.rest() }
    }
}

final class ZoomScrollView: UIScrollView, UIScrollViewDelegate {
    private let content: UIView
    var natural = CGSize.zero {
        didSet { if natural != oldValue { fittedFor = .zero; setNeedsLayout() } }
    }
    var onTap: (() -> Void)?
    /// The space the content was last fitted to; it is fitted again when the space changes (a turned phone).
    private var fittedFor = CGSize.zero

    /// Each image pixel may grow to this many points before zooming in stops.
    private static let pointsPerPixel: CGFloat = 1.5

    init(content: UIView) {
        self.content = content
        super.init(frame: .zero)
        delegate = self
        addSubview(content)
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        contentInsetAdjustmentBehavior = .never
        decelerationRate = .fast
        isAccessibilityElement = true
        accessibilityTraits = .image
        accessibilityIdentifier = "zoom-view"
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(zoomAtTap))
        doubleTap.numberOfTapsRequired = 2
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        tap.require(toFail: doubleTap)
        addGestureRecognizer(doubleTap)
        addGestureRecognizer(tap)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("ZoomScrollView is made in code") }

    /// Back to the whole picture.
    func rest() {
        if zoomScale != minimumZoomScale { setZoomScale(minimumZoomScale, animated: false) }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.size != fittedFor { fit() }
        centre()
    }

    private func fit() {
        guard bounds.width > 0, bounds.height > 0, natural.width > 0, natural.height > 0 else { return }
        fittedFor = bounds.size
        minimumZoomScale = 1
        zoomScale = 1
        let scale = min(bounds.width / natural.width, bounds.height / natural.height)
        let size = CGSize(width: natural.width * scale, height: natural.height * scale)
        content.frame = CGRect(origin: .zero, size: size)
        contentSize = size
        maximumZoomScale = max(5, Self.pointsPerPixel / scale)
    }

    /// Content smaller than the space sits in its middle; larger, it starts at the scroll view's origin.
    private func centre() {
        var frame = content.frame
        frame.origin.x = frame.width < bounds.width ? (bounds.width - frame.width) / 2 : 0
        frame.origin.y = frame.height < bounds.height ? (bounds.height - frame.height) / 2 : 0
        if frame.origin != content.frame.origin { content.frame = frame }
    }

    @objc private func tapped() { onTap?() }

    /// Zoomed in: back to the whole picture. Otherwise in on the tapped spot, at least far enough to fill the space:
    /// a wide desktop screenshot then fills the phone's height and you move sideways through it.
    @objc private func zoomAtTap(_ tap: UITapGestureRecognizer) {
        guard zoomScale <= minimumZoomScale * 1.01 else { return setZoomScale(minimumZoomScale, animated: true) }
        let fitted = content.bounds.size
        guard fitted.width > 0, fitted.height > 0 else { return }
        let fill = max(bounds.width / fitted.width, bounds.height / fitted.height)
        let scale = min(maximumZoomScale, max(2.5, fill))
        let spot = tap.location(in: content)
        let size = CGSize(width: bounds.width / scale, height: bounds.height / scale)
        zoom(to: CGRect(x: spot.x - size.width / 2, y: spot.y - size.height / 2, width: size.width, height: size.height), animated: true)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { content }

    func scrollViewDidZoom(_ scrollView: UIScrollView) { centre() }

    /// How far in, and where: "Zoomed 2.5×, 50% across, 20% down".
    override var accessibilityValue: String? {
        get {
            guard zoomScale > minimumZoomScale * 1.01 else { return "Fits the screen" }
            func share(_ offset: CGFloat, _ room: CGFloat) -> Int { room > 1 ? Int((min(max(offset / room, 0), 1) * 100).rounded()) : 50 }
            let across = share(contentOffset.x, contentSize.width - bounds.width)
            let down = share(contentOffset.y, contentSize.height - bounds.height)
            return "Zoomed \((zoomScale * 10).rounded() / 10)×, \(across)% across, \(down)% down"
        }
        set {}
    }
}
