export const mobileViewportConfig = {
  keyboardThreshold: 120,
  scaleTolerance: 0.02,
  glassStorageKey: 'mobile-liquid-glass'
};

export function mobileViewportGeometry(input: {
  layoutHeight: number;
  visibleHeight: number;
  offsetTop: number;
  baselineHeight: number;
  scale: number;
  editing: boolean;
}) {
  const positive = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;
  const layoutHeight = positive(input.layoutHeight, 1);
  const height = positive(input.visibleHeight, layoutHeight);
  const top = Number.isFinite(input.offsetTop) ? Math.max(0, input.offsetTop) : 0;
  return {
    height,
    top,
    keyboardOpen: input.editing && Math.abs(input.scale - 1) < mobileViewportConfig.scaleTolerance &&
      positive(input.baselineHeight, layoutHeight) - height > mobileViewportConfig.keyboardThreshold
  };
}

export function readMobileGlass(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(mobileViewportConfig.glassStorageKey) !== 'off'; }
  catch (error) {
    console.warn('[mobile-layout] could not read appearance preference', error);
    return true;
  }
}
