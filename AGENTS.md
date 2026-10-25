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
  separate mobile layout. Fold consecutive operations by type into native-style
  command/edit rows; keep commentary in the conversation and user messages simple.
  Conversation text follows native 14px/22.75px, weight 430; activity headers use
  14px/21px, weight 430. Keep the system font stack and lazy detail bodies.
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

## Publication and Privacy

- Never commit `.env`, `data/`, tokens, private keys, session cookies, logs,
  real chat exports, local machine identifiers, or private screenshots.
- Keep documentation examples generic. Use synthetic data for screenshots.
- Preserve upstream copyright and notices.
- README.md and README.zh-CN.md must describe the same behavior and limitations.
- Model/project metadata currently reads its first requested page; model defaults
  can differ from global configuration overrides. Do not imply otherwise.
- Command records are not an interactive terminal. Some approval forms and
  actual dictation still need dedicated live acceptance.
- Windows has live desktop acceptance. macOS has CI coverage for builds, unit
  tests, shell syntax, and generated LaunchAgents; signed-in desktop integration,
  login persistence, and the legacy tunnel still need live macOS acceptance.
