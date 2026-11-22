import Foundation

/// `Vera · plan — …`: an agent signs what it posts from someone else's account (the server's `signatureOf`, in
/// `borgdock/verdict.ts`).
struct AdoSignature: Sendable, Equatable {
    /// Who signed and what kind of comment it is: `Vera · plan`.
    let author: String
    /// The signature as written, up to where the comment's own text starts.
    let prefix: String

    private static let signed = AdoPattern(#"^([\p{L}][\p{L}.]*) · ([\p{L}\-]+) [—\-] "#)

    /// Nil when nobody signed the text.
    init?(of text: String) {
        guard let match = Self.signed.firstMatch(in: text), let name = match[1], let kind = match[2] else { return nil }
        author = "\(name) · \(kind)"
        prefix = match.text
    }
}

/// What ADO sent for an item, as the page shows it: the part of the server's `borgdock/item-detail.ts` that maps and
/// never reads. Without a server nothing is signed: an image or attachment keeps its ADO address.
enum AdoItemPage {
    private static let parentRelation = "System.LinkTypes.Hierarchy-Reverse"
    private static let longestName = 255

    /// ADO's fields as markdown and as plain text, its revisions as history, effort, area and attachments. The parent
    /// and the pull requests come from further reads.
    static func detail(of read: AdoItemRead, parent: ItemParent?, pullRequests: [ItemPullRequest]) -> ItemDetail {
        let fields = read.fields
        var detail = ItemDetail(
            item: read.item.summary,
            description: AdoHtml.text(fields["System.Description"]?.string),
            acceptanceCriteria: AdoHtml.text(fields["Microsoft.VSTS.Common.AcceptanceCriteria"]?.string),
            reproSteps: AdoHtml.text(fields["Microsoft.VSTS.TCM.ReproSteps"]?.string),
            qaNotes: AdoHtml.text(fields["Custom.QANotes"]?.string),
            comments: read.comments.map(comment)
        )
        func richText(_ field: String) -> String {
            markdown(fields[field]?.string, isMarkdown: read.formats[field] == "markdown")
        }
        detail.markdown = ItemMarkdown(
            description: richText("System.Description"),
            acceptanceCriteria: richText("Microsoft.VSTS.Common.AcceptanceCriteria"),
            reproSteps: richText("Microsoft.VSTS.TCM.ReproSteps"),
            qaNotes: richText("Custom.QANotes"),
            developerNotes: richText("Custom.DeveloperNotes")
        )
        detail.history = AdoHistory.events(of: read.updates)
        detail.pullRequests = pullRequests
        detail.parent = parent
        detail.effort = effort(of: fields)
        detail.areaPath = fields["System.AreaPath"]?.string
        detail.attachments = attachments(of: read.relations)
        return detail
    }

    /// HTML is converted; what ADO already keeps as markdown stays as it is.
    private static func markdown(_ source: String?, isMarkdown: Bool) -> String {
        guard let source, !source.isEmpty else { return "" }
        return isMarkdown ? AdoText.trim(source) : AdoMarkdown.from(html: source)
    }

    /// `Vera · plan — …` is Vera's, whoever's account posted it, as on the desktop.
    static func comment(_ comment: AdoComment) -> ItemComment {
        let isMarkdown = comment.format?.lowercased() == "markdown"
        let plain = isMarkdown ? AdoText.trim(comment.text) : AdoHtml.text(comment.text)
        var markdown = Self.markdown(comment.text, isMarkdown: isMarkdown)
        let signature = AdoSignature(of: plain)
        if let signature, markdown.utf16.starts(with: signature.prefix.utf16) {
            markdown = AdoText.dropping(utf16: signature.prefix.utf16.count, from: markdown)
        }
        return ItemComment(
            id: comment.id,
            by: signature?.author ?? comment.createdBy?.displayName ?? "Unknown",
            at: comment.createdDate,
            text: signature.map { AdoText.dropping(utf16: $0.prefix.utf16.count, from: plain) } ?? plain,
            markdown: markdown
        )
    }

    /// The files attached to the item, each at its ADO address.
    static func attachments(of relations: [AdoRelation]) -> [ItemAttachment] {
        relations.compactMap { relation in
            guard relation.rel == "AttachedFile", let attachment = AdoAttachment(url: relation.url) else { return nil }
            let name = AdoText.prefix(relation.attributes?["name"]?.text ?? attachment.name ?? attachment.guid, utf16: longestName)
            let size = relation.attributes?["resourceSize"]?.number.flatMap { Int(exactly: $0) }
            return ItemAttachment(name: name, url: AdoAttachment.address(relation.url, named: name), size: size)
        }
    }

    private static let parentURL = AdoPattern(#"/workItems/([0-9]+)\z"#, caseInsensitive: true)

    /// The item one level up, from the relation that points at it.
    static func parentId(of relations: [AdoRelation]) -> Int? {
        guard let url = relations.first(where: { $0.rel == parentRelation })?.url,
              let id = Int(parentURL.firstMatch(in: url)?[1] ?? ""), id > 0
        else { return nil }
        return id
    }

    /// Effort, or story points where the process has those: a number, or a text that reads as one.
    private static func effort(of fields: [String: AdoValue]) -> Double? {
        let value = [fields["Microsoft.VSTS.Scheduling.Effort"], fields["Microsoft.VSTS.Scheduling.StoryPoints"]]
            .compactMap { $0 }
            .first { $0 != .null }
        let effort = value?.number ?? value?.string.flatMap { Double(AdoText.trim($0)) }
        return effort?.isFinite == true ? effort : nil
    }
}
