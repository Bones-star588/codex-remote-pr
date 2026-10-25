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
  derive turn duration from item timestamps or the browser connection time.
  Refresh only the active time label once per second. Keep user/assistant gaps
  larger than prose spacing without loosening command rows.
- Consecutive desktop activity headers use a compact 30px pitch; touch targets
  remain at least 44px. Command/output text uses the native ui-monospace stack,
  12px/18px, weight 400.
- Use the desktop's owning App Server for immediate synchronization.
- Task list requests include all providers with `modelProviders: []` and
  `useStateDbOnly: true`. Follow native cursors; never assume one page is complete.
- Keep history bounded and preserve reading position when prepending older pages.
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
