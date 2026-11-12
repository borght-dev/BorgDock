import SwiftUI

/// The one markdown renderer for pull request descriptions, PR comments and reviews, and ADO rich text (which the server
/// sends as markdown). Relative image URLs resolve against the server. Mockup: design/ios-flow/mockups.html, section 04.
///
/// Foundation version: block rendering through `ChatMarkdown`. The PR-page work makes it GitHub-complete (task lists,
/// tables, images, `<details>`, HTML comments and bot footers dropped, AB# chips).
struct GitHubMarkdown: View {
    let markdown: String
    var size: CGFloat = 15

    init(_ markdown: String, size: CGFloat = 15) {
        self.markdown = markdown
        self.size = size
    }

    var body: some View {
        ChatMarkdown(text: markdown, size: size)
            .foregroundStyle(BD.text)
            .tint(BD.accentText)
    }
}
