export const sidebarSwipeSettings = {
  edgeWidth: 28,
  directionThreshold: 10,
  distanceThreshold: 56,
  horizontalRatio: 1.4,
  clickSuppressionMs: 400
} as const;

/** One finger, one direction lock; vertical intent never becomes a drawer swipe. */
export class SidebarSwipe {
  private start: { x: number; y: number; open: boolean } | null = null;
  private horizontal = false;
  private distance = 0;

  begin(x: number, y: number, open: boolean, eligible: boolean): boolean {
    this.cancel();
    if (!eligible || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 ||
      (!open && x > sidebarSwipeSettings.edgeWidth)) return false;
    this.start = { x, y, open };
    return true;
  }

  move(x: number, y: number): boolean {
    if (!this.start) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) { this.cancel(); return false; }
    const dx = x - this.start.x;
    const dy = Math.abs(y - this.start.y);
    const distance = this.start.open ? -dx : dx;
    if (!this.horizontal) {
      if (Math.max(Math.abs(dx), dy) < sidebarSwipeSettings.directionThreshold) return false;
      if (distance <= 0 || Math.abs(dx) < dy * sidebarSwipeSettings.horizontalRatio) {
        this.cancel();
        return false;
      }
      this.horizontal = true;
    }
    this.distance = distance;
    return true;
  }

  finish(): { consumed: boolean; open: boolean | null } {
    const consumed = this.horizontal;
    const open = this.start && consumed && this.distance >= sidebarSwipeSettings.distanceThreshold
      ? !this.start.open : null;
    this.cancel();
    return { consumed, open };
  }

  cancel() {
    this.start = null;
    this.horizontal = false;
    this.distance = 0;
  }
}
