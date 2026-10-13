let runtimePromise: Promise<typeof import('web-tree-sitter')> | null = null;

export function loadTreeSitter(): Promise<typeof import('web-tree-sitter')> {
  if (!runtimePromise) {
    runtimePromise = import('web-tree-sitter')
      .then(async (runtime) => {
        await runtime.Parser.init({ locateFile: () => '/web-tree-sitter.wasm' });
        return runtime;
      })
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}
