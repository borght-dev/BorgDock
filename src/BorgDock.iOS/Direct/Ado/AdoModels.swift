import Foundation

// What Azure DevOps sends, as the item page needs it: the port of the types in the server's `ado/client.ts`.

/// A JSON value of unknown shape. ADO's fields are a bag of them: text, numbers, and people as objects.
enum AdoValue: Sendable, Equatable, Decodable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([AdoValue])
    case object([String: AdoValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([AdoValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: AdoValue].self))
        }
    }

    var string: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var number: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    /// A member of an object; nil for anything else.
    subscript(key: String) -> AdoValue? {
        if case .object(let members) = self { return members[key] }
        return nil
    }

    /// How JavaScript's `String(value)` reads a text or a number; nil for the rest.
    var text: String? {
        switch self {
        case .string(let value): value
        case .number(let value): value == value.rounded() && abs(value) < 1e15 ? String(Int(value)) : String(value)
        case .bool(let value): String(value)
        default: nil
        }
    }
}

struct AdoWorkflowState: Sendable, Equatable, Decodable {
    let name: String
    let category: StateCategory
}

/// A GitHub pull request ADO links to an item: ADO's own repository id (never GitHub's) and the number.
struct AdoPullRequestLink: Sendable, Hashable {
    /// Lower-cased.
    let repositoryId: String
    let number: Int

    init(repositoryId: String, number: Int) {
        self.repositoryId = repositoryId
        self.number = number
    }

    private static let artifact = AdoPattern(#"^vstfs:///GitHub/PullRequest/([^%]+)%2F([0-9]+)\z"#, caseInsensitive: true)

    /// `vstfs:///GitHub/PullRequest/<ADO repository id>%2f<number>`, either case of `%2f` (the server's
    /// `pullRequestLinkOf`). Nil for any other artifact.
    init?(artifactURL: String) {
        guard let match = Self.artifact.firstMatch(in: artifactURL), let repositoryId = match[1], let number = Int(match[2] ?? "") else { return nil }
        self.init(repositoryId: repositoryId.lowercased(), number: number)
    }
}

struct AdoRelation: Sendable, Equatable, Decodable {
    let rel: String
    let url: String
    var attributes: [String: AdoValue]? = nil

    private enum CodingKeys: String, CodingKey { case rel, url, attributes }

    init(rel: String, url: String, attributes: [String: AdoValue]? = nil) {
        self.rel = rel
        self.url = url
        self.attributes = attributes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        rel = try container.decodeIfPresent(String.self, forKey: .rel) ?? ""
        url = try container.decodeIfPresent(String.self, forKey: .url) ?? ""
        attributes = try? container.decodeIfPresent([String: AdoValue].self, forKey: .attributes)
    }
}

struct AdoComment: Sendable, Equatable, Decodable {
    struct Author: Sendable, Equatable, Decodable {
        var displayName: String?
    }

    var id: Int?
    var text: String
    /// `html` or `markdown`; older comments have none and are HTML.
    var format: String?
    var createdDate: String
    var createdBy: Author?

    private enum CodingKeys: String, CodingKey { case id, text, format, createdDate, createdBy }

    init(id: Int? = nil, text: String, format: String? = nil, createdDate: String, createdBy: Author? = nil) {
        self.id = id
        self.text = text
        self.format = format
        self.createdDate = createdDate
        self.createdBy = createdBy
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try? container.decodeIfPresent(Int.self, forKey: .id)
        text = (try? container.decodeIfPresent(String.self, forKey: .text)) ?? ""
        format = try? container.decodeIfPresent(String.self, forKey: .format)
        createdDate = (try? container.decodeIfPresent(String.self, forKey: .createdDate)) ?? ""
        createdBy = try? container.decodeIfPresent(Author.self, forKey: .createdBy)
    }
}

/// One entry of ADO's `/_apis/wit/workItems/{id}/updates`.
struct AdoUpdate: Sendable, Equatable, Decodable {
    /// A field's value before and after. A value ADO left out is nil; one it sent as `null` is `.null`.
    struct Change: Sendable, Equatable, Decodable {
        var oldValue: AdoValue?
        var newValue: AdoValue?

        private enum CodingKeys: String, CodingKey { case oldValue, newValue }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            oldValue = container.contains(.oldValue) ? try container.decode(AdoValue.self, forKey: .oldValue) : nil
            newValue = container.contains(.newValue) ? try container.decode(AdoValue.self, forKey: .newValue) : nil
        }
    }

    struct Relations: Sendable, Equatable, Decodable {
        var added: [AdoRelation]?
        var removed: [AdoRelation]?
    }

    var rev: Int
    var revisedBy: AdoValue?
    var revisedDate: String?
    var fields: [String: Change]?
    var relations: Relations?
}

/// A work item as the item page needs it: the summary the screens show, its workflow, and the pull requests ADO links.
struct AdoItem: Sendable, Equatable {
    /// What the server's `summaryOf` leaves.
    let summary: WorkItemSummary
    /// Every state of the item's type, Removed ones included, in process order.
    let states: [AdoWorkflowState]
    let pullRequestLinks: [AdoPullRequestLink]

    static let shortTypes: [String: ItemType] = ["Bug": .bug, "Product Backlog Item": .pbi, "Quality Improvement": .qi, "Task": .task]

    static func pullRequestLinks(in relations: [AdoRelation]?) -> [AdoPullRequestLink] {
        (relations ?? []).compactMap { $0.rel == "ArtifactLink" ? AdoPullRequestLink(artifactURL: $0.url) : nil }
    }

    /// The last part of the iteration path; an item on the project's root iteration is on the backlog.
    static func sprintLabel(iterationPath: String, project: String) -> String {
        if iterationPath.isEmpty || iterationPath == project { return "Backlog" }
        let sprint = AdoText.split(iterationPath, on: "\\").last ?? ""
        return sprint.hasPrefix("Service Pack ") ? String(sprint.dropFirst("Service Pack ".count)) : sprint
    }
}

/// Everything the item page reads from ADO in one go: the item, its raw fields and relations, comments and revisions.
struct AdoItemRead: Sendable, Equatable {
    let item: AdoItem
    let fields: [String: AdoValue]
    let relations: [AdoRelation]
    /// Rich-text fields ADO keeps as markdown already (`multilineFieldsFormat`), lower-cased formats.
    let formats: [String: String]
    /// Newest first, at most 50.
    let comments: [AdoComment]
    let updates: [AdoUpdate]
}

/// The account the credential signs in as.
struct AdoIdentity: Sendable, Equatable {
    let name: String
    let email: String
}

enum AdoWorkflow {
    // ADO lists states per category in arbitrary order (a PBI shows Ready For QA before Code Review).
    // Known states follow the team's process; unknown ones sit at the end of their category.
    private static let processOrder = ["New", "To Do", "Approved", "Committed", "Development In Progress", "In Progress", "Code Review", "Ready For QA", "Done"]

    private static func position(of state: AdoWorkflowState) -> Double {
        if let known = processOrder.firstIndex(of: state.name) { return Double(known) }
        return switch state.category {
        case .proposed: 3.5
        case .inProgress: 5.5
        case .resolved: 7.5
        case .completed: 8.5
        case .removed: 9.5
        case .unknown: 10.5
        }
    }

    /// The states in process order; states that tie keep the order ADO sent them in.
    static func inProcessOrder(_ states: [AdoWorkflowState]) -> [AdoWorkflowState] {
        states.enumerated()
            .sorted { (position(of: $0.element), $0.offset) < (position(of: $1.element), $1.offset) }
            .map(\.element)
    }
}
