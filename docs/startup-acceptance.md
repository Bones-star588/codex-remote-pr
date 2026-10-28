# Startup Acceptance

Date: 2026-10-28.

## Changes

- Authentication status and bootstrap start concurrently. Either successful
  server response can end the login check. A bootstrap response cancels the
  remaining status request; cancellation still works if bootstrap fails first.
- Successful password login does not incur another status round trip.
  Unauthenticated and expired sessions return to sign-in. No browser storage
  value grants access.
- HTTP bootstrap populates the first task page, models and projects without
  waiting for socket synchronization. A stalled bootstrap triggers a separate
  authenticated task read 1.5 seconds after workspace mounting. Native cursors
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
- The full suite passes 183 tests across 38 files, including startup races,
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
