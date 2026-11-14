# Handover: everything you need to take over this project

**Maintainers wanted.** The code is MIT. If you want to maintain it (or move it into the Vetro Shard catalog, Apps2Samsung, or your own
org), open an issue or ask the owner to add you as a collaborator or transfer the repository.

## What it is
A Vetro Shard that queues notifications sent over HTTP and a thin web app that shows them as native Samsung TV banners.
Measured on a Samsung Q70C, Tizen 9.0, Vetro 0.5.0 with root. See [NATIVE-NOTIFICATIONS.md](NATIVE-NOTIFICATIONS.md) for what works and what does not.

```
any device --POST notify--> Shard (queue) --POST 127.0.0.1:8099/apps/launch--> Vetro launches the web app
web app --GET notifications--> Shard   (XHR, or <script> when cross-origin XHR is blocked)
web app --new Notification(title,{body})--> TV banner + TV notification history; the app stays ~8 s, then exits
```

## Layout
```
shard/   manifest.json, index.js (ES5), nt.js (logic served to the app), ui.html (dashboard tab, buttons only), README.md
app/     config.xml, index.html, js/app.js (thin loader), icon.png
docs/    NATIVE-NOTIFICATIONS.md (findings), HANDOVER.md (this file)
```
The Shard is also proposed to the catalog: https://github.com/andrearicci93/vetro-plugins/pull/20

## Build and package
* **Shard**: it is a folder of text files (max 20 files, 512 KB). Use the catalog's tools (`node scripts/build.cjs` in
  `andrearicci93/vetro-plugins`) or Vetro's `app/scripts/vetro-plugin.cjs check|pack <folder>`.
* **App**: zip `config.xml`, `index.html`, `icon.png`, `js/app.js` as a `.wgt`, **sign** it with your own certificate (Apps2Samsung, TV-Store or Tizen Studio).

## Test on a TV (acceptance check)
1. Install the Shard (Vetro Shards -> Developer mode -> choose file -> switch on) and the `.wgt`.
2. `curl -X POST http://<TV-IP>:8099/plugins/notification-center/api/notify -H "Content-Type: application/json" -d '{"title":"T","message":"hello"}'`
3. Expect: the app opens, a banner appears top-right (OK / View history), the app exits after ~8 s, and the entry is in the TV's notification history.
4. Routes to check: `GET .../api/ui`, `.../api/nt.js`, `.../api/notifications` (also with `?js=1`), `.../api/recent`, `.../api/config`.

## Gotchas learned the hard way
* **Web apps are suspended in the background**: the web `Notification` API only works with the app in the foreground. Leaving before ~8 s hides the banner.
* `tizen.notification` does not exist on the TV profile. Only the web `Notification` API works.
* **Vetro safe mode**: if Vetro restarts within 60 s of starting, third-party Shards are suspended (HTTP 503 `Plugin not running`). Fix: set the TV's
  Host PC IP to `127.0.0.1`, `POST /plugins/resume`, restart Vetro. With that IP, a PC-based installer cannot reach the TV; install apps from the TV (TV-Store).
* The TV refuses **unsigned script files** ("the file is NOT signed"); inline commands via Vetro's `exec` still work.
* The Vetro dashboard frame has **no `allow-forms`**: use buttons, not `<form>`.
* Shard code must be **ES5** (older TVs run Node 4.4): no arrow functions, `let`/`const`, template literals, `async`. The catalog's build rejects `eval`.
* Windows: line endings must be **LF** in the Shard files, or the bundle hash differs from the one CI builds on Linux.
* `POST /apps/launch` is throttled by the Shard to one launch every 10 s.

## Decisions and why
* Web `Notification` through a launched app, because nothing else can post from a Shard or a shell (see findings: sockets, no D-Bus, no `notification_test`).
* Thin app + logic served by the Shard, so the logic can change without reinstalling the app on the TV.
* No `exec` permission: the Shard only talks to Vetro on `127.0.0.1:8099`.
* Native history instead of our own: the TV already keeps notifications posted this way.

## Open work (see the issues)
1. A background `service-application` (native/.NET) with the `notification` privilege, to show the banner without launching an app. Needs Tizen Studio or the .NET SDK. **Highest value.**
2. Check the return to the previous screen over live TV, HDMI and other apps.
3. A sender key for `POST notify` (today anyone who can reach Vetro can send).
4. Profiles per source (icon, sound) and an optional custom full-screen card.
5. Distribution without a PC (TV-Store / Apps2Samsung repository).
6. Measure the minimum time the app must stay open, and reduce the flicker.
7. CI for this repository.
