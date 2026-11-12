import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileCategory } from '../src/github/file-category.ts';

const withPatch = (path: string) => fileCategory(path, true);

test('test folders, test files, e2e, fixtures, mocks, stories and load tests are tests', () => {
  for (const path of [
    'src/__tests__/cart.ts', 'test/cart.ts', 'tests/cart.cs', 'Domain.Tests/Orders/File.cs', 'FSP/FSP.Core.Api.Tests/A.cs', 'src/cart.test.tsx', 'cart.spec.ts',
    'BorgDockTests/Foo.swift', 'src/BorgDock.iOS/BorgDockUITests/X.swift', 'Common.UI.Testing/x.cs',
    'e2e/pages/login.ts', 'e2e/checkout.spec.ts', 'test-fixtures/a.json', 'server/test/fixtures/shop.json', 'src/__fixtures__/pr.ts', 'src/__mocks__/fs.ts',
    '.storybook/mocks/x.ts', 'src/components/Button.stories.tsx', 'loadtests/run.js',
  ]) assert.equal(withPatch(path), 'tests', path);
});

test('snapshots and load-test reports are generated, even inside test folders', () => {
  for (const path of ['loadtests/reports/r.html', 'e2e/visual.spec.ts-snapshots/a.png', 'src/__tests__/__snapshots__/cart.test.ts.snap', 'src/cart.snap']) {
    assert.equal(withPatch(path), 'generated', path);
  }
});

test('lockfiles, generated code, build output and project files are generated', () => {
  for (const path of [
    'bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'src-tauri/Cargo.lock', 'toolchain.lock.json', 'packages.lock.json',
    'BorgDock.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', 'ios/Podfile.lock',
    'src/generated/changelog.ts', 'src/Order.generated.cs', 'src/Order.g.cs', 'lib/api.g.dart', 'public/lib.min.js', 'dist/app.js.map', 'site/dist/index.html',
    'App.Api/obj/Debug/App.dll', 'src-tauri/gen/schemas/x.json', 'Forms/Foo.Designer.cs', 'BorgDock.xcodeproj/project.pbxproj',
  ]) assert.equal(withPatch(path), 'generated', path);
});

test('a binary file GitHub sends no patch for is generated; with a patch, or a code file without one, it is not', () => {
  assert.equal(fileCategory('logo.png', false), 'generated');
  assert.equal(fileCategory('public/fonts/inter.woff2', false), 'generated');
  assert.equal(fileCategory('public/grammars/tree-sitter-sql.wasm', false), 'generated');
  assert.equal(fileCategory('logo.png', true), 'source');
  assert.equal(fileCategory('src/huge.ts', false), 'source');
  assert.equal(fileCategory('e2e/fixtures/logo.png', false), 'tests');
});

test('docs folders and markdown are docs; the rest is source', () => {
  assert.equal(withPatch('docs/plan.md'), 'docs');
  assert.equal(withPatch('README.md'), 'docs');
  assert.equal(withPatch('documentation/setup.rst'), 'docs');
  assert.equal(withPatch('site/pages/intro.mdx'), 'docs');
  for (const path of ['src/obj/x.ts', 'GetActivityTypesForDesigner.cs', 'src/services/quick-review.ts', 'src/requests/order.ts', 'src/Contests/x.ts', 'src/latest.ts', 'package.json']) {
    assert.equal(withPatch(path), 'source', path);
  }
});

test('Windows separators count as folders', () => {
  assert.equal(withPatch('Domain.Tests\\Orders\\File.cs'), 'tests');
  assert.equal(withPatch('src\\generated\\x.ts'), 'generated');
});
