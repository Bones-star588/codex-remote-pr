# PR #4 Integration Review

Reviewed contributor head: `5d909636310240aec2edeedbee9cb39f2b666f47`.
Baseline: `f38f7366b1cd5724e361edc4e30829ecb29d0076`, deployed as 0.1.5.
Functional batch: 0.1.6.

## Decisions

The contributor's passing CI does not establish that the proposed behavior
matches the product requirements.

- Rejected further shrinking of attachment and conversation-index controls.
  The proposal reduced mobile controls from 36px to 24px, desktop composer
  controls from 28px to about 18.67px, and standalone/touch side-chat controls
  from 44px to about 29.33px. These changes conflict with the operator's
  explicit mobile-only exception and desktop preservation requirement.
- Restored the 0.1.5 mobile and side-chat styles and sizing instructions.
  Desktop retains its existing control dimensions and goal/queue corners.
- Accepted the plain Codex sidebar title, removal of its duplicate menu trigger
  and removal of the help shortcut. The bottom Settings entry retains task
  refresh, archived tasks, app updates, notifications and logout.
- Updated both README languages and the maintainer handoff to describe the
  integrated behavior rather than the rejected contributor proposal.
- Retained the next patch version, 0.1.6, for this functional batch.

The final production source diff contains only Sidebar.tsx and removal of the
obsolete title hover rule. History, transport, timing, drafts, notifications,
service-worker update logic and backend production source are unchanged.

## Validation

TypeScript checks, 409 tests across 63 files and the production build pass.
The sidebar unit tests cover the plain title and retained navigation in both
layout modes. Browser verification uses synthetic data and the deployed 0.1.5
client as its baseline; private conversations and screenshots are not published.

Chromium and Windows WebKit each compare ten viewport/pointer combinations:
2560x1440, 1920x1080, 1440x900, 1024x768 and desktop-pointer 874x402;
coarse-pointer 1024x768; and touch 402x874, 874x402, 390x844 and 320x568.
Sampled main/side attachment, model/send, visible index, sidebar width and
goal/queue geometry match the installed baseline within each engine.
Mobile main/side attachments and index remain 36x36; ordinary desktop
attachments remain 28x28; coarse-pointer desktop side attachments remain 44x44.
Desktop goal corners remain 10px, with 16px top and square bottom queue corners.

Both engines verify the plain title, absent help link, retained five Settings
actions, keyboard activation, outside-click/Escape dismissal, search filtering,
update-dialog opening/closing and the mobile focus trap's new first control.
No horizontal page overflow, page exceptions or synthetic native model actions
occurred. These are bounded geometry/interaction checks, not pixel identity or
physical iOS acceptance. Service-worker behavior is unchanged; its broader
lifecycle evidence remains in the preceding PR #3 review.

Physical iPhone Safari/PWA keyboard, momentum and browser-reserved gestures,
separate Wi-Fi/5G, actual OS notifications and signed-in macOS acceptance remain
separate. No real model turns, answers, goal mutations or notifications are
needed for this change.
