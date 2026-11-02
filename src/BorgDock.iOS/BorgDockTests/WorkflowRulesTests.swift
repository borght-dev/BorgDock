import XCTest
@testable import BorgDock

final class WorkflowRulesTests: XCTestCase {
    private func item(
        id: Int = 59455,
        type: ItemType = .bug,
        title: String = "Horizon | Checkout: guest and saved addresses fail to load and return 404",
        state: String = "New",
        workflow: [String] = ["New", "Development In Progress", "Code Review", "Ready For QA", "Done"],
        assignedToMe: Bool = true
    ) -> WorkItemSummary {
        WorkItemSummary(
            id: id, type: type, typeName: type.rawValue, title: title, state: state, stateCategory: .proposed,
            workflow: workflow, sprint: "5.2.8", dueDate: nil, priority: 2, tags: [], assignedTo: "Koen van der Borght",
            assignedToMe: assignedToMe, url: "https://dev.azure.com/x/\(id)"
        )
    }

    // MARK: In-progress state

    func testInProgressPrefersDevelopmentInProgress() {
        let flow = ["New", "Queued", "Planning", "Development In Progress", "In Progress", "Code Review", "Done"]
        XCTAssertEqual(WorkflowRules.inProgressState(for: item(workflow: flow)), "Development In Progress")
    }

    func testInProgressForTasks() {
        XCTAssertEqual(WorkflowRules.inProgressState(for: item(type: .task, state: "To Do", workflow: ["To Do", "In Progress", "Done"])), "In Progress")
    }

    func testInProgressAcceptsActive() {
        XCTAssertEqual(WorkflowRules.inProgressState(for: item(workflow: ["New", "Active", "Resolved", "Closed"])), "Active")
    }

    func testInProgressFallsBackToTheSecondState() {
        XCTAssertEqual(WorkflowRules.inProgressState(for: item(workflow: ["Proposed", "Doing", "Done"])), "Doing")
        XCTAssertEqual(WorkflowRules.inProgressState(for: item(state: "Only", workflow: ["Only"])), "Only")
    }

    func testNoMoveIsOfferedWhenAlreadyInProgress() {
        XCTAssertNil(WorkflowRules.startMoveTarget(for: item(state: "Development In Progress")))
        XCTAssertEqual(WorkflowRules.startMoveTarget(for: item(state: "New")), "Development In Progress")
    }

    // MARK: Branch names

    func testBugBranchDropsHorizonPrefixStopWordsAndLongNumbers() {
        XCTAssertEqual(WorkflowRules.branchName(for: item()), "fix/59455-checkout-guest-saved-addresses")
    }

    func testPBIBranchUsesFeat() {
        let pbi = item(id: 58568, type: .pbi, title: "Horizon | Gift card programme: sell, redeem and refund gift cards in every channel")
        XCTAssertEqual(WorkflowRules.branchName(for: pbi), "feat/58568-gift-card-programme-sell")
    }

    func testTaskBranchUsesChoreAndSkipsYearsAndStopWords() {
        let task = item(id: 59463, type: .task, title: "Renew the shop.example.com and api.example.com TLS certificates before 2026-11-10")
        XCTAssertEqual(WorkflowRules.branchName(for: task), "chore/59463-renew-shop-example-api")
    }

    func testQualityImprovementBranchUsesFix() {
        let qi = item(id: 59657, type: .qi, title: "Horizon | Order confirmation email shows the wrong delivery date")
        XCTAssertEqual(WorkflowRules.branchName(for: qi), "fix/59657-order-confirmation-email-shows")
    }

    func testPromptTemplateIsFilled() {
        let template = "Pick up AB#{id}: {title}\n\nWork on branch {branch} and open a PR that links AB#{id}."
        let task = item(id: 59461, type: .task, title: "Verify the TLS certificate on the new web server")
        XCTAssertEqual(
            WorkflowRules.fillPrompt(template, item: task),
            "Pick up AB#59461: Verify the TLS certificate on the new web server\n\nWork on branch chore/59461-verify-tls-certificate-new and open a PR that links AB#59461."
        )
    }

    // MARK: State track

