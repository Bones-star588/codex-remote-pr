export type ComposerKeyboardAction =
  | 'newline'
  | 'dismiss-slash'
  | 'move-up'
  | 'move-down'
  | 'choose-slash'
  | 'submit'
  | 'none';

export interface ComposerKeyboardInput {
  layout: 'desktop' | 'mobile';
  key: string;
  shiftKey: boolean;
  slashOpen: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export interface ComposerTextSelection {
  start: number;
  end: number;
}

export function insertComposerNewline(text: string, selection: ComposerTextSelection): {
  text: string;
  caret: number;
} {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  return {
    text: `${text.slice(0, start)}\n${text.slice(end)}`,
    caret: start + 1
  };
}

export function composerKeyboardAction(input: ComposerKeyboardInput): ComposerKeyboardAction {
  if (input.isComposing || input.keyCode === 229) return 'none';
  if (input.slashOpen) {
    if (input.key === 'Escape') return 'dismiss-slash';
    if (input.key === 'ArrowDown') return 'move-down';
    if (input.key === 'ArrowUp') return 'move-up';
    if (input.key === 'Tab' || input.layout === 'desktop' && input.key === 'Enter' && !input.shiftKey) return 'choose-slash';
  }
  if (input.key === 'Enter') return input.layout === 'desktop' && !input.shiftKey ? 'submit' : 'newline';
  return 'none';
}
