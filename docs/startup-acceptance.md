# Startup Acceptance

Date: 2026-10-28.

## Current Scope

The connection-recovery follow-up below supersedes the prior retry behavior.
The data-loading follow-up supersedes the prior task/chat startup path.
The earlier returning-shell implementation was public commit `2f2f02c`, verified by
Windows/macOS/Ubuntu CI run `40623756335`: 185 tests across 38 files, type
checking and production builds passed. The data-loading follow-up changes both
backend and frontend and requires deploying matching artifacts.

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

The following sections retain their original startup checkpoints. Current
task/chat loading adds the data-loading follow-up at the end of this record.

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

## Task and Chat Data Follow-Up

Date: 2026-10-28. This release changes both server and client.

- First task pages contain 50 records; later pages use native cursors and 200
  records. A selected chat read pauses further background task pages.
- Bootstrap and HTTP fallback share the same native task request, even after
  the 1.5-second bootstrap wait ends. Refresh completed during response transit
  is reused instead of starting a duplicate.
- Chat text uses read-only metadata plus 40 items. Initial timing is a separate
  request; native resume no longer blocks rendering. Sending and queues remain
  disabled until current metadata, timing, resume and the socket are ready.
  Older history waits for the initial timing cursor.
- Host memory retains two task first pages and five recent chats/timings.
  Snapshots are fresh for two seconds and retained for five minutes; native
  events, actions and bridge loss invalidate them. Stale native cursors are not
  used for paging. All private endpoints remain authenticated and `no-store`.
- After verified authentication, IndexedDB supplies up to 1000 task summaries
  and three chats of 40 records, capped at 24 hours and 1 MiB. It excludes
  credentials, permissions, unfinished turns, reasoning, tool output, diffs,
  image bodies, ephemeral side chats and subagent chats. Logout/expiry clears
  the snapshot and prevents prior asynchronous saves from restoring it.
- Fresh native task rows replace provisional rows even at equal timestamps.
  Final reconciliation removes deleted cached tasks. Snapshot arrival preserves
  intervening live messages, reply identities and expanded process sections.

The local suite passes 206 tests across 42 files; type checking and production
build pass. Browser acceptance uses an isolated synthetic server, never a
second connection to the owning Desktop relay.

At 402x874 CSS pixels / DPR 3:

| Engine | Cold task first page | Cold chat text | Returning task list | Returning chat text |
| --- | --- | --- | --- | --- |
| Chromium | 895 ms | 523 ms | 1475 ms | 273 ms |
| Windows WebKit | 875 ms | 743 ms | 1484 ms | 741 ms |

Task times start at navigation; chat times start at selection. Returning auth
was delayed 1200 ms, bootstrap/task reads 3000 ms, and chat reads 2500 ms.
Local snapshots were not read before successful authentication. Delayed native
resume deliberately kept sending disabled: returning interaction readiness was
5267/5759 ms, distinct from readable text. These are controlled display timings,
not physical mobile network promises.

Both engines loaded all 257 synthetic tasks, preserved the same response DOM,
expanded fold and reading anchor (0 px shift) after unchanged background refresh.
Expiry/logout cleared real IndexedDB contents; no early private reads/sockets,
model actions or page exceptions occurred. Chromium also passed 320x568 and
2560x1440 layout/loading smoke checks with no document overflow.

Windows WebKit reported a visual viewport smaller than its configured screen
before input focus; it is not a physical iPhone compositor test. Physical
iPhone Safari/PWA, actual 5G/Wi-Fi and signed-in macOS remain pending.

## Connection Recovery Follow-Up

Date: 2026-10-28. Matching client and server deployment is required.

Confirmed failure paths:

- A failed initial task HTTP request did not schedule its own retry; an empty
  list could remain until the five-minute calibration refresh.
- Reconnect could join a stalled HTTP/native read. Native metadata/snapshot
  requests now expire after eight seconds; a retry creates a fresh read, and
  late old results cannot replace it.
- A socket could be OPEN without `sync.ready`. Transport and application
  handshakes now have independent six-second deadlines; pongs cannot satisfy
  application readiness. Visible retry starts at 250 ms and caps at five seconds.
