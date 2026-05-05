// .storybook/mocks/tauri-api-dpi.ts
//
// Drop-in replacement for @tauri-apps/api/dpi. Only the constructors used
// by WorktreePaletteApp (and by extension future palette windows) are
// stubbed. The `type` discriminator field mirrors the real Tauri shape in
// case a future window introspects it. Position classes are included
// preemptively so the next window pulling them in doesn't trigger another
// mock-layer extension.

export class LogicalSize {
  readonly type = 'Logical' as const;
  constructor(public width: number, public height: number) {}
}

export class PhysicalSize {
  readonly type = 'Physical' as const;
  constructor(public width: number, public height: number) {}
}

export class LogicalPosition {
  readonly type = 'Logical' as const;
  constructor(public x: number, public y: number) {}
}

export class PhysicalPosition {
  readonly type = 'Physical' as const;
  constructor(public x: number, public y: number) {}
}
