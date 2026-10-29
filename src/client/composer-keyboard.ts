export type ComposerKeyboardAction =
  | 'newline'
  | 'dismiss-slash'
  | 'move-up'
  | 'move-down'
  | 'choose-slash'
  | 'none';

export interface ComposerKeyboardInput {
  key: string;
  shiftKey: boolean;
  slashOpen: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/**
 * Keep Enter inside the textarea. Sending is deliberately owned by the
 * visible send button, while slash-menu navigation keeps its non-text keys.
 */
export function composerKeyboardAction(input: ComposerKeyboardInput): ComposerKeyboardAction {
  if (input.isComposing || input.keyCode === 229) return 'none';
  if (input.slashOpen) {
    if (input.key === 'Escape') return 'dismiss-slash';
    if (input.key === 'ArrowDown') return 'move-down';
    if (input.key === 'ArrowUp') return 'move-up';
    if (input.key === 'Tab') return 'choose-slash';
  }
  if (input.key === 'Enter') return 'newline';
  return 'none';
}
