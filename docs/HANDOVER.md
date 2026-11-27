# Handover: everything you need to take over this project

**Maintainers wanted.** The code is MIT. If you want to maintain it (or move it into the Vetro Shard catalog, Apps2Samsung, or your own
org), open an issue or ask the owner to add you as a collaborator or transfer the repository.

## What it is
A Vetro Shard that is the hub for the notifications of a Samsung TV, and a companion app that posts the native banner from a background web service and shows the
full-screen card. Measured on a Samsung Q70C (Tizen 9.0) with Vetro and root. See [NATIVE-NOTIFICATIONS.md](NATIVE-NOTIFICATIONS.md) for what works and what does not.

```
any device or Shard --POST notify--> Shard (rules, quiet hours, queue)
  banner   --> Vetro starts the app's background service --> webapis.postPlainNotification --> banner over the running app
  overlay  --> the Shard's own helper draws a bar over the picture
  full     --> Vetro opens the app --> full-screen card (logic served as nt.js)
```

## Layout
```
shard/   manifest.json, index.js and rules.js (ES5), nt.js, ui.html, emoji.json, overlay/ (helper source and build), wallpapers/, README.md, API.md, CHANGELOG.md
app/     config.xml, index.html, js/app.js (thin loader), service.js, icon.png
docs/    API.md, NATIVE-NOTIFICATIONS.md, BACKLOG.md, HANDOVER.md (this file)
```
The catalog (`andrearicci93/vetro-plugins`) has version 0.3.1; newer versions are published here.

## Build, test and package
* **Shard**: a folder of text files (at most 20 files and 512 KB, close to the limit today). It is developed in a clone of the catalog repository, which holds the
  tests (`node --test tests/notification-center*.test.cjs`), the check (`npm run check`) and the build (`node scripts/build.cjs`). A test keeps `GET api`, `API.md`,
  the CHANGELOG and the manifest in step. `shard/` and `app/` here are copies of that plugin folder.
* **App**: zip `config.xml`, `index.html`, `icon.png`, `service.js` and `js/app.js` as a `.wgt`, **sign** it with your own certificate (Apps2Samsung, TV-Store or Tizen Studio).

## Test on a TV (acceptance check)
1. Install the Shard (Vetro Shards -> Developer mode -> choose file -> switch on) and the `.wgt`.
2. `curl -X POST http://<TV-IP>:8099/plugins/notification-center/api/notify -H "Content-Type: application/json" -d '{"title":"T","message":"hello"}'`
3. Expect: a banner at the top right over whatever is running (on the LS43BM700 monitor use `bannerAsOverlay` and expect the bottom bar).
4. Try `"mode":"overlay"` and `"mode":"full"`, a `sound`, and read the answer: `status`, `reason`, `effective`. `GET .../api/status` shows the app and its service.

## Gotchas learned the hard way
* **Web apps are suspended in the background**: only the background web service can post a banner while another app runs.
* The service cannot reach Vetro over loopback on the TV tested, and Node differs between TVs (18 on the Q70C, 12 on the monitor).
* **Vetro safe mode**: if Vetro restarts within 60 s of starting, third-party Shards are suspended (HTTP 503 `Plugin not running`). Fix: set the TV's
  Host PC IP to `127.0.0.1`, `POST /plugins/resume`, restart Vetro. With that IP, a PC-based installer cannot reach the TV; install apps from the TV (TV-Store).
* The TV refuses **unsigned script files** ("the file is NOT signed"); inline commands via Vetro's `exec` still work.
* The Vetro dashboard frame has **no `allow-forms`**: use buttons, not `<form>`.
* Shard code must be **ES5** (older TVs run Node 4.4): no arrow functions, `let`/`const`, template literals, `async`. The catalog's build rejects `eval`.
* Windows: line endings must be **LF** in the Shard files, or the bundle hash differs from the one CI builds on Linux.
* The overlay helper runs as root: review any change to it carefully.

## Open work
See [BACKLOG.md](BACKLOG.md).
