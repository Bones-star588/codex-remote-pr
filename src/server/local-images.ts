import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif']);

export class LocalImages {
  private entries: Record<string, string> = {};
  private ready: Promise<void>;
  private pending = new Map<string, Promise<string | null>>();
  private save = Promise.resolve();

  constructor(private readonly directory: string) {
    this.ready = fs.readFile(path.join(directory, 'index.json'), 'utf8')
      .then(text => { this.entries = JSON.parse(text); })
      .catch(error => { if (error.code !== 'ENOENT') throw error; });
  }

  async resolve(source: string): Promise<string | null> {
    await this.ready;
    const absolute = path.resolve(source);
    if (!imageExtensions.has(path.extname(absolute).toLowerCase())) return null;
    const existing = this.pending.get(absolute);
    if (existing) return existing;
    const request = this.retain(absolute).finally(() => this.pending.delete(absolute));
    this.pending.set(absolute, request);
    return request;
  }

  private async retain(source: string): Promise<string | null> {
    const retained = this.entries[source];
    const info = await fs.stat(source).catch(() => null);
    if (retained) return info?.isFile() ? source : path.join(this.directory, retained);
    if (!info?.isFile()) return null;
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const name = `${randomUUID()}${path.extname(source).toLowerCase()}`;
    const destination = path.join(this.directory, name);
    await fs.copyFile(source, destination);
    this.entries[source] = name;
    const write = this.save.catch(() => {}).then(async () => {
      const temporary = path.join(this.directory, 'index.next');
      await fs.writeFile(temporary, JSON.stringify(this.entries), { mode: 0o600 });
      await fs.rename(temporary, path.join(this.directory, 'index.json'));
    });
    this.save = write;
    await write;
    return destination;
  }

  async remember(item: unknown): Promise<void> {
    const message = item as { type?: string; content?: Array<{ type: string; path?: string }> } | null;
    if (message?.type !== 'userMessage' || !Array.isArray(message.content)) return;
    await Promise.all(message.content.filter(part => part.type === 'localImage' && part.path)
      .map(part => this.resolve(part.path!)));
  }
}