- On Windows WebKit, aborting fetch with a TimeoutError rejects with AbortError.
  The HTTP helper now preserves its own timeout reason so task recovery does
  not mistake a deadline for deliberate cancellation.

The first task attempt has a four-second deadline. Failures retry independently
of WebSocket state at 0.5/1/2/4 seconds, capped at five seconds; later HTTP
attempts retain a 15-second deadline. Foreground/online recovery replaces an
initial read stalled for two seconds. Manual reconnect cancels pending
task/history reads, rebuilds the socket and preserves the workspace/draft.
No uncertain model action is replayed.

Production-build probes at 402x874 CSS pixels / DPR 3 used an isolated synthetic
server with all 257 ordinary tasks:

| Scenario | Chromium | Windows WebKit |
| --- | ---: | ---: |
| Hung first task request, automatic recovery | 5280 ms | 5280 ms |
| First task request returns 503 | 981 ms | 1092 ms |
| Online event replaces pending HTTP | 29 ms | 96 ms |
| Missing sync.ready triggers reconnect | 6684 ms | 6904 ms |
| Manual reconnect | 45 ms | 193 ms |
| Online event recovers socket | 23 ms | 111 ms |

These are controlled recovery times, not promises about physical iPhone
networks. Both engines retained drafts, loaded all tasks and recorded zero
model actions or page exceptions. Existing host-route samples still showed
roughly one second for public HTTP and tens of milliseconds locally; no
DNS/proxy changes were made.

The complete local suite passes 241 tests in 44 files, type checking and the
production build. Additional Chromium/WebKit acceptance covers notification
settings at 320, 402, 768 and 2560 CSS-pixel widths: no horizontal overflow,
44px action buttons, server registration before enabled state, server removal
before browser unsubscribe, denied-permission and iOS home-screen guidance.
Startup makes no notification API requests. Push/click tests cover existing
and new window routing without adding private payloads to static caches.
Physical iPhone/iPad delivery has not been verified.

Task bootstrap, native paging and unknown-thread status refresh all exclude
subagent/ephemeral sources. The 257 ordinary tasks, including normally unnamed
chats, remain available. Child viewer history/subscriptions are preserved;
the fix neither deletes nor archives children. Assistant prose hides internal
citation IDs while retaining user text, inline/fenced code and real links.

## HTTP Transport Follow-Up

Date: 2026-10-28. This release requires matching server and client deployment.

The preceding recovery work could still leave chat controls unavailable when a
browser blocked WebSocket. Main-chat transport now tries WebSocket for three
seconds, allows six seconds for synchronization, then falls back to authenticated
HTTP EventSource and one-shot POSTs. Both paths use the same native RPC handler,
watched threads and event replay journal. Successful HTTP use is remembered only
as a tab-session route preference. It never grants authentication.

HTTP connections and synchronization have separate 12-second deadlines. Events
are flushed immediately, uncompressed, with no-store/no-transform headers.
Peers are bound to the verified cookie session. POST receipt returns 202 before
native work finishes; native results arrive over the event stream. Operations
are never automatically retried, and a lost acknowledgement does not resubmit
a model request. Large image bodies retain the existing transport allowance;
heartbeats bypass the upload queue.

Heartbeat replies allow 12 seconds instead of five. Hidden pages pause probes;
foreground and pageshow start a fresh probe. Timers delayed by suspension do
not immediately report a stale heartbeat timeout. Background Web Push is
independent of the page connection; transient network/429/5xx delivery failures
retry twice after one/four seconds, keeping the tag and respecting unsubscribe.

The local suite passes 251 tests across 45 files, type checking and production
build. Tests cover transport fallback, hidden-page recovery, delayed heartbeat,
one-shot failed POSTs, actual SSE flushing, session/origin boundaries, large
image input, native-work concurrency, disconnect cleanup and push retry limits.

Public production acceptance at 402x874 CSS pixels / DPR 3 deliberately blocked
all main-chat WebSockets. No model prompt or mutating model action was sent.

