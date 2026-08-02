# CQR Report UI V2 — Preview R2

High-fidelity UI preview for the CQR Report redesign. This package is intentionally isolated from Production and does not overwrite `copilot.html`.

## Open the preview

```bash
cd /path/to/cqr-ui-v2-preview-r2
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080/copilot-v2.html
```

## What changed in R2

- Removed the Electric Blue card style.
- Reworked hover, pressed, and active states around soft neumorphic surfaces and black segmented active pills.
- Replaced Google Fonts with an Apple-style native system font stack that supports Thai fallbacks.
- Removed Theme and Notification controls from every page.
- Added a working Export menu: CSV, TXT summary, and Print / Save PDF.
- Restored Monthly / Weekly filters and a Week selector; changing the filter updates Dashboard numbers and the retention chart.
- Restored old Dashboard information patterns: KPI, Performance Overview, Executive Insight, Retention Curve, Channel Mix, Channel Performance, and Game × Channel Detail.
- Rebuilt AI Insight with a Warm orange surface and retained Context, Suggested Questions, Export Chat, Clear Chat, and full-size chat.
- Replaced the three separate bottom sidebar links with a profile card + `...` popover.
- Expanded User Access, Data Health, Check Raw, Pipeline Check, and all four Data Control pages.
- Added interactive preview simulations for Raw Check queue/polling, Health Check, Pipeline Check, Preview, Clear confirmation, and Build progress.

## Important

This is still a UI preview. Buttons simulate behavior using local state. Production integration must map the UI to the existing Apps Script actions and session/permission responses before replacing the live `copilot.html`.
