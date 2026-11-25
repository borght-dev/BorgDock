import XCTest
@testable import BorgDock

/// The recordings in a description or comment. The first four cases are the desktop's
/// (`services/__tests__/review-proof-recordings.test.ts`); change a rule on both sides together.
final class ProofRecordingsTests: XCTestCase {
    private let upload = "https://github.com/user-attachments/assets/0f1e2d3c-aaaa-bbbb-cccc-1234567890ab"

    private func addresses(_ body: String) -> [String] {
        ProofRecordings.find(in: body).map(\.url)
    }

    func testFindsAnUploadOnALineOfItsOwnAVideoElementAndALinkToAVideoFile() {
        let body = [
            "## Proof",
            "",
            upload,
            "",
            "<video src=\"https://example.com/flow.mp4\" controls></video>",
            "",
            "[Screen recording](https://example.com/checkout.webm)",
            "https://example.com/demo.mov?raw=1",
        ].joined(separator: "\n")
        XCTAssertEqual(ProofRecordings.find(in: body), [
            ProofRecording(url: "https://example.com/flow.mp4", label: "Recording 1"),
            ProofRecording(url: "https://example.com/checkout.webm", label: "Recording 2"),
            ProofRecording(url: upload, label: "Recording 3"),
            ProofRecording(url: "https://example.com/demo.mov?raw=1", label: "Recording 4"),
        ])
    }

    func testNamesASingleRecordingPlainly() {
        XCTAssertEqual(ProofRecordings.find(in: "Proof:\n\n\(upload)"), [ProofRecording(url: upload, label: "Recording")])
    }

    func testDoesNotTakeAnImageAPageOrAnUploadInsideASentenceForARecording() {
        let body = [
            "![After](\(upload))",
            "See \(upload) for the flow.",
            "https://example.com/docs/page",
            "[Docs](https://example.com/guide.html)",
        ].joined(separator: "\n")
        XCTAssertEqual(ProofRecordings.find(in: body), [])
    }

    func testLeavesOutARecordingInABotFooter() {
        XCTAssertEqual(ProofRecordings.find(in: "<!-- tool:footer -->\n\(upload)\n<!-- /tool:footer -->"), [])
    }

    func testReadsABodyWithWindowsLineEndings() {
        XCTAssertEqual(addresses("## Proof\r\n\r\n\(upload)\r\n\r\nDone.\r\n"), [upload])
    }

    func testKeepsALinksSignatureAndReadsASourceInsideAVideo() {
        let signed = "https://example.com/proofs/main.webm?sv=1&sig=abc%3D"
        let body = """
        [main-video](\(signed))
        <video controls><source src="https://example.com/proofs/focus.mp4?a=1&amp;b=2" type="video/mp4"></video>
        <a href="https://example.com/proofs/extra.m4v">Extra</a>
        """
        XCTAssertEqual(addresses(body), ["https://example.com/proofs/focus.mp4?a=1&b=2", "https://example.com/proofs/extra.m4v", signed])
    }

    func testAnUploadInARepositorysOwnAssetsCounts() {
        XCTAssertEqual(addresses("https://github.com/acme/shop/assets/12/0f3a-9b"), ["https://github.com/acme/shop/assets/12/0f3a-9b"])
        XCTAssertEqual(addresses("https://github.com/acme/shop/pull/12"), [])
        XCTAssertEqual(addresses("https://github.com.example.com/user-attachments/assets/0f3a"), [])
    }

    func testAVideoFileIsKnownByItsExtension() {
        XCTAssertTrue(ProofRecordings.isVideoFile("https://example.com/a/Flow.WEBM"))
        XCTAssertTrue(ProofRecordings.isVideoFile("https://example.com/a/flow.mp4?sv=1&sig=x#t=2"))
        XCTAssertFalse(ProofRecordings.isVideoFile("https://example.com/a/flow.mp4.html"))
        XCTAssertFalse(ProofRecordings.isVideoFile("https://example.com/webm"))
    }

    func testTheDescriptionLosesTheLineOfAnUploadedRecordingOnly() {
        let body = "Before\r\n\r\n\(upload)\r\n\r\nSee \(upload) too.\nhttps://example.com/demo.mov"
        XCTAssertEqual(ProofRecordings.withoutUploadLines(body), "Before\n\n\n\nSee \(upload) too.\nhttps://example.com/demo.mov")
    }
}
