---
name: verify
description: Build/launch/drive recipe for verifying changes to the workshop app in both offline and server modes.
---

# Verifying the workshop app

Two build modes; verify both when the change touches the service seams:

```bash
pnpm dev                      # offline (LocalDataService), port 3000 (falls back to 3001 if taken)
VITE_USE_SERVER=1 pnpm dev    # server mode (createServerFn + Prisma/SQLite)
```

Watch the log for the actual port (`grep "Local:" `) — port 3000 is often taken
by something that answers 404 on every route, which looks like a broken app.

## Surfaces

- Student app `/`, operator console `/admin` (dev token `sitcon-admin`; the
  gate also accepts `?admin_token=sitcon-admin` — fastest for automation).
- Raw uni channel: `curl -X POST :PORT/api/query -H 'Authorization: Bearer <token>' -d '{"w":0.5,"b":-1}'`.

## Driving the GUI (Playwright)

No repo-local browser deps. Install throwaway: `mkdir /tmp/pw && cd /tmp/pw &&
npm i playwright && npx playwright install chromium`.

**Gotcha: `page.fill()` does not trigger React 19's onChange on this app's
controlled inputs** — the click after it silently no-ops on empty state. Use
`locator.pressSequentially(text)` (real keystrokes), or for textareas the
native-setter trick (`Object.getOwnPropertyDescriptor(proto,'value').set` +
`dispatchEvent(new Event('input', {bubbles: true}))`).

Useful hooks: `page.on('dialog')` (gate rejections surface as window.alert),
`page.on('request')` filtered on `_serverFn` (decode the base64 path segment to
see which fn fired), P1 labels via keyboard `a`/`b` ×48.

## Server state control between scenarios

The dev DB is `prisma/dev.db`; reset workshop state directly:

```bash
sqlite3 prisma/dev.db "UPDATE AppState SET value='P1' WHERE key='phase';
UPDATE AppState SET value='' WHERE key='deadline';
UPDATE AppState SET value='0' WHERE key IN ('labels48','reveal100','unfog','slope_unlocked','playground_open');
DELETE FROM Dataset;"   -- Dataset delete reverts to the seed fallback
```

Clean up test students by nickname prefix (Submission/FogQuery first, then
Student). Reveal/phase changes reach student pages within one ~4 s poll —
`sleep 6` between an admin flip and the student-side assertion.

## Flows worth driving

join → code chip in header · admin bad-token bounce · labels48 flip → P1
reveal without reload · phase flip → soft push + out-of-phase submit alert ·
+5m arm → student timer · phase change clears deadline · unfog → P3 heatmap ·
Import (Chinese-header CSV paste) → balance report → Generate → bands ·
rejoin from a fresh browser context with nickname + code4.
