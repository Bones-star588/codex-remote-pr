export function isTaskThread(thread: { ephemeral?: boolean; source?: unknown }): boolean {
  return !thread.ephemeral && !(thread.source && typeof thread.source === 'object' &&
    'subAgent' in thread.source);
}
