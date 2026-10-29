# Mobile conversation sidebar gestures

## Open-source review (2026-10-29)

- [react-swipeable](https://github.com/FormidableLabs/react-swipeable): MIT,
  about 2.1k stars, latest repository push 2024-12-23. Includes documentation,
  examples, and tests; peer dependencies explicitly support React 19 and Node 18+.
  Its roughly 30 open issues/PRs and slower recent maintenance warrant review
  before adding it as a production dependency.
- [MUI SwipeableDrawer](https://github.com/mui/material-ui): MIT, about 99k stars,
  active updates on the review date, documented drawer component and tests.
  Current open reports #49449 and #49448 discuss iOS taps with small finger
  drift and scroll locking. MUI would add an unnecessary component system to
  this existing React 19 drawer; the whole repository's issue count is not a
  measure of this component's reliability.

Direct adoption would reduce generic recognition code but add a dependency
and require adapting the existing drawer. Referencing direction-lock and
event-cancellation patterns retains the existing layout with a smaller change.
A small local implementation is recommended for the narrow edge-open/left-close
behavior. No dependency was installed and no third-party implementation copied.

## Behavior and verification

Recognition attaches only to the mobile workspace. A one-finger swipe starts
within 28 CSS pixels of the left edge to open; closing starts on the sidebar or
its backdrop. A 10px direction threshold, horizontal ratio 1.4, and 56px travel
require deliberate horizontal intent. Vertical intent permanently cancels the
current gesture. Input/code areas, selection, modal dialogs, multiple fingers,
noncancelable native gestures, and touch cancellation leave the drawer alone.

Recognition does not rerender chat history during movement. On release it uses
the existing drawer state and slide transition. Horizontal swipes suppress their
synthetic click across the state change; a new deliberate tap is immediately
available. Desktop, keyboard navigation, menu buttons, and focus handling retain
their existing paths. Event listeners are removed on unmount/layout changes.

Unit coverage exercises direction and distance boundaries, reversal, invalid
coordinates, cancellation, touch wiring, exclusion, synthetic clicks, cleanup,
and desktop inactivity. Real iOS Safari and installed-PWA acceptance remains
separate: browser-reserved edge navigation can take priority over page gestures.
