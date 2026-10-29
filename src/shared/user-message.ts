import { parseQuestionReplies } from './async-user-input.js';

export function userMessageText(text: string): string {
  if (/^\s*# (?:Files|Applications) mentioned by the user:[ \t]*\r?\n/.test(text)) {
    const request = /^## My request:[ \t]*\r?\n/m.exec(text);
    if (request) text = text.slice(request.index + request[0].length).replace(/\r?\n$/, '');
  }
  const replies = parseQuestionReplies(text);
  return replies.length ? replies.map(reply => `${reply.question}\n${reply.answer}`).join('\n\n') : text;
}
