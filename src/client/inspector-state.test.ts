import { describe, expect, it } from 'vitest';
import { toggleInspectorLauncher } from './inspector-state';

describe('right inspector launcher toggle', () => {
  it('opens the new-tab launcher when the sidebar is closed or showing another view', () => {
    expect(toggleInspectorLauncher(false, 'changes')).toEqual({ open: true, view: 'launcher' });
    expect(toggleInspectorLauncher(true, 'changes')).toEqual({ open: true, view: 'launcher' });
  });

  it('closes the sidebar when the launcher is already open', () => {
    expect(toggleInspectorLauncher(true, 'launcher')).toEqual({ open: false, view: 'launcher' });
  });
});
