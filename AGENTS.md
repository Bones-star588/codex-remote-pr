# Codex Remote

Self-hosted React and Node.js workspace for Codex Desktop.

## Commands

- Install: `npm ci`
- Validate: `npm run typecheck`, `npm test`, `npm run build`
- Development: `npm run dev`
- Production: `npm start`

## Architecture

- `src/client/`: responsive workspace, native metadata menus, history, approvals.
- `src/client/remote-connection.ts`: socket lifecycle and recovery.
- `src/server/`: authentication, HTTP/WebSocket transport, native desktop bridge.
- `src/server/thread-history.ts`: native bounded history pagination.
- `src/shared/`: protocol and permission profiles.
- `scripts/`: Windows/macOS setup, services, tunnel, and platform controls.

## Product Constraints

- Preserve the default light appearance, system typography, compact header, and
  separate mobile layout. Merge consecutive commands, edits, tools and searches
  into native-style summaries across types. Ordinary reasoning is hidden; viewed
  images and commentary keep their positions. Completed turns fold their process
  under the duration disclosure, leaving the final reply visible.
  Conversation text follows native 14px/22.75px, weight 430; activity headers use
  14px/21px, weight 430. Keep the system font stack and lazy detail bodies.
- Use native turn timing, including metadata cursors for older history. Never
  derive the turn start from item timestamps or the browser connection time.
  Preserve native item timing anchors: the work divider freezes at the final
  answer's native startedAtMs, before answer generation ends. Use saved turn
  completedAt when that anchor is unavailable, then durationMs as a fallback.
  Format narrow Chinese units with zero units omitted, matching Desktop.
  Running labels use host time calibrated by existing heartbeat round trips,
  not an uncorrected phone/browser clock. Recalibrate on reconnect.
  Refresh only the active time label once per second. Keep user/assistant gaps
  larger than prose spacing without loosening command rows.
- Consecutive desktop activity headers use a compact 30px pitch; touch targets
  remain at least 44px. Command/output text uses the native ui-monospace stack,
  12px/18px, weight 400.
- Use the desktop's owning App Server for immediate synchronization.
- Task list requests include all providers with `modelProviders: []` and
  `useStateDbOnly: true`. Follow native cursors; never assume one page is complete.
- Keep history bounded and preserve reading position when prepending older pages.
- Conversation marks use native summary cursors independently of history pages.
  Jump through native item cursors into a bounded window, with paging in both
  directions and return to latest. Preserve known turn ordering when a loaded
  item has no timing yet. Ignore window-external live items while reading older
  history. Follow-up user marks missing from native summaries are added as their
  history is loaded; do not claim a complete unread steering-message index.
- Bootstrap the first task page and metadata over authenticated HTTP. Continue all
  native task cursors progressively. Open chats with one native-backed HTTP
  request: 40 latest records, then older pages of up to 100. Keep the five-chat
  cache in memory only and replace stale snapshots with fresh native results.
- Do not resume a new unsent chat before its first persisted turn.
- Native `turn/steer` uses `expectedTurnId`.
- Composer slash commands use native RPC actions, not text prompts. Skills come
  from `skills/list` for the current directory and submit as native skill input.
  Keep collaboration mode synchronized through resume/settings notifications.
- Native approvals arrive through `mcp-request`; responses use `mcp-response`.
  Respect the request's available decisions.
- Permissions apply per chat. Do not rewrite global Codex config to change them.
- Do not start a second backend that replaces an active Desktop relay.
- Starting or stopping Remote must not terminate Codex Desktop.
- Desktop panel widths resize through captured pointer events and keyboard
  separators. Persist preferred widths only when interaction finishes, keep the
  conversation at least 320px wide, and retain separate mobile drawers. Desktop
  inspectors dock from 900px; below that they overlay. Resize state belongs in
  the panel container so dragging does not rerender the conversation.
- The header terminal opens a real, Remote-owned PTY in the chat/project cwd.
  Sessions belong to their starting directory and survive panel hiding and
  socket reconnection. Only closing a terminal tab or stopping Remote ends it.
  Keep the xterm renderer lazy, output outside React chat state, and replay from
  bounded headless terminal snapshots. Terminal keys must retain shell behavior.
- Side chats use the shared transport and native ephemeral start/fork, created
  only on first send. Ephemeral forks cannot use `deferGoalContinuation`.
  Subscribe to all open side threads, batch their events separately from main
  history, and keep temporary drafts and recovery snapshots in memory only.
  Native ephemeral chats do not support persisted history or queues; steer active
  side turns directly. Closing a side tab interrupts and unsubscribes; hiding
  the inspector preserves tabs. Allow 30 seconds for socket reconnection.
  Ingest embedded items in native turn notifications as well as item events:
  live Desktop can send ephemeral replies only in turn/completed. Retain
  successfully submitted user input in the temporary snapshot with its
  clientUserMessageId; do not duplicate reply bodies inside timing state.
- Main-chat queued submissions use native queue IDs and cursor pagination.
  Dispatch through native queue/start; steering uses expectedTurnId then removes
  the queued submission. Preserve image and skill inputs when editing text.
- Reply branches pass the selected completed lastTurnId. Folder selection uses
  native fs/readDirectory, fs/createDirectory and project/create. Keep these
  controls compact and consistent with Desktop, with 44px touch targets.

## Publication and Privacy

- Never commit `.env`, `data/`, tokens, private keys, session cookies, logs,
  real chat exports, local machine identifiers, or private screenshots.
- Keep documentation examples generic. Use synthetic data for screenshots.
- Preserve upstream copyright and notices.
- README.md and README.zh-CN.md must describe the same behavior and limitations.
- Model/project metadata currently reads its first requested page; model defaults
  can differ from global configuration overrides. Do not imply otherwise.
- Remote terminals are separate from Desktop shells and bypass model permission
  profiles; document this in both READMEs. Some approval forms and actual
  dictation still need dedicated live acceptance.
- Windows has live desktop acceptance. macOS has CI coverage for builds, unit
  tests, shell syntax, and generated LaunchAgents; signed-in desktop integration,
  login persistence, and the legacy tunnel still need live macOS acceptance.
