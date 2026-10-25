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
- `scripts/`: Windows/macOS setup, services, tunnel, and Windows controls.

## Product Constraints

- Preserve the default light appearance, system typography, compact header, and
  separate mobile layout. Keep tool activity folded and user messages simple.
- Use the desktop's owning App Server for immediate synchronization.
- Task list requests include all providers with `modelProviders: []` and
  `useStateDbOnly: true`. Follow native cursors; never assume one page is complete.
- Keep history bounded and preserve reading position when prepending older pages.
- Do not resume a new unsent chat before its first persisted turn.
- Native `turn/steer` uses `expectedTurnId`.
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
- Windows has live acceptance; macOS scripts do not have equivalent coverage.
