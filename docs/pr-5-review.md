# PR #5 Integration Review

Contributor head: `8076bc5725575b82fd6e1eda92bb583d4cfba395`.
Baseline: `6a55018183591ad44c55db7d9dcf46dd33675266`, deployed as 0.1.6.
Integrated functional batch: 0.1.7.

## Decisions

Accepted the phone conversation-index sheet's composer-radius corners, 14px
close glyph inside a 44px target, and opening focus on the dialog rather than
the close button. Escape, backdrop/explicit dismissal, keyboard focus on controls,
selected-row scrolling, native turn/item navigation and trigger focus return
are retained. Phone composer triggers blend into their owning composer, with
a darker keyboard-focus glyph instead of the opening/restored-focus outline.

Accepted the independent 12px HTML spinner layer, keeping the original SVG
artwork and 0.9s linear animation. The existing reduced-motion rule applies.
This is a compatibility mitigation, not a confirmed fix for physical iOS
Home Screen animation stalls. The contributor's investigation retains that limit.

Corrected two integration issues:

- Unscoped trigger focus/background rules also changed a 1024x768 coarse-pointer
  desktop layout. Moved them into mobile-layout.css under the explicit mobile
  selector. Desktop trigger backgrounds and keyboard outlines remain unchanged.
- The two contributor commits proposed 0.1.7 then 0.1.8 before integration.
  This is one public functional batch after 0.1.6, so package and lockfile use
  0.1.7. Contributor-local deployments do not establish a public release.

Main/side mobile composer controls remain 36px. Desktop attachment dimensions,
goal/queued-message corners, native history/timing, transport, question forms,
lazy detail reads, update lifecycle and notification previews retain their
preceding production implementation.

## Validation

Acceptance uses the real built client with synthetic conversations and compares
against installed 0.1.6. It covers desktop and phone layouts, including touch
desktop, phone portrait/landscape and 320px widths. Trigger state comparisons
explicitly check that coarse-pointer desktop retains its background and keyboard
outline. Physical iOS rendering, keyboard/momentum and separate Wi-Fi/5G remain
separate acceptance; synthetic browser checks do not establish them.

Completed maintainer validation:

- TypeScript checking and production build pass.
- All 415 tests across 64 files pass. The first run had one HTTP fixture failure
  because its random listening port was rejected by Node fetch as a bad port;
  the complete rerun passes without source or test changes. This remains a
  test-fixture flake, not evidence of a production endpoint failure.
- Chromium and Windows WebKit each pass ten baseline/current combinations:
  mouse desktop at 2560x1440, 1920x1080, 1440x900, 1024x768 and 874x402;
  touch desktop at 1024x768; touch phone at 402x874, 874x402, 390x844 and 320x568.
- Phone attachments remain 36x36 and desktop attachments remain 28x28.
  Phone dialog corners/glyph are 22px/14px, desktop remains 8px/18px, and
  all dialog close targets remain 44x44.
- Dialog focus, Tab-visible control focus, Escape/backdrop/explicit dismissal,
  focus restoration, selected-row scrolling and native turn/item jumps pass.
- The 12x12 spinner advances at 0.9s linear around 6px/6px. Five synthetic
  name events preserve the node and animation identity; reduced motion works.
- Completed browser runs have no page exceptions, failed HTTP responses,
  horizontal overflow or real model actions.

Ignored evidence is retained in output/pr-5-acceptance-chromium.json,
output/pr-5-acceptance-webkit.json and output/playwright/pr-5-*.png.
