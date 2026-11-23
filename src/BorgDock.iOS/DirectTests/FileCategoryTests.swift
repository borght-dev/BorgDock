import XCTest
@testable import BorgDock

/// The server's `test/file-category.test.ts`, case for case.
final class FileCategoryTests: XCTestCase {
    private func withPatch(_ path: String) -> PrFileCategory { FileCategory.of(path, hasPatch: true) }

    func testTestFoldersTestFilesE2eFixturesMocksStoriesAndLoadTestsAreTests() {
        for path in [
            "src/__tests__/cart.ts", "test/cart.ts", "tests/cart.cs", "Domain.Tests/Orders/File.cs", "FSP/FSP.Core.Api.Tests/A.cs", "src/cart.test.tsx", "cart.spec.ts",
            "BorgDockTests/Foo.swift", "src/BorgDock.iOS/BorgDockUITests/X.swift", "Common.UI.Testing/x.cs",
            "e2e/pages/login.ts", "e2e/checkout.spec.ts", "test-fixtures/a.json", "server/test/fixtures/shop.json", "src/__fixtures__/pr.ts", "src/__mocks__/fs.ts",
            ".storybook/mocks/x.ts", "src/components/Button.stories.tsx", "loadtests/run.js",
        ] { XCTAssertEqual(withPatch(path), .tests, path) }
    }

    func testSnapshotsAndLoadTestReportsAreGeneratedEvenInsideTestFolders() {
        for path in ["loadtests/reports/r.html", "e2e/visual.spec.ts-snapshots/a.png", "src/__tests__/__snapshots__/cart.test.ts.snap", "src/cart.snap"] {
            XCTAssertEqual(withPatch(path), .generated, path)
        }
    }

    func testLockfilesGeneratedCodeBuildOutputAndProjectFilesAreGenerated() {
        for path in [
            "bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "src-tauri/Cargo.lock", "toolchain.lock.json", "packages.lock.json",
            "BorgDock.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved", "ios/Podfile.lock",
            "src/generated/changelog.ts", "src/Order.generated.cs", "src/Order.g.cs", "lib/api.g.dart", "public/lib.min.js", "dist/app.js.map", "site/dist/index.html",
            "App.Api/obj/Debug/App.dll", "src-tauri/gen/schemas/x.json", "Forms/Foo.Designer.cs", "BorgDock.xcodeproj/project.pbxproj",
        ] { XCTAssertEqual(withPatch(path), .generated, path) }
    }

    func testABinaryFileWithoutAPatchIsGeneratedWithAPatchOrACodeFileWithoutOneItIsNot() {
        XCTAssertEqual(FileCategory.of("logo.png", hasPatch: false), .generated)
        XCTAssertEqual(FileCategory.of("public/fonts/inter.woff2", hasPatch: false), .generated)
        XCTAssertEqual(FileCategory.of("public/grammars/tree-sitter-sql.wasm", hasPatch: false), .generated)
        XCTAssertEqual(FileCategory.of("logo.png", hasPatch: true), .source)
        XCTAssertEqual(FileCategory.of("src/huge.ts", hasPatch: false), .source)
        XCTAssertEqual(FileCategory.of("e2e/fixtures/logo.png", hasPatch: false), .tests)
    }

    func testDocsFoldersAndMarkdownAreDocsTheRestIsSource() {
        XCTAssertEqual(withPatch("docs/plan.md"), .docs)
        XCTAssertEqual(withPatch("README.md"), .docs)
        XCTAssertEqual(withPatch("documentation/setup.rst"), .docs)
        XCTAssertEqual(withPatch("site/pages/intro.mdx"), .docs)
        for path in ["src/obj/x.ts", "GetActivityTypesForDesigner.cs", "src/services/quick-review.ts", "src/requests/order.ts", "src/Contests/x.ts", "src/latest.ts", "package.json"] {
            XCTAssertEqual(withPatch(path), .source, path)
        }
    }

    func testWindowsSeparatorsCountAsFolders() {
        XCTAssertEqual(withPatch("Domain.Tests\\Orders\\File.cs"), .tests)
        XCTAssertEqual(withPatch("src\\generated\\x.ts"), .generated)
    }
}
