import { describe, expect, it } from 'vitest';
import { previewPixelRatio } from './preview-rendering';

describe('mobile PDF backing canvases', () => {
  it('retains full device resolution for a phone-width page', () => {
    expect(previewPixelRatio(378, 535, 3)).toBe(3);
  });

  it('limits canvas memory when a high-DPR device zooms in', () => {
    const ratio = previewPixelRatio(1190, 1684, 3);
    expect(ratio).toBeLessThan(3);
    expect(1190 * 1684 * ratio ** 2).toBeLessThanOrEqual(8_000_001);
  });

  it('keeps very tall pages within the supported backing dimension', () => {
    const ratio = previewPixelRatio(400, 12000, 3);
    expect(12000 * ratio).toBeLessThanOrEqual(8192);
  });
});
