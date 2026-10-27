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
  Anchor a visible stable item, not a scrollHeight snapshot taken before a
  request. Restore before paint and on delayed layout changes, while updating
  the anchor when the reader scrolls during a request.
  Prefetch at most one older page in memory within two viewport heights of the
  top; insert within 64px of the top after the gesture and momentum have settled,
  without replacing the visible stream. Recheck scroll idleness after network
  completion and retain the prepared page if the reader has left the top.
  Never prepend history or compensate its position during a drag.
  Prepare native timings before insertion, share speculative/foreground reads, and discard
  abandoned pages. Preserve response/activity identities and expanded state
  across partial-turn boundaries. Do not estimate chat-block heights with
  content-visibility; reserve thumbnail geometry and reuse unchanged responses.
  Underfilled viewports prefetch but consume history only on upward intent.
  Older timing metadata fills missing turns; current live timings always win.
- Reply links open lazy inspector preview tabs. Resolve relative files against
  the owning chat's cwd, retain native line suffixes, and keep preview content
  out of public caches. HTML runs without same-origin privileges; its short-lived
  resource grant is read-only and confined to the document's directory.
  Never expose the Remote session to generated HTML. Binary Office formats are
  downloads; HTML preview does not build source projects.
- Keep task pagination complete and yield to interaction; do not restart full
  task/outline pagination on routine native events. Short reconnects replay
  subscribed events from the bounded memory journal, with sequence deduplication
  and native snapshot fallback. Never resubmit uncertain model requests.
- PWA and edge caches contain public static assets only. Do not cache API,
  conversations, local images, approvals, or terminal output. Edge routes must
  leave /api, /ws and /health on the authenticated origin.
- Use scripts/acceptance-viewports.json for responsive acceptance, including
  402x874 and 874x402 CSS viewports at DPR 3. Physical-phone networks and
  signed-in macOS integration require separate live acceptance.
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
- Abort abandoned HTTP history and permission reads when their selection changes;
  coalesce identical pending reads. Bootstrap and WebSocket share model/project
  lookups, with a five-second completed-result handoff. Invalidate on project
  creation or bridge loss. Never deduplicate or cancel model actions this way.
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
  Composer portals sit above the inspector, including expanded and mobile
  panels. Mobile focus trapping ignores portal targets. Dialogs and consumed
  shortcuts must not trigger workspace shortcuts. Preserve initial queued
  skills and current model choices across asynchronous side-thread creation.
- Subagents use native collabAgentToolCall and subAgentActivity records, merged
  per child within a response. Keep their clickable entrances outside completed
  process folds. Discover direct children using parentThreadId and
  sourceKinds: ['subAgentThreadSpawn'], all providers, both archive states and
  all native cursors. Keep agent conversations separate from ephemeral chats.
  Read bounded child history first; rejoin active children without config
  overrides. Closing a child viewer must never interrupt or unsubscribe its
  native thread. Compose watcher owners so side chats and children remain live
  together. Do not insert spawned child threads as ordinary top-level tasks.
- Main-chat queued submissions use native queue IDs and cursor pagination.
  Dispatch through native queue/start; steering uses expectedTurnId then removes
  the queued submission. Preserve image and skill inputs when editing text.
- Reply branches pass the selected completed lastTurnId. Folder selection uses
  native fs/readDirectory, fs/createDirectory and project/create. Keep these
  controls compact and consistent with Desktop, with 44px touch targets.

## Publication and Privacy

- After completing and validating project changes, push the public repository
  by default unless the user explicitly asks not to. Never push the separate
  private deployment checkout or its runtime data.
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
