import type { ComposerAttachment, SkillInfo } from './types';

export type ChatInput = ReturnType<typeof import('./slash-commands').turnInput>;
export interface QueuedSubmission {
  id: string;
  clientUserMessageId: string;
  input: ChatInput;
}

export function queuedDraft(input: ChatInput) {
  return {
    text: input.flatMap(part => part.type === 'text' && 'text' in part ? [part.text] : []).join('\n'),
    attachments: input.flatMap((part, index): ComposerAttachment[] =>
      part.type === 'image' && 'url' in part ? [{ id: `image-${index}`, name: 'Image', url: part.url }] : []),
    skills: input.flatMap((part): SkillInfo[] => part.type === 'skill' && 'name' in part && 'path' in part
      ? [{ name: part.name, path: part.path, description: '', enabled: true }] : [])
  };
}

export function replaceQueuedText(input: ChatInput, text: string): ChatInput {
  return [
    { type: 'text', text: text.trim(), text_elements: [] },
    ...input.filter(part => part.type !== 'text')
  ];
}
