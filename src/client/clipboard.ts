export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) { await navigator.clipboard.writeText(text); return; }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  previous?.focus({ preventScroll: true });
  if (!copied) throw new Error('Copy was not permitted by this browser.');
}
