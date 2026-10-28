# Session and Preview Acceptance

Date: 2026-10-28.

- Authentication uses a six-second lightweight status read, with automatic
  retry and an immediate reconnect control. Metadata loading does not block
  entry into the workspace. A reconnect during the first metadata wait still
  finishes task/model initialization.
- Synthetic Chromium checks at 402x874 DPR 3 covered a 3.5-second bootstrap,
  a nine-second stalled status response, two failed network requests, and
  a socket closing during initialization. The workspace appeared in about
  one second during slow metadata; stalled authentication recovered in about
  eight seconds. Late responses did not replace verified authentication.
  These are controlled local results, not public-network benchmarks.
- Automatic upward paging consumed all 100 synthetic turns without a load
  button. Failed foreground reads retried on the next upward touch gesture,
  with no idle request loop or model actions.
- Touch probes at 402x874, 390x844, 320x568, and 874x402 with 4x CPU throttling
  retained their anchors, with at most 0.25px measured drift and zero scripted
  scrolling or history insertion while a finger was down.
- A failed lazy preview module previously removed the entire conversation.
  The same blocked-module probe now retains chat and shows a reload control.
- HTML modules, relative resources, fetch and interaction passed at 402x874,
  320x568 and 874x402 DPR 3. HTML could not read its parent document.
  Expired HTML grants and stalled metadata reads showed errors, then recovered
  through Refresh. PDF canvas pixels, 200% zoom, image/Markdown switching,
  and release of hidden PDF renderers passed.
- Local image retention tests cover temporary-file deletion, process restart,
  concurrent captures, distinct paths, missing originals and current-file edits.
  Deleted originals with no retained copy cannot be recovered.
- User thumbnails passed 2560x1440, 1024x768, 390x844 and 320x568 browser
  layouts: 96px desktop and 84px mobile, above the text, without horizontal
  overflow. Clicking opens the original-image viewer. A synthetic image
  request failure recovered through the unavailable thumbnail's retry control.
- Deployed local and public checks at 402x874 DPR 3 used synthetic messages
  with real authenticated media endpoints. An image remained visible after
  deleting its original file; HTML modules/fetch, nonblank PDF canvas pixels,
  and Markdown rendering passed without page errors. Both health endpoints
  reported Desktop transport. Unauthenticated local-image access returned 401
  and successful image responses used no-store.
- Real native-history checks on both deployed entries followed the next native
  cursor, retained their visible reading anchor with 0.25px drift, and recorded
  zero model actions.

Physical iPhone Safari, real mobile networks and signed-in macOS integration
remain separate acceptance work. These checks do not establish that every
possible preview white-screen or compositor flash has been eliminated.
