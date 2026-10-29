import { describe, expect, it } from 'vitest';
import { composerKeyboardAction, insertComposerNewline } from './composer-keyboard';

describe('composer keyboard behavior', () => {
  it('keeps plain Enter and Shift+Enter as real newlines', () => {
    expect(composerKeyboardAction({ key: 'Enter', shiftKey: false, slashOpen: false })).toBe('newline');
    expect(composerKeyboardAction({ key: 'Enter', shiftKey: true, slashOpen: false })).toBe('newline');
  });

  it('inserts a newline at the current selection and replaces selected text', () => {
    expect(insertComposerNewline('ab', { start: 1, end: 1 })).toEqual({ text: 'a\nb', caret: 2 });
    expect(insertComposerNewline('hello world', { start: 5, end: 11 })).toEqual({ text: 'hello\n', caret: 6 });
  });

  it('clamps an out-of-range mobile selection safely', () => {
    expect(insertComposerNewline('abc', { start: 99, end: 120 })).toEqual({ text: 'abc\n', caret: 4 });
  });

  it('does not interfere with IME composition', () => {
    expect(composerKeyboardAction({ key: 'Enter', shiftKey: false, slashOpen: false, isComposing: true })).toBe('none');
    expect(composerKeyboardAction({ key: 'Enter', shiftKey: false, slashOpen: false, keyCode: 229 })).toBe('none');
  });

  it('keeps slash-menu navigation on non-text keys without turning Enter into send', () => {
    expect(composerKeyboardAction({ key: 'ArrowDown', shiftKey: false, slashOpen: true })).toBe('move-down');
    expect(composerKeyboardAction({ key: 'ArrowUp', shiftKey: false, slashOpen: true })).toBe('move-up');
    expect(composerKeyboardAction({ key: 'Escape', shiftKey: false, slashOpen: true })).toBe('dismiss-slash');
    expect(composerKeyboardAction({ key: 'Tab', shiftKey: false, slashOpen: true })).toBe('choose-slash');
    expect(composerKeyboardAction({ key: 'Enter', shiftKey: false, slashOpen: true })).toBe('newline');
  });
});