| Scenario | Chromium | Windows WebKit |
| --- | ---: | ---: |
| Cold navigation to HTTP synchronization | 3355 ms | 3390 ms |
| Reload to HTTP synchronization | 1601 ms | 1633 ms |
| Cold chat selection to enabled controls | 4994 ms | 4582 ms |
| Reload chat selection to enabled controls | 4461 ms | 4570 ms |
| Three offline/online recoveries | 2699-2710 ms | 2154-2196 ms |

Both engines completed native resume, retained drafts, passed 25 seconds of
idle heartbeats and recorded zero page exceptions or channel errors before
the deliberate offline cycles. These are host-browser public-route samples,
not physical iPhone/5G timings. The longer chat-control timings remain visible
here; the fallback resolves availability, not every native-read delay.

The terminal still uses a separate WebSocket and has no HTTP fallback. Remote,
its native Desktop connection and the public origin must remain available for
notifications. Physical iPhone/iPad delivery, mobile suspension and real
5G/Wi-Fi reliability remain separate acceptance. No DNS/proxy settings changed.

## Lifecycle Adversarial Follow-Up

Date: 2026-10-28. The preceding short online/offline probes did not cover slow
handshakes combined with focus events, or failed initial conversation reads.
They did not establish that the reported frequent disconnects were resolved.

Three independent reviews covered transport lifecycle, client loading and the
server/native bridge. Confirmed defects:

- Focus/pageshow cut an unfinished connection after two seconds, including
  HTTP connections with a 12-second budget. Focus could also shorten HTTP
  synchronization to six seconds or repeatedly postpone a stuck handshake.
- Redundant online events destroyed healthy connections. Ordinary focus and
  initial synchronization could cancel valid pending task reads.
- Bootstrap could finish its task page before model/project metadata. Missing
  catalogs then waited for realtime synchronization, even if native results
  were already available.
- Initial chat/timing reads and existing-thread subscription rejoin had no
  bounded automatic recovery. Replay synchronization could skip an incomplete
  conversation, leaving a blank stream or disabled composer.

Ordinary focus/pageshow now preserves handshake deadlines, and redundant online
events probe rather than replace healthy channels. Hidden pages pause unfinished
handshakes; actual foreground return starts the current stage's full budget.
Only real offline/hidden transitions replace a stalled initial task request.

Missing catalogs use independent authenticated, no-store HTTP reads through the
existing native metadata reader. Initial chat/timing and catalog GETs have at
most three attempts, with 0.5/1-second waits; cancellation and permanent client
errors do not retry. Existing-thread subscription rejoin is the only retried
native RPC, with the same bounded attempts and selection/connection guards.
Prompts and model actions are never automatically repeated.

The prior production build failed all four primary fault-injection cases in
Chromium. The new production build passed these and five additional cases in
both Chromium and Windows WebKit at 402x874 CSS pixels / DPR 3:

| Scenario | Chromium | Windows WebKit |
| --- | --- | --- |
| HTTP open delayed 3.5s; focus/pageshow at 2.6s | One peer; no restart | One peer; no restart |
| HTTP sync delayed 11s; focus at 4s | Sync succeeded | Sync succeeded |
| Missing catalogs; first GETs fail; realtime stalled | Projects at 1.10s | Projects at 1.31s |
| First chat and timing GETs fail | Ready at 2.13s | Ready at 2.36s |
| Task read delayed 3.5s; focus at 2.5s | No cancellation | No cancellation |
| Catalog attempts exhausted; focus retries | Recovered, old error cleared | Recovered, old error cleared |
| Switch chats during retry | Abandoned reads stop | Abandoned reads stop |
| Short replay reconnect | Same message DOM; no new open | Same message DOM; no new open |
| First native subscription resume fails | Ready at 2.16s | Ready at 2.47s |

No model actions or page exceptions occurred. Local validation passed 262 tests
in 46 files, type checking and the production build. The synthetic origin
never connects to Desktop or private data. These results demonstrate recovery
under the injected conditions, not physical iPhone or mobile-network acceptance.
No DNS/proxy setting or unrelated UI behavior changed.
