import Foundation

// What you do to a pull request: comment, resolve, review, merge, rerun, snooze. Reviews and merges name the head
// commit you looked at, and GitHub is asked first whether it is still the head.

extension GitHubDirect {
    private struct Head: Sendable {
        let id: String
        let sha: String
        let state: String
        let branch: String
        let isCrossRepository: Bool
        let checks: [CheckContext]
    }

    private struct CommentBody: Encodable, Sendable { let body: String }

    private struct ReviewBody: Encodable, Sendable {
        struct Comment: Encodable, Sendable {
            let path: String
            let line: Int
            let side: String
            let body: String
        }

        let commit_id: String
        let event: String
        let body: String
        let comments: [Comment]
    }

    private struct ReviewAnswer: Decodable, Sendable { let id: Int }

    private struct MergeBody: Encodable, Sendable {
        let sha: String
        let merge_method: String
        let commit_title: String?
        let commit_message: String?
    }

    private struct MergeAnswer: Decodable, Sendable {
        let merged: Bool
        let message: String
    }

    private struct NoBody: Encodable, Sendable {}

    private static let commentLimit = 65_000

    private func head(_ key: PrKey, account: String) async throws -> Head {
        let variables: [String: GraphQLValue] = ["owner": .string(key.owner), "repo": .string(key.repo), "number": .int(key.number)]
        let answer = try await client(account).graphql(GitHubQueries.head, variables, as: RawHeadAnswer.self)
        guard let pr = answer.repository?.pullRequest else { throw directError(404, "\(key.key) doesn't exist.") }
        return Head(id: pr.id, sha: pr.headRefOid, state: pr.state, branch: pr.headRefName, isCrossRepository: pr.isCrossRepository, checks: pr.head.checks)
    }

    private func guardHead(_ head: Head, expected: String) throws {
        if head.state != "OPEN" { throw directError(409, "The pull request is no longer open.") }
        if head.sha != expected { throw directError(409, "The pull request has new commits since you loaded it. Look at them first.") }
    }

    private func cleanBody(_ body: String) throws -> String {
        if body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { throw directError(400, "The comment is empty.") }
        if body.count > Self.commentLimit { throw directError(400, "The comment is longer than 65,000 characters.") }
        return body
    }

    /// Runs a write and turns GitHub's failures into what the screens show.
    private func writing<Answer: Sendable>(_ key: PrKey, _ work: (String) async throws -> Answer) async throws -> Answer {
        do {
            let answer = try await work(try account(for: key))
            changed(key)
            return answer
        } catch let error as GitHubError {
            throw error.shown
        }
    }

    func postComment(_ key: PrKey, _ request: PostCommentRequest) async throws -> OKResponse {
        let body = try cleanBody(request.body)
        return try await writing(key) { account in
            if let threadId = request.threadId {
                let _: IgnoredAnswer = try await client(account).graphql(GitHubQueries.reply, ["threadId": .string(threadId), "body": .string(body)])
            } else {
                try await client(account).call("POST", "/repos/\(key.owner)/\(key.repo)/issues/\(key.number)/comments", body: CommentBody(body: body))
            }
            return OKResponse(ok: true)
        }
    }

    func resolveThread(_ key: PrKey, threadId: String) async throws -> OKResponse {
        try await writing(key) { account in
            let _: IgnoredAnswer = try await client(account).graphql(GitHubQueries.resolve, ["threadId": .string(threadId)])
            return OKResponse(ok: true)
        }
    }

    func submitReview(_ key: PrKey, _ request: SubmitReviewRequest) async throws -> SubmitReviewResponse {
        for comment in request.comments {
            if comment.path.isEmpty || comment.line < 1 { throw directError(400, "Each comment needs a path, a line and a side.") }
            _ = try cleanBody(comment.body)
        }
        if request.event != .approve, request.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, request.comments.isEmpty {
            throw directError(400, "Write what you want changed first.")
        }
        return try await writing(key) { account in
            try guardHead(try await head(key, account: account), expected: request.headSha)
            let review = try await client(account).rest(
                "POST", "/repos/\(key.owner)/\(key.repo)/pulls/\(key.number)/reviews",
                body: ReviewBody(
                    commit_id: request.headSha, event: request.event.rawValue, body: request.body,
                    comments: request.comments.map { ReviewBody.Comment(path: $0.path, line: $0.line, side: $0.side.rawValue, body: $0.body) }
                ),
                as: ReviewAnswer.self
            )
            return SubmitReviewResponse(ok: true, reviewId: String(review.id))
        }
    }

    func merge(_ key: PrKey, _ request: MergeRequest) async throws -> MergeResponse {
        try await writing(key) { account in
            let client = try client(account)
            let head = try await head(key, account: account)
            try guardHead(head, expected: request.headSha)
            let title = request.commitTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            if head.checks.contains(where: { $0.state == .pending }) {
                let _: IgnoredAnswer = try await client.graphql(GitHubQueries.autoMerge, [
                    "id": .string(head.id), "method": .string(request.method.rawValue.uppercased()),
                    "headline": title.isEmpty ? .null : .string(title), "body": .string(request.commitMessage), "head": .string(request.headSha),
                ])
                return MergeResponse(merged: false, autoMerge: true, message: "Checks are still running. GitHub merges it when they pass.")
            }
            let result: MergeAnswer
            do {
                result = try await client.rest(
                    "PUT", "/repos/\(key.owner)/\(key.repo)/pulls/\(key.number)/merge",
                    body: MergeBody(sha: request.headSha, merge_method: request.method.rawValue, commit_title: title.isEmpty ? nil : title, commit_message: request.commitMessage)
                )
            } catch let error as GitHubError where error.status == 405 {
                throw directError(400, error.message.replacingOccurrences(of: "GitHub: ", with: "GitHub won't merge it: "))
            }
            if result.merged, request.deleteBranch, !head.isCrossRepository {
                let branch = head.branch.split(separator: "/").map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? String($0) }
                try? await client.call("DELETE", "/repos/\(key.owner)/\(key.repo)/git/refs/heads/\(branch.joined(separator: "/"))")
            }
            return MergeResponse(merged: result.merged, autoMerge: false, message: result.message)
        }
    }

    func rerunFailed(_ key: PrKey) async throws -> RerunResponse {
        try await writing(key) { account in
            let head = try await head(key, account: account)
            var runIds: [Int] = []
            for runId in head.checks.filter({ $0.state == .failure }).compactMap(\.runId) where !runIds.contains(runId) { runIds.append(runId) }
            for runId in runIds {
                try await client(account).call("POST", "/repos/\(key.owner)/\(key.repo)/actions/runs/\(runId)/rerun-failed-jobs", body: NoBody())
            }
            return RerunResponse(reruns: runIds.count)
        }
    }

    /// Kept on this phone: GitHub has no snooze.
    func snooze(_ key: PrKey, until: Date?) -> OKResponse {
        memory.snoozes[key.key] = until.map(GitHubTime.iso)
        store.set(memory, forKey: GitHubMemory.storeKey)
        publishFocus()
        return OKResponse(ok: true)
    }
}

/// A mutation's answer nobody reads.
private struct IgnoredAnswer: Decodable, Sendable {
    init(from decoder: Decoder) throws {}
}
