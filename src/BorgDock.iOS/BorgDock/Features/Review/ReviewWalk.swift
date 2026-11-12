import Foundation

/// The order Quick Review reads a pull request in: source files folder by folder, then docs, then the tests and the
/// generated files as one step each (their files in GitHub's order). Every position is a file path or a step, never an index into a list, so the page
/// and the count that names it can't drift apart.
struct ReviewWalk: Hashable {
    /// The files read together on one page instead of one by one.
    enum Group: String, Hashable, CaseIterable {
        case tests, generated
    }

    enum Position: Hashable {
        case file(String)
        case step(Group)

        var path: String? {
            if case .file(let path) = self { return path }
            return nil
        }
    }

    /// Source files, then docs: the files read one by one, numbered among themselves.
    let files: [PrFile]
    let tests: [PrFile]
    let generated: [PrFile]
    /// Every page of the walk in order: the files, then a step per non-empty group.
    let steps: [Position]

    private let byPath: [String: PrFile]
    private let groupByPath: [String: Group]

    init(_ all: [PrFile]) {
        let ordered = ReviewWalk.folderOrder(all)
        let tests = all.filter { $0.kind == .tests }
        let generated = all.filter { $0.kind == .generated }
        files = ordered.filter { $0.kind == .source } + ordered.filter { $0.kind == .docs }
        self.tests = tests
        self.generated = generated
        let groups: [Group] = (tests.isEmpty ? [] : [.tests]) + (generated.isEmpty ? [] : [.generated])
        steps = files.map { .file($0.path) } + groups.map { .step($0) }
        byPath = Dictionary(all.map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
        var groupByPath: [String: Group] = [:]
        for file in tests { groupByPath[file.path] = .tests }
        for file in generated { groupByPath[file.path] = .generated }
        self.groupByPath = groupByPath
    }

    var total: Int { files.count + tests.count + generated.count }
    /// The groups that have a step, in walk order.
    var groups: [Group] { steps.compactMap { if case .step(let group) = $0 { group } else { nil } } }

    func members(of group: Group) -> [PrFile] {
        switch group {
        case .tests: tests
        case .generated: generated
        }
    }

    func file(_ path: String) -> PrFile? { byPath[path] }

    /// The group a test or generated file belongs to; nil for a file read on its own.
    func group(of path: String) -> Group? { groupByPath[path] }

    func contains(_ position: Position) -> Bool {
        switch position {
        case .file(let path): byPath[path] != nil
        case .step(let group): steps.contains(.step(group))
        }
    }

    // MARK: - Moving

    /// The step page a position counts as: a test opened from its step belongs to that step.
    func anchor(of position: Position) -> Position {
        if case .file(let path) = position, let group = group(of: path) { return .step(group) }
        return position
    }

    /// The page after this one. A step's files are read only when opened from the step; from inside them, the next
    /// one in the step, then the page after the step.
    func next(after position: Position) -> Position? {
        if case .file(let path) = position, let group = group(of: path) {
            let members = members(of: group)
            if let index = members.firstIndex(where: { $0.path == path }), index + 1 < members.count { return .file(members[index + 1].path) }
            return following(.step(group))
        }
        return following(position)
    }

    func previous(before position: Position) -> Position? {
        if case .file(let path) = position, let group = group(of: path) {
            let members = members(of: group)
            if let index = members.firstIndex(where: { $0.path == path }), index > 0 { return .file(members[index - 1].path) }
            return .step(group)
        }
        guard let index = steps.firstIndex(of: position), index > 0 else { return nil }
        return steps[index - 1]
    }

    /// Whether `to` comes after `from`, for the direction a page slides in.
    func isForward(from: Position, to: Position) -> Bool {
        let fromIndex = steps.firstIndex(of: anchor(of: from)) ?? 0
        let toIndex = steps.firstIndex(of: anchor(of: to)) ?? 0
        if fromIndex != toIndex { return toIndex > fromIndex }
        // Within one step: the step page first, then its files in order.
        return order(within: to) > order(within: from)
    }

    private func order(within position: Position) -> Int {
        guard case .file(let path) = position, let group = group(of: path) else { return -1 }
        return members(of: group).firstIndex { $0.path == path } ?? 0
    }

    private func following(_ position: Position) -> Position? {
        guard let index = steps.firstIndex(of: position), index + 1 < steps.count else { return nil }
        return steps[index + 1]
    }

    // MARK: - Reviewed

    /// A file is reviewed when you marked it; a step when every file in it is.
    func isReviewed(_ position: Position, in reviewed: Set<String>) -> Bool {
        switch position {
        case .file(let path):
            if let group = group(of: path) { return isReviewed(.step(group), in: reviewed) }
            return reviewed.contains(path)
        case .step(let group):
            return members(of: group).allSatisfy { reviewed.contains($0.path) }
        }
    }

    /// The paths Mark reviewed covers on this page: the file, or every file of the step.
    func paths(markedBy position: Position) -> [String] {
        switch anchor(of: position) {
        case .file(let path): [path]
        case .step(let group): members(of: group).map(\.path)
        }
    }

    /// Files read one by one that aren't reviewed, plus one per step that isn't.
    func left(_ reviewed: Set<String>) -> Int {
        steps.filter { !isReviewed($0, in: reviewed) }.count
    }

    func reviewedFileCount(_ reviewed: Set<String>) -> Int {
        files.filter { reviewed.contains($0.path) }.count
    }

    /// Where a walk starts: the first page you haven't reviewed, else the first page.
    func start(_ reviewed: Set<String>) -> Position? {
        steps.first { !isReviewed($0, in: reviewed) } ?? steps.first
    }

    /// The next page still to review after this one, wrapping around; this page itself last.
    func nextUnreviewed(after position: Position, in reviewed: Set<String>) -> Position? {
        guard !steps.isEmpty else { return nil }
        let start = steps.firstIndex(of: anchor(of: position)) ?? -1
        let rotated = steps.indices.map { steps[(start + 1 + $0) % steps.count] }
        return rotated.first { !isReviewed($0, in: reviewed) }
    }

    // MARK: - Ordering

    /// Folder by folder (a folder's subfolders right after it), files keeping the server's order within a folder.
    static func folderOrder(_ files: [PrFile]) -> [PrFile] {
        files.enumerated()
            .sorted { lhs, rhs in
                let left = lhs.element.path.splitPath.folder
                let right = rhs.element.path.splitPath.folder
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }
}

extension ReviewWalk.Group {
    /// "Tests", "Generated and lockfiles": the row in the Files sheet.
    var title: String {
        switch self {
        case .tests: "Tests"
        case .generated: "Generated and lockfiles"
        }
    }

    /// "Tests · 31 files" in the navigation bar.
    var shortTitle: String {
        switch self {
        case .tests: "Tests"
        case .generated: "Generated"
        }
    }

    var systemImage: String {
        switch self {
        case .tests: "flask"
        case .generated: "gearshape"
        }
    }
}
