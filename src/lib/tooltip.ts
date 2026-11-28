interface Box {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

const GAP = 8;

/**
 * Where a tooltip goes, in viewport pixels: above its trigger, below when there is no
 * room above, and always kept inside the window.
 */
export function placeTooltip(
  trigger: Box,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const above = trigger.top - bubble.height - GAP;
  const below = Math.min(trigger.bottom + GAP, Math.max(GAP, viewport.height - bubble.height - GAP));
  const centered = trigger.left + trigger.width / 2 - bubble.width / 2;
  return {
    top: above >= GAP ? above : below,
    left: Math.max(GAP, Math.min(centered, viewport.width - bubble.width - GAP)),
  };
}
