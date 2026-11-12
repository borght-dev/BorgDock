import SwiftUI

/// The description, rendered as GitHub renders it; images already in the Proof row are left out.
struct PrDescription: View {
    let detail: PrDetail

    var body: some View {
        Group {
            if detail.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text("No description.").font(.system(size: 14.5)).foregroundStyle(BD.text3)
            } else {
                GitHubMarkdown(detail.body, size: 14.5, omittingImages: Set(detail.proofImages.map(\.url)))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .bdCard(radius: 20)
    }
}

/// The description's screenshots in a row; tap one to zoom.
struct ProofRow: View {
    let images: [ProofImage]
    @State private var zoomed: ZoomedImage?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 10) {
                ForEach(images, id: \.self) { image in
                    Button { zoomed = URL(string: image.url).map { ZoomedImage(url: $0, caption: image.alt) } } label: {
                        ImageThumbnail(url: URL(string: image.url), caption: image.alt)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
        .fullScreenCover(item: $zoomed) { ImageZoomView(image: $0) }
    }
}

/// The changed files; tap one to start Quick Review there.
struct PrFilesSection: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail

    var body: some View {
        let key = detail.summary.prKey
        VStack(alignment: .leading, spacing: 0) {
            if let files = app.focus.files[key.key] {
                let prefix = PathPrefix.common(files.files.map(\.path))
                PrSectionLabel(title: prefix.isEmpty ? "Files" : prefix, trailing: "\(files.files.count)")
                PrGroupCard(indent: 40) {
                    ForEach(files.files) { file in
                        Button {
                            app.focus.reviewStartPath[key.key] = file.path
                            app.router.review([key])
                        } label: {
                            PrFileRow(file: file, prefix: prefix, reviewed: false)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            } else {
                PrSectionLabel(title: "Files", trailing: "\(detail.changedFiles)")
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 20)
            }
        }
    }
}

struct PrFileRow: View {
    let file: PrFile
    var prefix = ""
    var reviewed: Bool

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(dot).frame(width: 8, height: 8).frame(width: 16)
            Text(String(file.path.dropFirst(prefix.count)))
                .font(.system(size: 14, design: .monospaced))
                .foregroundStyle(reviewed ? BD.text3 : BD.text)
                .lineLimit(1)
                .truncationMode(.head)
            Spacer(minLength: 8)
            HStack(spacing: 6) {
                if file.additions > 0 { Text(verbatim: "+\(file.additions)").foregroundStyle(BD.green) }
                if file.deletions > 0 { Text(verbatim: "−\(file.deletions)").foregroundStyle(BD.red) }
            }
            .font(.system(size: 13, weight: .medium, design: .monospaced))
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }

    private var dot: Color {
        if reviewed { return BD.green }
        if file.changedSinceReview { return BD.yellow }
        switch file.status {
        case .added: return BD.green.opacity(0.6)
        case .removed: return BD.red.opacity(0.7)
        default: return BD.text3.opacity(0.6)
        }
    }
}

extension ProofImage: Identifiable {
    var id: String { url }
}

struct ProofImageView: View {
    let image: ProofImage

    var body: some View {
        RemoteImage(url: URL(string: image.url), contentMode: .fill)
    }
}
