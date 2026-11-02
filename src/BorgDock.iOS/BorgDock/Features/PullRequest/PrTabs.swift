import SwiftUI

/// The description, who reviewed and the linked work item.
struct PrOverviewTab: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail
    @State private var showWholeDescription = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            description
                .padding(.horizontal, 16)
                .padding(.top, 14)

            let rows = reviewRows
            if !rows.isEmpty {
                PrSectionLabel(title: "Reviews")
                PrGroupCard(indent: 64) {
                    ForEach(rows, id: \.login) { row in
                        HStack(spacing: 14) {
                            PersonAvatar(name: row.name == "You" ? FocusView.firstAndLast(app.config?.user.name ?? row.login) : row.name, size: 36)
                            Text(row.name).font(.system(size: 17)).foregroundStyle(BD.text)
                            Spacer(minLength: 8)
                            PrChipView(chip: row.chip)
                        }
                        .padding(.horizontal, 14)
                        .frame(minHeight: 58)
                    }
                }
                .padding(.horizontal, 16)
            }

            if !detail.workItems.isEmpty {
                PrSectionLabel(title: detail.workItems.count == 1 ? "Work item" : "Work items")
                PrGroupCard(indent: 52) {
                    ForEach(detail.workItems) { item in
                        Button { app.router.push(.workItem(ItemRoute(id: item.id, prefill: item))) } label: {
                            HStack(spacing: 14) {
                                WorkItemGlyph(typeName: item.typeName, size: 16).frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title).font(.system(size: 17)).foregroundStyle(BD.text).lineLimit(1)
                                    Text(itemLine(item)).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(1)
                                }
                                Spacer(minLength: 4)
                                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(BD.text3)
                            }
                            .padding(.horizontal, 14)
                            .frame(minHeight: 62)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            } else if !detail.threads.isEmpty {
                PrSectionLabel(title: "Agents on this branch")
                PrGroupCard(indent: 16) {
                    ForEach(detail.threads) { thread in
                        Button { app.router.push(.thread(thread.id)) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(thread.title).font(.system(size: 16)).foregroundStyle(BD.text).lineLimit(1)
                                    Text(verbatim: "\(thread.status.sentence) · \(ShortTime.age(thread.lastActivityAt))").font(.system(size: 13.5)).foregroundStyle(BD.text2)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(BD.text3)
                            }
                            .padding(14)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    @ViewBuilder
    private var description: some View {
        let excerpt = DescriptionExcerpt.excerpt(detail.body)
        if showWholeDescription {
            Text(markdown(detail.body))
                .font(.system(size: 16.5))
                .foregroundStyle(BD.text)
                .lineSpacing(4)
                .tint(BD.accentText)
                .textSelection(.enabled)
        } else if excerpt.isEmpty {
            Text("No description.").font(.system(size: 16.5)).foregroundStyle(BD.text3)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(markdown(excerpt)).font(.system(size: 16)).foregroundStyle(BD.text).lineSpacing(4)
                if excerpt.count < detail.body.trimmingCharacters(in: .whitespacesAndNewlines).count {
                    Button("Read the whole description") { withAnimation(.snappy) { showWholeDescription = true } }
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(BD.accentText)
                }
            }
        }
    }

    private func markdown(_ text: String) -> AttributedString {
        let cleaned = text.replacingOccurrences(of: #"!\[[^\]]*\]\([^)]*\)"#, with: "", options: .regularExpression)
        return (try? AttributedString(markdown: cleaned, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(cleaned)
    }

    private struct ReviewRow { let login: String; let name: String; let chip: PrChip }

    /// Each reviewer's latest verdict, then who is still asked; you show as "You".
    private var reviewRows: [ReviewRow] {
        let mine = app.focus.myLogins.union([detail.account])
        var latest: [String: PrReview] = [:]
        for review in detail.reviews where review.state != .pending {
            if let earlier = latest[review.author.login], earlier.at > review.at { continue }
            latest[review.author.login] = review
        }
        var rows = latest.values.sorted { $0.at < $1.at }.map { review in
            ReviewRow(login: review.author.login, name: mine.contains(review.author.login) ? "You" : review.author.displayName, chip: review.state.chip)
        }
        for person in detail.requestedReviewers where latest[person.login] == nil {
            let you = mine.contains(person.login)
            rows.append(ReviewRow(login: person.login, name: you ? "You" : person.displayName,
                                  chip: PrChip(text: "Requested \(ShortTime.age(detail.updatedAt))", style: .accent)))
        }
        if detail.requestedFromYou, !rows.contains(where: { $0.name == "You" }) {
            rows.append(ReviewRow(login: detail.account, name: "You", chip: PrChip(text: "Requested", style: .accent)))
        }
        return rows
    }

    private func itemLine(_ item: WorkItemSummary) -> String {
        guard let thread = detail.threads.max(by: { $0.lastActivityAt < $1.lastActivityAt }) else { return item.state }
        let status = thread.status == .running ? "agent running" : thread.status == .settled ? "agent settled" : thread.status.needsYouLabel?.lowercased() ?? "agent"
        return "\(item.state) · \(status) \(ShortTime.age(thread.lastActivityAt)) on \(thread.environmentLabel ?? thread.worktree)"
    }
}

/// The changed files; tap one to start Quick Review there.
struct PrFilesTab: View {
    @Environment(AppModel.self) private var app
    let detail: PrDetail

    var body: some View {
        let key = detail.summary.prKey
        Group {
            if let files = app.focus.files[key.key] {
                let prefix = PathPrefix.common(files.files.map(\.path))
                VStack(alignment: .leading, spacing: 0) {
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
                }
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
            }
        }
        .task { if app.focus.files[key.key] == nil { await app.focus.loadFiles(key) } }
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

/// Images from the description: the desktop's Proof tab.
struct PrProofTab: View {
    let detail: PrDetail
    @State private var zoomed: ProofImage?

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 14) {
            ForEach(detail.proofImages, id: \.self) { image in
                Button { zoomed = image } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        ProofImageView(image: image)
                            .aspectRatio(0.62, contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5))
                        Text(image.alt).font(.system(size: 13)).foregroundStyle(BD.text2).lineLimit(2)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .fullScreenCover(item: $zoomed) { image in
            ZStack(alignment: .topTrailing) {
                Color.black.ignoresSafeArea()
                ProofImageView(image: image).aspectRatio(contentMode: .fit).frame(maxWidth: .infinity, maxHeight: .infinity)
                GlassIconButton(systemImage: "xmark", label: "Close") { zoomed = nil }.padding()
            }
        }
    }
}

extension ProofImage: Identifiable {
    var id: String { url }
}

struct ProofImageView: View {
    let image: ProofImage

    var body: some View {
        AsyncImage(url: URL(string: image.url)) { phase in
            switch phase {
            case .success(let loaded): loaded.resizable().scaledToFill()
            case .failure: Image(systemName: "photo").font(.title).foregroundStyle(BD.text3).frame(maxWidth: .infinity, maxHeight: .infinity).background(BD.fill)
            default: BD.fill
            }
        }
    }
}
