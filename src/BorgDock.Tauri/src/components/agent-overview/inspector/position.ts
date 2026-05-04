const POPOVER_WIDTH = 480;
const POPOVER_MAX_HEIGHT_VH = 0.7;
const GAP = 8;
const VIEWPORT_PADDING = 12;

export interface PopoverStyle {
  position: 'fixed';
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function placePopover(
  anchor: DOMRect,
  viewport: { width: number; height: number },
): PopoverStyle {
  const maxHeight = Math.floor(viewport.height * POPOVER_MAX_HEIGHT_VH);
  const spaceBelow = viewport.height - anchor.bottom - GAP;
  const top = spaceBelow >= maxHeight || spaceBelow >= anchor.top
    ? anchor.bottom + GAP
    : Math.max(VIEWPORT_PADDING, anchor.top - maxHeight - GAP);
  const rawLeft = anchor.left;
  const maxLeft = viewport.width - POPOVER_WIDTH - VIEWPORT_PADDING;
  const left = Math.max(VIEWPORT_PADDING, Math.min(rawLeft, maxLeft));
  return { position: 'fixed', top, left, width: POPOVER_WIDTH, maxHeight };
}
