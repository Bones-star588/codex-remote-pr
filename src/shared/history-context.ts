import { userMessageText } from './user-message.js';

export function isReadableHistoryItem(value: unknown): boolean {
  const item = value as {
    type: string; text?: string; phase?: string | null;
    content?: Array<{ type: string; text?: string; path?: string; url?: string }>;
  };
  if (item.type === 'userMessage') return item.content?.some(part => part.type === 'text'
    ? Boolean(userMessageText(part.text ?? '').trim())
    : (part.type === 'image' || part.type === 'localImage') && Boolean(part.path || part.url)) ?? false;
  return item.type === 'agentMessage' && item.phase !== 'commentary' &&
    item.phase !== 'partial_answer' && Boolean(item.text?.trim());
}
