export function userMessageText(text: string): string {
  if (!/^\s*# (?:Files|Applications) mentioned by the user:[ \t]*\r?\n/.test(text)) {
    return text;
  }

  const request = /^## My request:[ \t]*\r?\n/m.exec(text);
  if (!request) return text;

  return text.slice(request.index + request[0].length).replace(/\r?\n$/, '');
}
