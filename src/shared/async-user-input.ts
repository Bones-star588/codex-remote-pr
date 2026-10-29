/** Native Desktop's persisted answer envelope for asynchronous questions. */
export interface QuestionReply { questionItemId: string; question: string; answer: string }
export interface AsyncQuestion { title: string; options: string[] | null }
export const questionReplyTag = 'send_user_message_question_reply';

export function asyncQuestions(value: unknown): AsyncQuestion[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  // Reject an invalid group instead of reindexing it: the native ID contains its index.
  if (!value.every(question => question && typeof question.title === 'string' && question.title.trim() &&
      (question.options == null || Array.isArray(question.options) && question.options.every((option: unknown) =>
        typeof option === 'string' && option.trim())))) return [];
  return value.map(question => ({ title: question.title, options: question.options ?? null }));
}

export function questionItemId(messageId: string, index: number): string {
  return JSON.stringify(['request_user_input_async', messageId, index]);
}

export function parseQuestionReplies(text: string): QuestionReply[] {
  const match = new RegExp(`^\\s*<${questionReplyTag}>\\s*([\\s\\S]*?)\\s*</${questionReplyTag}>\\s*$`).exec(text);
  if (!match) return [];
  let value: unknown;
  try { value = JSON.parse(match[1]!); } catch { return []; } // Ordinary prose is not an answer envelope.
  if (!Array.isArray(value)) return [];
  return value.filter((reply): reply is QuestionReply => reply && typeof reply.questionItemId === 'string' &&
    typeof reply.question === 'string' && typeof reply.answer === 'string' && Boolean(reply.answer.trim()));
}

export function serializeQuestionReplies(replies: QuestionReply[]): string {
  if (!replies.length || replies.some(reply => !reply.questionItemId || !reply.question.trim() || !reply.answer.trim())) {
    throw new Error('请填写所有问题的答案。');
  }
  return `<${questionReplyTag}>\n${JSON.stringify(replies)}\n</${questionReplyTag}>`;
}