    func testTrackCondensesLongWorkflowsAndKeepsCurrentAndTarget() {
        let flow = ["New", "Approved", "Planning", "Development In Progress", "On Hold", "Needs Human", "Code Review", "Ready For QA", "Test In Progress", "Done"]
        XCTAssertEqual(
            WorkflowRules.trackStates(for: item(state: "On Hold", workflow: flow), target: "Needs Human"),
            ["New", "Development In Progress", "On Hold", "Needs Human", "Code Review", "Ready For QA", "Done"]
        )
        XCTAssertEqual(WorkflowRules.trackStates(for: item(workflow: ["To Do", "In Progress", "Done"]), target: nil), ["To Do", "In Progress", "Done"])
    }

    // MARK: Start sheet

    func testStartDraftPicksTheFirstFreeWorktreeAndBuildsTheRequest() throws {
        let worktrees = [
            Worktree(name: "M0", state: .mine, itemId: 1, running: false, needsYou: true),
            Worktree(name: "M1", state: .busy, itemId: nil, running: true, needsYou: false),
            Worktree(name: "M5", state: .free, itemId: nil, running: false, needsYou: false),
        ]
        let config = AppConfig(
            apiVersion: 1, user: AppUser(name: "Koen", email: "k@example.com"),
            models: [ModelOption(id: "codex/gpt-6.1-sol", label: "GPT-6.1-Sol", provider: .codex, recent: true,
                                 efforts: [EffortOption(id: "low", label: "Low"), EffortOption(id: "high", label: "High")], defaultEffort: "high")],
            defaultModel: "codex/gpt-6.1-sol",
            agents: [AgentOption(id: "codex", label: "Codex"), AgentOption(id: "claude", label: "Claude")],
            defaultAgent: "codex", worktrees: ["M0", "M1", "M5"], promptTemplate: "Pick up AB#{id} on {branch}", vapidPublicKey: nil
        )
        var draft = StartThreadDraft(item: item(state: "New"), fromBrowse: false, config: config, worktrees: worktrees)
        XCTAssertEqual(draft.worktree, "M5")
        XCTAssertFalse(draft.offersAssign)
        XCTAssertEqual(draft.mode, .plan)

        let request = try XCTUnwrap(draft.request())
        XCTAssertEqual(request.model, "codex/gpt-6.1-sol")
        XCTAssertEqual(request.effort, "high")
        XCTAssertNil(request.agent)
        XCTAssertEqual(request.moveAdoTo, "Development In Progress")
        XCTAssertEqual(request.prompt, "Pick up AB#59455 on fix/59455-checkout-guest-saved-addresses")
        XCTAssertFalse(request.assignToMe)

        draft.moveAdo = false
        XCTAssertNil(draft.request()?.moveAdoTo)

        draft.reconcile(with: [Worktree(name: "M5", state: .mine, itemId: 2, running: true, needsYou: false)])
        XCTAssertNil(draft.worktree, "a worktree that got taken can't stay picked")
        XCTAssertNil(draft.request())
    }

    // MARK: Models

