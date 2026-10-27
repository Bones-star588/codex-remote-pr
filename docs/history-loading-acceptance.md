# History Loading and Side-Chat Acceptance

Date: 2026-10-27.

## Behavior

- Keep one speculative older page in memory and share the request with
  foreground consumption. Prepare native timing metadata before insertion.
- Prefetch within two viewport heights; insert near the top on upward intent.
  Short initial pages do not automatically consume the full history.
- Cancel abandoned downloads on selection, jumps and close. Speculative
  failures remain silent; foreground retries remain available.
- Retain visible message nodes, activity identities and disclosure state across
  partial-turn boundaries. Current turn timings override older page metadata.
- Preserve the current visible reading anchor before paint, during pending
  requests and after delayed layout changes. Reserve image-thumbnail geometry.
  Short pages retain the space needed for scroll compensation until navigation
  or returning to latest.
- Model, permission and slash portals render above mobile and expanded
  inspectors. Native dialogs consume their own shortcuts without closing the
  inspector. Initial queued skills and model selections survive side-chat
  mounting and asynchronous thread creation.

## Verification

- 158 tests across 33 files pass; TypeScript and production build pass.
- Synthetic history acceptance covers 2560x1440, 1024x768, 402x874 at DPR 3,
  390x844, 320x568 and touch landscape 874x402.
- Warm and cold paging, scrolling during a pending read, delayed images,
  expanded command output, abandoned requests and silent speculative failures
  were exercised. Measured anchor drift was at most 0.25 CSS pixels.
- One older page is fetched once and not inserted prematurely. Expanded command
  and activity disclosures retain their DOM and open state.
- Child-view regression covers streaming, completion, archived paging,
  hide/reopen, reconnect, composed subscriptions and safe viewer close.
- Side-chat acceptance covers five desktop/mobile sizes, including expanded
  desktop inspectors. Two synthetic models expose different native reasoning
  options. Captured RPCs confirm the selected model, effort and collaboration
  settings, including selection during pending thread creation.
- Drafts and main-chat independence, mobile keyboard focus, permission menus,
  dialog Escape, and moving queued skills into a side chat pass browser checks.
  Model actions in these tests use only the synthetic server.
- Final deployed local/public browser checks read actual Windows native history
  at 402x874 DPR 3. Both retained the visible anchor with 0.25px drift.
  The side-chat model menu displayed the host's four native models; the chosen
  model exposed three supported effort levels. Both health checks returned 200
  with Desktop transport. No real model instructions were sent.

## Limits

Browser touch and DPR emulation do not establish physical iPhone Safari
behavior, browser chrome or mobile-network performance. Signed-in macOS
integration remains separate. This work does not claim to eliminate all
rendering stalls on every device or connection.
