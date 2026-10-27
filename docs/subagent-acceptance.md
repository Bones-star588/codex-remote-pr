# Subagent Acceptance

Date: 2026-10-27.

## Implemented

- Native `collabAgentToolCall` and `subAgentActivity` presentation, including
  startup before a thread ID exists, startup failure and interrupted startup.
- One clickable entrance per child in a response, retained outside completed
  process folds. Late activity after a final answer does not duplicate it.
- Native names, roles and known status, with live child turn state in open tabs.
- A paginated direct-child directory using native parent and source filters,
  including archived children beyond the current parent history window.
- Independent child tabs, recent history, earlier paging, native work timing,
  folded execution output, file links and reconnect recovery.
- Composed main/side-chat/child subscriptions. Closing a viewer cancels its HTTP
  download and removes its Remote watch without stopping the native agent.
- Read history first; rejoin only active native children without configuration
  changes. The viewer does not send delegated instructions.

## Verification

- Full suite: 146 tests across 31 files. TypeScript and production build pass.
- Synthetic browser acceptance: 2560x1440, 1024x768, 402x874 at DPR 3, and
  320x568 with touch. No page overflow or browser exceptions.
- Browser scenarios include merged records, child streaming without main-chat
  contamination, completion, history paging, archived reads, hide/reopen,
  reconnect and simultaneous temporary side-chat subscriptions.
- Closing child tabs issued neither `turn/interrupt` nor `thread/unsubscribe`.
- Installed native protocol bindings confirmed the collaboration item schemas.
- Read-only Windows Desktop queries confirmed direct-parent filtering and real
  archived child history. Local and public deployed UI opened the same real
  archived child through its actual history API, with eight assistant messages
  visible in the bounded page. No model request was submitted.
- README screenshot uses synthetic data only.

## Remaining Live Acceptance

Freshly spawned active native agents were not created for this test. Running
states and event transitions were exercised with native-shaped synthetic events.
Signed-in macOS and physical-phone browser/network acceptance remain separate.
Pixel-exact equivalence with every Desktop subagent view is not claimed.
