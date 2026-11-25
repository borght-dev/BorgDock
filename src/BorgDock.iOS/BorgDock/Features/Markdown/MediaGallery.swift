import SwiftUI
import UIKit

/// A screenshot or a recording, opened full screen.
struct ZoomedMedia: Identifiable, Hashable {
    enum Kind: Hashable {
        case image, recording
    }

    let url: URL
    let caption: String
    var kind = Kind.image

    var id: URL { url }
}

extension PrDetail {
    /// The description's screenshots, then its recordings: the pages of the gallery its Proof row opens.
    var proofMedia: [ZoomedMedia] {
        proofImages.compactMap { image in URL(string: image.url).map { ZoomedMedia(url: $0, caption: image.alt) } }
            + proofRecordings.compactMap { recording in URL(string: recording.url).map { ZoomedMedia(url: $0, caption: recording.label, kind: .recording) } }
    }
}

/// Swipe between screenshots and recordings. Each page zooms and moves by itself (`ZoomView`), and goes back to the
/// whole picture when you leave it.
struct MediaGallery: View {
    @Environment(\.dismiss) private var dismiss
    let media: [ZoomedMedia]
    @State private var index: Int

    init(showing shown: ZoomedMedia, in media: [ZoomedMedia]) {
        self.media = media.isEmpty ? [shown] : media
        _index = State(initialValue: media.firstIndex(of: shown) ?? 0)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            TabView(selection: $index) {
                ForEach(media.indices, id: \.self) { page in
                    Group {
                        switch media[page].kind {
                        case .image: ZoomedImagePage(image: media[page], isCurrent: page == index)
                        case .recording: RecordingPage(recording: media[page], isCurrent: page == index)
                        }
                    }
                    .tag(page)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .accessibilityIdentifier("proof-gallery")
            GlassIconButton(systemImage: "xmark", label: "Close") { dismiss() }.padding()
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 12) {
                if !media[index].caption.isEmpty {
                    Text(media[index].caption)
                        .font(.system(size: 14))
                        .multilineTextAlignment(.center)
                }
                if media.count > 1 {
                    HStack(spacing: 24) {
                        GlassIconButton(systemImage: "chevron.left", label: "Previous image") { index -= 1 }
                            .disabled(index == 0)
                        Text("\(index + 1) of \(media.count)")
                            .monospacedDigit()
                            .accessibilityIdentifier("proof-gallery-position")
                        GlassIconButton(systemImage: "chevron.right", label: "Next image") { index += 1 }
                            .disabled(index == media.count - 1)
                    }
                }
            }
            .foregroundStyle(.white.opacity(0.8))
            .padding()
            .frame(maxWidth: .infinity)
            .background(.black)
        }
        .environment(\.colorScheme, .dark)
    }
}

private struct ZoomedImagePage: View {
    @Environment(\.imageLoader) private var loader
    let image: ZoomedMedia
    let isCurrent: Bool
    @State private var loaded: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let loaded {
                ZoomView(natural: loaded.pixels, isCurrent: isCurrent, label: image.caption.isEmpty ? "Screenshot" : image.caption) {
                    let view = UIImageView(image: loaded)
                    // A desktop screenshot is shown far below its own size: the smoother filter keeps its text readable.
                    view.layer.minificationFilter = .trilinear
                    return view
                }
            } else if failed {
                Image(systemName: "photo").font(.largeTitle).foregroundStyle(.white.opacity(0.4))
            } else {
                ProgressView().tint(.white)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task(id: image.url) {
            do {
                loaded = try await loader.image(from: image.url)
            } catch is CancellationError {
            } catch {
                failed = true
            }
        }
    }
}

private extension UIImage {
    var pixels: CGSize { CGSize(width: size.width * scale, height: size.height * scale) }
}
