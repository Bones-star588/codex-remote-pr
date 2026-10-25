import { describe, expect, it } from 'vitest';

import { localImageSource } from './markdown-media';

describe('markdown media', () => {
  it('routes local image paths through the authenticated image endpoint', () => {
    expect(localImageSource('F:\\images\\shot.png')).toBe(
      '/api/local-image?path=F%3A%2Fimages%2Fshot.png'
    );
    expect(localImageSource('file:///F:/images/shot.png')).toBe(
      '/api/local-image?path=F%3A%2Fimages%2Fshot.png'
    );
  });

  it('leaves web and data image URLs unchanged', () => {
    expect(localImageSource('https://example.com/image.png')).toBe(
      'https://example.com/image.png'
    );
    expect(localImageSource('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});
