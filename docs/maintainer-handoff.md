# Maintainer Handoff

Last reconciled: 2026-10-29.

## Authority

Read [AGENTS.md](../AGENTS.md) before implementation and
[CONTRIBUTING.md](../CONTRIBUTING.md) before publication.
The package and lockfile define the source version. A deployment's own acceptance
record must identify its actual source revision, assets, processes and live checks;
a merge or successful CI alone does not establish deployment.
The README languages describe supported behavior. Dated acceptance records retain
their original scope and do not establish current physical-device performance.

This closeout corrects notification privacy and history timeout documentation.
It adds no connection, history or UI behavior and keeps application version 0.1.4.
The previous functional batch merged PR #2: native asynchronous question forms,
lazy execution details and 15-second chat/timing downloads.
See [the investigation](history-questions-investigation.md) for that review's scope.

## Next Work

At this checkpoint, [PR #3](https://github.com/CoralFlower325/Codex-remote/pull/3),
`feat: add manual app updates and refine mobile controls`, is open.
Its latest observed head is `ccb92f746091e44cd6d53dac110e02bf9473e72a` and CI run
`40840478793` passed on Windows, macOS and Ubuntu.
It has not been reviewed, merged or deployed by this closeout.
Refresh its state before continuing; passing CI does not replace review.

Review mobile control sizes, swipe direction/thresholds, focus and keyboard
behavior, and conflicts with conversation scrolling or panel resizing.
Keep main and side-chat controls consistent. Use synthetic browser fixtures;
do not create real model turns or notifications just to verify layout.
Review the newly added manual app-update workflow for authentication, scope,
concurrent requests, private-data preservation, failure recovery and platform
behavior before enabling it on a running installation.

Outstanding acceptance:

- Physical iPhone Safari and Home Screen use on separate Wi-Fi and 5G:
  authentication, first task/chat loading, long-history upward paging without
  flashing, foreground recovery and actual notification display.
- Signed-in macOS Desktop integration, login persistence and tunnel operation.
- Actual native asynchronous answers and mobile keyboard behavior. Forms cover
  the latest loaded main-chat turn; temporary side chats and questions beyond
  the loaded window are not claimed complete.
- Some approval forms, actual dictation and a fresh active subagent lifecycle.
- Sustained connection stability under real network/proxy changes. Earlier
  intermittent public failures are not proven eliminated by short live probes.

Model/project catalogs currently read their first requested page. New-chat
reasoning defaults can differ from global configuration overrides. Remote PTYs
run as the host user outside model permission profiles.

## Release and Recovery

1. Inspect branch, status, worktrees, pending PRs and the deployment's current
   acceptance record. Preserve unrelated edits and machine-specific settings.
2. Develop in the public source checkout. Compare reviewed changes against the
   running installation before copying; never reset a private deployment to an
   old Git base or publish its local data.
3. Increment the patch once per completed functional change batch unless explicitly
   directed otherwise. Neat closeout, handoff and documentation-only updates do
   not increment it. Align package, lockfile, visible version, local build and edge.
4. Run appropriate checks. Application changes require typecheck, tests and build.
   Documentation-only changes need link/privacy checks; they do not require a
   release build or service restart. Record which functional tests were not repeated.
5. Back up the affected installation files and build. Preserve configuration,
   authentication, notification keys/subscriptions and retained attachments.
6. Publish only the reviewed public files, verify remote revision and CI, and
   install matching built assets. Upload assets before switching the shell.
   Keep older chunks for existing clients.
7. For configured static-edge installations, use the existing authenticated
   `cf` workflow in the README. Private API, socket and health routes stay on
   the origin. Restarting the origin does not update edge assets.
8. Restart Remote after every application update, including frontend updates.
   Verify that its old listener and process exited before starting it once.
   Leave Desktop running; restart the tunnel only when needed.
9. Verify local and canonical public health, Desktop transport, shell/worker/asset
   agreement and authenticated read-only history. Verify anonymous private reads
   are rejected. Do not print cookies or conversation contents.
10. Update the single current deployment record with exact evidence and limits.
    Installed PWAs require every Remote window to close before a waiting update
    activates; version-check the reopened application.

If deployment fails, restore only that batch's backed-up files and matching
assets, restart Remote and verify both origins again. Preserve runtime data and
do not roll back native conversation state. Check the actual active edge version
before claiming that rollback is complete.

## Evidence and Cleanup

Ignored QA artifacts, deployment backups and review branches can contain unique
or private evidence. Inventory them before proposing cleanup, distinguish
reproducible builds from unique diagnostics, and retain old deployed chunks for
open clients. Complete the report before requesting explicit cleanup approval.
Never upload ignored runtime evidence or use screenshots containing real chats
in public documentation.