    private func liveConfig() throws -> AppConfig {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "config", withExtension: "json"))
        return try JSONDecoder().decode(AppConfig.self, from: Data(contentsOf: url))
    }

    func testDecodesTheCapturedConfigWithModels() throws {
        let config = try liveConfig()
        XCTAssertEqual(config.models.count, 20)
        XCTAssertEqual(config.defaultModel, "codex/gpt-6.1-sol")
        let opus = try XCTUnwrap(config.models.first { $0.id == "claudeAgent/claude-opus-5-5" })
        XCTAssertEqual(opus.provider, .claude)
        XCTAssertTrue(opus.recent)
        XCTAssertEqual(opus.efforts.map(\.label), ["Low", "Medium", "High", "Extra High", "Max", "Ultracode", "Ultrathink"])
        XCTAssertEqual(opus.defaultEffort, "high")
        let haiku = try XCTUnwrap(config.models.first { $0.id == "claudeAgent/claude-haiku-4-5" })
        XCTAssertTrue(haiku.efforts.isEmpty)
        XCTAssertNil(haiku.defaultEffort)
    }

    func testModelGroupsAreRecentThenCodexThenClaude() throws {
        let config = try liveConfig()
        let groups = config.modelGroups
        XCTAssertEqual(groups.map(\.title), ["Recent", "Codex", "Claude"])
        XCTAssertTrue(groups[0].models.allSatisfy(\.recent))
        XCTAssertTrue(groups[1].models.allSatisfy { !$0.recent && $0.provider == .codex })
        XCTAssertTrue(groups[2].models.allSatisfy { !$0.recent && $0.provider == .claude })
        XCTAssertEqual(groups.map(\.models.count).reduce(0, +), config.models.count)
    }

    func testStartDraftPreselectsTheDefaultModelAndResetsEffortOnModelChange() throws {
        let config = try liveConfig()
        var draft = StartThreadDraft(item: item(), fromBrowse: false, config: config, worktrees: [Worktree(name: "M7", state: .free, itemId: nil, running: false, needsYou: false)])
        XCTAssertEqual(draft.model, "codex/gpt-6.1-sol")
        XCTAssertEqual(draft.effort, "high")

        draft.effort = "ultra"
        draft.selectModel("codex/gpt-5.6-sol")
        XCTAssertEqual(draft.effort, "medium", "a new model starts at its own default")

        draft.selectModel("claudeAgent/claude-haiku-4-5")
        XCTAssertNil(draft.effort)
        let request = try XCTUnwrap(draft.request())
        XCTAssertEqual(request.model, "claudeAgent/claude-haiku-4-5")
        XCTAssertNil(request.effort)

        draft.selectModel("not/a-model")
        XCTAssertEqual(draft.model, "claudeAgent/claude-haiku-4-5", "unknown ids are ignored")
    }

    func testConfigWithoutModelsFallsBackToTheLegacyAgent() throws {
        let json = """
        {"apiVersion":1,"user":{"name":"K","email":"k@x"},"agents":[{"id":"claude","label":"Claude"}],"defaultAgent":"claude",
         "worktrees":["M0"],"promptTemplate":"Go {id}","vapidPublicKey":null}
        """
        let config = try JSONDecoder().decode(AppConfig.self, from: Data(json.utf8))
        XCTAssertTrue(config.models.isEmpty)
        XCTAssertNil(config.defaultModel)

        let draft = StartThreadDraft(item: item(), fromBrowse: false, config: config, worktrees: [Worktree(name: "M0", state: .free, itemId: nil, running: false, needsYou: false)])
        let request = try XCTUnwrap(draft.request())
        XCTAssertNil(request.model)
        XCTAssertEqual(request.agent, "claude")
    }

    // MARK: Update for QA

    private let startOptions = StartOptions(
        prompts: .init(pickup: "Server pickup prompt for AB#59455", qa: "/ado-update-for-qa AB#59455", done: "Close AB#59455 as Done: no QA needed"),
        branch: "fix/59455-checkout-guest-saved-addresses",
        qaWorktree: "M3"
    )

    private let freeWorktrees = ["M3", "M7"].map { Worktree(name: $0, state: .free, itemId: nil, running: false, needsYou: false) }

    private func draftWithTemplate() throws -> StartThreadDraft {
        StartThreadDraft(item: item(state: "New"), fromBrowse: false, config: try liveConfig(), worktrees: freeWorktrees)
    }

    func testServerPickupPromptReplacesTheTemplateUntilEdited() throws {
        var draft = try draftWithTemplate()
        XCTAssertTrue(draft.prompt.hasPrefix("Pick up AB#59455"), "the local template while options load")

        draft.applyStartOptions(startOptions)
        XCTAssertEqual(draft.prompt, "Server pickup prompt for AB#59455")

        var edited = try draftWithTemplate()
        edited.prompt = "My own words"
        edited.applyStartOptions(startOptions)
        XCTAssertEqual(edited.prompt, "My own words", "an edited prompt isn't overwritten")
    }

    func testSwitchingToQASwapsThePromptAndBackKeepsEdits() throws {
        var draft = try draftWithTemplate()
        draft.applyStartOptions(startOptions)
        draft.prompt = "Pick it up, but check the stock levels first"

        draft.setMode(.default)
        XCTAssertEqual(draft.prompt, "Pick it up, but check the stock levels first", "plan ↔ straight to work keeps the text")

        draft.setMode(.qa)
        XCTAssertEqual(draft.prompt, "/ado-update-for-qa AB#59455")
        XCTAssertEqual(draft.worktree, "M3", "QA picks the worktree the item last ran in")

        draft.setMode(.plan)
        XCTAssertEqual(draft.prompt, "Pick it up, but check the stock levels first", "edits survive a round trip through QA")
    }

    func testQAOptionsArrivingLateFillTheQAPrompt() throws {
        var draft = try draftWithTemplate()
        draft.setMode(.qa)
        XCTAssertNil(draft.request(), "no QA prompt until the server sends one")
        draft.applyStartOptions(startOptions)
        XCTAssertEqual(draft.prompt, "/ado-update-for-qa AB#59455")
        XCTAssertEqual(draft.worktree, "M3")
    }

    func testQARequestSendsModeQAAndLeavesADOToTheSkill() throws {
        var draft = try draftWithTemplate()
        draft.applyStartOptions(startOptions)
        XCTAssertEqual(draft.moveTarget, "Development In Progress")
        draft.setMode(.qa)
        XCTAssertNil(draft.moveTarget, "the toggle hides")
        XCTAssertTrue(draft.moveAdo, "the toggle's own state is untouched")

        let request = try XCTUnwrap(draft.request())
        XCTAssertEqual(request.mode, .qa)
        XCTAssertNil(request.moveAdoTo)
        XCTAssertEqual(request.prompt, "/ado-update-for-qa AB#59455")
        XCTAssertEqual(request.worktree, "M3")

        draft.setMode(.plan)
        XCTAssertEqual(draft.request()?.moveAdoTo, "Development In Progress", "back to pickup, the move comes back")
    }

    func testQAHintNamesTheBranchWhenKnown() throws {
        var draft = try draftWithTemplate()
        draft.applyStartOptions(startOptions)
        XCTAssertNil(draft.modeHint, "no hint for a plain pickup")
        draft.setMode(.qa)
        XCTAssertEqual(
            draft.modeHint,
            "Runs the ado-update-for-qa skill on fix/59455-checkout-guest-saved-addresses: notes, proof and PR link on the item, then Code Review. Once the PR is merged it moves the item to Ready For QA."
        )
        draft.applyStartOptions(StartOptions(prompts: startOptions.prompts, branch: nil, qaWorktree: nil))
        XCTAssertTrue(draft.modeHint?.hasPrefix("Runs the ado-update-for-qa skill: notes") == true)
    }

    // MARK: Close as done

    func testDoneHasAFallbackPromptUntilTheServerSendsOne() throws {
        var draft = try draftWithTemplate()
        draft.setMode(.done)
        XCTAssertEqual(draft.prompt, "Close AB#59455 as Done without QA and write down why.")
        XCTAssertNotNil(draft.request(), "Done can start before the options load")

        draft.applyStartOptions(startOptions)
        XCTAssertEqual(draft.prompt, "Close AB#59455 as Done: no QA needed")

        var older = try draftWithTemplate()
        older.applyStartOptions(StartOptions(prompts: .init(pickup: "p", qa: "q", done: nil), branch: nil, qaWorktree: nil))
        older.setMode(.done)
        XCTAssertEqual(older.prompt, "Close AB#59455 as Done without QA and write down why.", "older servers send no done prompt")
    }

    func testQAAndDoneKeepTheirOwnTextAndSwapBetweenEachOther() throws {
        var draft = try draftWithTemplate()
        draft.applyStartOptions(startOptions)

        draft.setMode(.qa)
        draft.prompt = "/ado-update-for-qa AB#59455, mention the staging slot"
        draft.setMode(.done)
        XCTAssertEqual(draft.prompt, "Close AB#59455 as Done: no QA needed")
        draft.prompt = "Close it; the fix shipped with 59458"

        draft.setMode(.qa)
        XCTAssertEqual(draft.prompt, "/ado-update-for-qa AB#59455, mention the staging slot")
        draft.setMode(.done)
        XCTAssertEqual(draft.prompt, "Close it; the fix shipped with 59458")
        draft.setMode(.default)
        XCTAssertEqual(draft.prompt, "Server pickup prompt for AB#59455")
    }

    func testDoneRequestSendsModeDoneLeavesADOToTheAgentAndUsesTheQAWorktree() throws {
        var draft = try draftWithTemplate()
        draft.applyStartOptions(startOptions)
        draft.setMode(.done)

        XCTAssertNil(draft.moveTarget, "the toggle hides")
        XCTAssertEqual(draft.worktree, "M3")
        XCTAssertEqual(
            draft.modeHint,
            "For work QA doesn't need to test. The agent checks it's finished, writes why in the item's notes and a comment, then moves it to Done. It stops and asks if anything still needs QA."
        )
        let request = try XCTUnwrap(draft.request())
        XCTAssertEqual(request.mode, .done)
        XCTAssertNil(request.moveAdoTo)
        XCTAssertEqual(request.prompt, "Close AB#59455 as Done: no QA needed")
    }

    func testStartDraftOffersAssignOnlyForItemsThatArentMine() {
        XCTAssertTrue(StartThreadDraft(item: item(assignedToMe: false), fromBrowse: true, config: nil, worktrees: []).offersAssign)
        XCTAssertFalse(StartThreadDraft(item: item(assignedToMe: true), fromBrowse: true, config: nil, worktrees: []).offersAssign)
        XCTAssertTrue(StartThreadDraft(item: item(assignedToMe: false), fromBrowse: false, config: nil, worktrees: []).offersAssign, "queued from Browse, now in Up next")
        XCTAssertFalse(StartThreadDraft(item: item(assignedToMe: true), fromBrowse: false, config: nil, worktrees: []).offersAssign)
    }

    // MARK: Answers

    func testAnswerDraftPreselectsTheRecommendedOptionAndSendsValues() {
        let question = AgentQuestion(
            id: "q1", question: "Which?",
            options: [QuestionOption(label: "Keep the current checkout", value: "keep"), QuestionOption(label: "Switch it now", value: "route")],
            recommended: 0, allowCustomAnswer: true, multiSelect: false
        )
        var draft = AnswerDraft(requestId: "r1", questions: [question])
        XCTAssertEqual(draft.answers(for: [question]), ["q1": .single("keep")])

        draft.pick(1, in: question)
        XCTAssertEqual(draft.answers(for: [question]), ["q1": .single("route")])

        draft.pickCustom(in: question)
        XCTAssertNil(draft.answers(for: [question]), "an empty custom answer isn't an answer")
        draft.setCustomText("  Wait for the payment provider  ", for: question)
        XCTAssertEqual(draft.answers(for: [question]), ["q1": .single("Wait for the payment provider")])
    }

    func testAnswerDraftNeedsEveryQuestionAndHandlesMultiSelect() {
        let single = AgentQuestion(id: "a", question: "?", options: [QuestionOption(label: "A", value: "a")], recommended: nil, allowCustomAnswer: false, multiSelect: false)
        let multi = AgentQuestion(
            id: "b", question: "?", options: [QuestionOption(label: "X", value: "x"), QuestionOption(label: "Y", value: "y")],
            recommended: nil, allowCustomAnswer: false, multiSelect: true
        )
        var draft = AnswerDraft(requestId: "r", questions: [single, multi])
        XCTAssertNil(draft.answers(for: [single, multi]))
        draft.pick(0, in: single)
        draft.pick(1, in: multi)
        draft.pick(0, in: multi)
        XCTAssertEqual(draft.answers(for: [single, multi]), ["a": .single("a"), "b": .multiple(["x", "y"])])
        draft.pick(0, in: multi)
        XCTAssertEqual(draft.answers(for: [single, multi]), ["a": .single("a"), "b": .multiple(["y"])])
    }

    // MARK: Display

    func testModelNamesAndRelativeTimes() {
        XCTAssertEqual(ModelName.display("claude-opus-5-5"), "Claude Opus 5.5")
        XCTAssertEqual(ModelName.display("claude-fable-5-1"), "Claude Fable 5.1")
        XCTAssertEqual(ModelName.display("gpt-5.6-sol"), "gpt-5.6-sol")

        let now = ISODate.parse("2026-10-02T20:00:00.000Z")!
        XCTAssertEqual(RelativeTime.ago("2026-10-02T19:59:40Z", now: now), "just now")
        XCTAssertEqual(RelativeTime.ago("2026-10-02T19:48:00.000Z", now: now), "12m ago")
        XCTAssertEqual(RelativeTime.ago("2026-10-02T17:00:00Z", now: now), "3h ago")
        XCTAssertEqual(RelativeTime.ago("2026-09-30T20:00:00Z", now: now), "2d ago")
    }

    func testServerAddressNormalisation() {
        XCTAssertEqual(ServerSettings.normalize("my-mac.tailnet.ts.net:10000/")?.absoluteString, "https://my-mac.tailnet.ts.net:10000")
        XCTAssertEqual(ServerSettings.normalize("http://localhost:8796")?.absoluteString, "http://localhost:8796")
        XCTAssertNil(ServerSettings.normalize("ftp://x"))
        XCTAssertNil(ServerSettings.normalize("   "))
    }
}
