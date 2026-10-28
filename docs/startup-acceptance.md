# Startup Acceptance

Date: 2026-10-28.

## Current Scope

The current application implementation is public commit `2f2f02c`, verified by
Windows/macOS/Ubuntu CI run `40623756335`: 185 tests across 38 files, type
checking and production builds passed. Subsequent documentation-only commits do
not require replacing that deployed application build.

The parallel-startup comparison below was captured at `900e2a9`; the returning
device follow-up covers `2f2f02c`. Treat their timings and older suite counts as
dated observations. The deployed local and canonical public shell/service worker
were checked against the current build on 2026-10-28, with ready Desktop
transport. A manually set hint opened only an empty shell and was rejected by
the unauthenticated server; no socket or private task data was exposed.

To activate a waiting PWA update, open Remote online, close every Remote app
window and same-origin browser tab, then reopen. One successful verification in
the new version saves the device hint. First entry and unavailable storage still
use verified entry. Early shell readiness is not authenticated task/chat
readiness, and physical iPhone Safari / 5G/Wi-Fi remains unverified.

## Changes

- Authentication status and bootstrap start concurrently. Either successful
  server response can end the login check. A bootstrap response cancels the
  remaining status request; cancellation still works if bootstrap fails first.
- Successful password login does not incur another status round trip.
  Unauthenticated and expired sessions return to sign-in. No browser storage
  value grants access.
- HTTP bootstrap populates the first task page, models and projects without
  waiting for socket synchronization. A stalled bootstrap triggers a separate
  authenticated task read 1.5 seconds after verified startup enables loading. Native cursors
  continue over HTTP, including archived lists and all configured providers.
  Initial loading is shared across bootstrap, fallback and reconnect.
- Chat reads remain independent of the socket. Pooled task/history/permission
  reads have 15-second deadlines; model actions are never retried by this pool.
- The production shell preloads the Workspace module. An installed service
  worker returns its cached shell immediately and keeps the document and
  modules on the same version. Background installation uses normal worker
  updates; a waiting version activates after existing Remote windows close.
  API responses and private media stay outside static caches.
- Browser User Timing marks record the latest auth, bootstrap, task, chat and
  connection phase completions locally. They contain no message content and
  are not uploaded automatically.

## Controlled Comparison

Single samples from the previous production build and the new build, on the
same Windows host, at 402x874 CSS pixels and DPR 3. Status/bootstrap responses
were delayed by 700ms and socket synchronization by 2.5 seconds. Stalled cases
held one HTTP response for nine seconds.

| Scenario | Previous tasks visible | New tasks visible | Previous chat visible | New chat visible |
| --- | ---: | ---: | ---: | ---: |
| Delayed requests and socket | 3.73s | 1.39s | 4.12s | 1.74s |
| First status request stalled | 11.09s | 1.41s | 11.48s | 1.76s |
| Bootstrap stalled | 5.36s | 2.73s | 5.72s | 3.09s |

The new build displayed tasks and history before socket synchronization in
these probes. Sending still requires the real-time connection.

With a 1.5-second shell network delay, repeat navigation received the cached
document in 2.4ms instead of 719.6ms. This measures shell delivery, not
authenticated workspace readiness.

Supplemental Windows WebKit checks delayed synchronization by eight seconds.
Tasks appeared in approximately 1.4 seconds with a stalled status request, and
3.3 seconds with a stalled bootstrap. History displayed before synchronization.
Windows WebKit is not a physical iPhone or installed iOS application.

## Recovery and Privacy

- Chromium covered unauthenticated entry, both initial reads stalling, online
  recovery during an unfinished check, initial socket loss, three-page task
  loading, expired task authentication, password login and logout during paging.
  Logout aborted the in-flight page and did not request a subsequent page;
  archive changes also cancel pending downloads and background-yield waits.
- When both initial HTTP reads stalled, recovery still took about 7.6 seconds.
  Parallel startup does not remove an unavailable origin or a slow mobile route.
- Online recovery cancelled the stalled attempt and opened the workspace in
  under one second in the controlled probe.
- Three task pages were retained; a successful login sent one password POST
  without a second status read.
- Cache inspection found no authenticated API entries. All browser probes
  recorded zero model actions and zero page exceptions.
- At parallel-startup acceptance, the suite passed 183 tests across 38 files, including startup races,
  cancellation, HTTP deadlines and service-worker cache behavior. Production
  TypeScript/Vite compilation passes.

## Deployed Checks

- Local and public authenticated requests returned the same native task count.
  The live installation fit in one task page; independent synthetic checks
  verified three-page continuation.
- At 402x874 DPR 3 on the test computer, public cold entry displayed tasks in
  2.87 seconds and real native history in 3.74 seconds. Cached repeat entry
  displayed tasks in 0.86 seconds and history in 1.70 seconds. These are single
  host-network samples, not an iPhone 5G benchmark or percentile guarantee.
- The fresh public connection reached socket synchronization. On repeat entry,
  the test computer still produced Chromium's
  `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` under its virtual-DNS environment.
  Tasks and native history remained readable through HTTP. This environment
  issue is not established as the cause of the user's phone delays, and no
  proxy or DNS settings were changed.
- Task responses used no-store; unauthenticated access returned 401. The new
  shell preloaded Workspace, static cache inspection found zero API entries,
  and native-history checks sent zero model actions.
- Remote was restarted for the task endpoint. Codex Desktop and Tunnel remained
  running. The separate private deployment checkout was not published.

Physical iPhone Safari Add to Home Screen, real 5G/Wi-Fi tail latency and
signed-in macOS Desktop integration remain separate live acceptance.

## Returning Device Follow-Up

The previous release still waited for a verified HTTP response before mounting
Workspace. A successful verification now saves a boolean local device hint.
On repeat entry, the empty public workspace mounts immediately while the same
parallel status/bootstrap checks run. `useRemote` remains unauthenticated until
server confirmation, so no task reads or sockets start from this hint.

There is no credential, conversation or task cache in the hint. Expired sessions
and logout clear it and remove the workspace. Unavailable browser storage falls
back to verified entry. Network recovery preserves the mounted empty shell and
local drawer state; failed checks show a retry banner without a full-screen
replacement. The `remote:shell` mark distinguishes UI mounting from real
`remote:auth` and `remote:tasks` completion.

In a controlled Chromium probe at 402x874 CSS pixels / DPR 3, both authentication
responses were delayed by 2.5 seconds. First entry mounted Workspace at 2.97s;
returning entry mounted at 0.35s, with task data still arriving at about 2.8s.
This is a display improvement, not a reduction in network round-trip time.
Returning, expired, online-recovery and logout cases preserved the expected
state. No sockets or additional private reads started before verification;
no model actions or browser exceptions occurred. The unit suite passes
185 tests / 38 files, including unavailable browser storage and hint removal.
The same five cases passed in Windows WebKit: first entry mounted at 3.46s,
returning entry at 0.87s, with task data at about 2.95s. These browser probes do
not establish physical iPhone Safari or real mobile-network performance.
A separate Chromium check held both authentication reads beyond their
six-second deadlines: the empty shell retained a retry banner, and manual retry
recovered the authenticated task list without replacing the shell.
