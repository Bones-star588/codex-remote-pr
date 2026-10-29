# Manual Updates and Mobile Controls Review

Reviewed contributor head `ccb92f746091e44cd6d53dac110e02bf9473e72a`.
The contributor candidate used version 0.1.8; integration follows the existing
one-patch-per-functional-batch policy and uses **0.1.5** after deployed 0.1.4.

## Integration Decisions

- Keep explicit static-app updates, uncached deployment metadata and the
  independent recovery entry. These update public browser assets; they do not
  install server code, execute host commands or change authentication.
- Keep 36px mobile attachment, dictation and conversation-index controls.
  Desktop retains its existing sizes. Mobile geometry must also apply to
  temporary side chats.
- Keep mobile goal and queued-message corner alignment, scoped to the mobile
  layout. Desktop retains the original 10px goal corners and 16px top / square
  bottom queued-message corners.
- Keep mobile edge-open and left-close gestures on the main conversation and
  sidebar. Inspector, preview and side-chat interactions must not open the
  underlying sidebar.

## Corrections

1. The original coarse-pointer side-chat rule left mobile attachment buttons
   at 36x44 while main-chat buttons were 36x36. Explicit mobile minimum height
   now keeps both at 36x36.
2. A right swipe inside an open mobile side chat opened the underlying sidebar.
   Inspector and backdrop surfaces are now excluded. A focused hook regression
   and browser checks cover the original trigger.
3. Global goal/queue radius changes affected desktop layouts. The original
   desktop rules are restored and mobile overrides carry the new appearance.
4. Reload preservation claims were too broad. Only main-chat text drafts are
   persisted. The update dialog and both README languages now state that
   temporary side chats, unsent images and skill selections are cleared.
5. Package and lockfile use the next integration version, 0.1.5.

## Validation

- TypeScript checks, all **407 tests in 62 files**, and the production build pass.
- Chromium compares deployed 0.1.4 and the integration build at 2560x1440,
  1440x900, 1024x768 and 874x402 with a desktop pointer. Measured attachment,
  model, send, sidebar, goal and queued-message geometry matches. This is a
  sampled geometry comparison, not a claim of complete pixel identity.
- Chromium and Windows WebKit layout checks cover desktop, narrow desktop, 402x874, 320x568 and
  touch 874x402. Main/side mobile controls measure 36x36; desktop attachments
  remain 28x28. Dialog/Escape behavior, main conversation swipes, vertical
  gesture rejection and inspector exclusion pass without page exceptions
  or horizontal page overflow.
  Windows WebKit viewport configuration is adjusted for host display scaling;
  gestures here exercise the real handlers with synthetic touch lifecycle events.
- Real Chromium service-worker checks cover first installation, an installed
  legacy shell with another open window, a failed public-asset installation
  followed by explicit retry, and the authenticated settings action.
  Synthetic cookies, main text drafts and an unrelated private-cache sentinel
  survive. The legacy window keeps its old module and does not reload.
- The settings action restores an actual main-composer text draft after reload
  and reopening its chat. No native model requests, answers, Goal changes or
  device notifications are submitted by these fixtures.

Connection recovery, native history/pagination, timing, file citations,
notifications and model-action transport retain their production source.
The full unit suite covers their existing regressions; this change does not
claim new real-network recovery measurements.

Physical iPhone Safari/Home Screen update, reserved browser-edge navigation,
real keyboard/momentum/network behavior and signed-in macOS remain separate
acceptance work. Browser fixtures use synthetic conversations and do not
establish physical-device performance.
