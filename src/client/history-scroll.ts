export type BeforeHistoryCommit = () => Promise<boolean>;

/** Keep history layout changes out of both the drag and its momentum scroll. */
export class HistoryScroll {
  private touching = false;
  private idle = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readers: Array<(ready: boolean) => void> = [];

  constructor(private readonly onIdle: () => void) {}

  startTouch(): void {
    this.touching = true;
    this.activity();
  }

  endTouch(): void {
    this.touching = false;
    this.activity();
  }

  activity(): void {
    this.idle = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.touching) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.idle = true;
      this.readers.splice(0).forEach(resolve => resolve(true));
      this.onIdle();
    }, 160);
  }

  waitForIdle(): Promise<boolean> {
    return this.idle ? Promise.resolve(true) : new Promise(resolve => this.readers.push(resolve));
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.touching = false;
    this.idle = true;
    this.readers.splice(0).forEach(resolve => resolve(false));
  }
}
