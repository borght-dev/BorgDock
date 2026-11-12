import SwiftUI

/// Every file, from the walk's title: the files read one by one with what you've reviewed, then the steps. A tap
/// opens that page (mockup section 05, "Every file, from the title").
struct ReviewFilesSheet: View {
    @Environment(\.dismiss) private var dismiss
    let session: ReviewSession
    @State private var showsAll = false

    var body: some View {
        let walk = session.walk
        let visible = showsAll ? walk.files : Array(walk.files.prefix(visibleCount))
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if !walk.files.isEmpty {
                        header("Source · \(walk.reviewedFileCount(session.reviewed)) of \(walk.files.count) reviewed")
                        CellGroup(indent: 40) {
                            ForEach(visible) { file in
                                Button { open(.file(file.path)) } label: {
                                    let current = session.position == .file(file.path)
                                    ReviewFileRow(file: file, highlighted: current) { mark(file, current: current) }
                                }
                                .buttonStyle(.plain)
                            }
                            if walk.files.count > visible.count {
                                MoreRow(count: walk.files.count - visible.count) { withAnimation(.snappy) { showsAll = true } }
                            }
                        }
                    }
                    if !walk.groups.isEmpty {
                        header("One step each")
                        CellGroup(indent: 56) {
                            ForEach(walk.groups, id: \.self) { group in
                                Button { open(.step(group)) } label: { stepRow(group) }.buttonStyle(.plain)
                            }
                        }
                    }
                    Text("The server decides which paths count as tests or generated, with the same rules as the desktop.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(BD.text3)
                        .lineSpacing(2)
                        .padding(.horizontal, 24)
                        .padding(.top, 14)
                }
                .padding(.bottom, 24)
            }
            .background(BD.sheet)
            .navigationTitle("\(walk.total) files")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(BD.text) }.accessibilityLabel("Close")
                }
            }
        }
        .presentationDetents([.fraction(0.82), .large])
        .presentationDragIndicator(.visible)
    }

    /// Up to the current file and a few after it, so the file you're on is always in the short list.
    private var visibleCount: Int {
        let current = session.position.flatMap { position in session.walk.files.firstIndex { .file($0.path) == position } } ?? 0
        return max(6, current + 3)
    }

    private func header(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(BD.text2)
            .padding(.horizontal, 28)
            .padding(.top, 18)
            .padding(.bottom, 7)
    }

    @ViewBuilder
    private func mark(_ file: PrFile, current: Bool) -> some View {
        if current {
            Circle().fill(BD.accent).frame(width: 7, height: 7)
        } else if session.isReviewed(.file(file.path)) {
            Image(systemName: "checkmark.circle").font(.system(size: 15, weight: .semibold)).foregroundStyle(BD.green)
        } else {
            Image(systemName: "circle.dashed").font(.system(size: 15)).foregroundStyle(BD.text3)
        }
    }

    private func stepRow(_ group: ReviewWalk.Group) -> some View {
        let members = session.walk.members(of: group)
        let detail = group == .tests
            ? "\(members.count) files · +\(members.reduce(0) { $0 + $1.additions }) −\(members.reduce(0) { $0 + $1.deletions })"
            : "\(members.count) files · \(ReviewWalk.describeGenerated(members.map(\.path)))"
        return HStack(spacing: 10) {
            StepIcon(group: group)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(group.title).font(.system(size: 15.5, weight: .semibold)).foregroundStyle(BD.text)
                    if session.isReviewed(.step(group)) {
                        Image(systemName: "checkmark.circle").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.green)
                    }
                }
                Text(detail).font(.system(size: 12.5)).foregroundStyle(BD.text2).lineLimit(1)
            }
            Spacer(minLength: 6)
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
        }
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 54)
        .background(session.position.map(session.walk.anchor(of:)) == .step(group) ? BD.accentSoft : .clear)
        .contentShape(Rectangle())
    }

    private func open(_ position: ReviewWalk.Position) {
        session.go(to: position)
        dismiss()
    }
}
