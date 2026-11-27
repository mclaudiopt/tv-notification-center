# Notification Center for Samsung TV (Vetro Shard + web app)

The **hub for the notifications of a Samsung TV**: any device on your LAN (PC, phone, script) or any other [Vetro](https://github.com/andrearicci93/vetro) Shard
sends a message over HTTP, and the Notification Center decides how and when the TV shows it. By default it is an **animated glass bar** drawn over the running picture, without opening any app; it can also be the native Samsung banner, a large dark panel or a full-screen card. Up to two logos can be shown, one of them fading in and out. Everything runs on the TV, no PC is needed at runtime.

* **Shard** (`shard/`): queues the messages, applies the rules of each sender (defaults per category, who may choose the sound, the look or urgency, rate limit, key),
  quiet hours and grouping, and tells the sender what happened (`status`, `reason`, `effective`, `GET notify-status`). `exec` for two fixed commands only: playing a
  sound and showing the bar.
* **API** ([docs/API.md](docs/API.md), also `GET /plugins/notification-center/api/api` on the TV): everything can be sent from any source: another Shard, a PC,
  Home Assistant, a script or any ntfy client. **Writing a Shard?** Follow [Rules for other Shards](docs/API.md#rules-for-other-shards).
* **Companion app** (`app/`): a `.wgt` with a background **service** (posts the native banner with Samsung's `webapis.postPlainNotification`) and a thin screen app
  (full-screen card, logic served by the Shard as `nt.js`).
* **Related project** (separate repository using the API): [Match alerts](https://github.com/mclaudiopt/tv-match-alerts) (football goal banners, news and weather).
* The Vetro Shard catalog has an **older** version (0.3.1, [pull request 20](https://github.com/andrearicci93/vetro-plugins/pull/20)). The newest is here, in the releases.

> **Status: work in progress, with many to-dos (see below).** Version 0.30.4. The new looks were checked on a Samsung Q70C (Tizen 9). How the background service works: [docs/NATIVE-NOTIFICATIONS.md](docs/NATIVE-NOTIFICATIONS.md).

## To do

- The native Samsung banner does not appear on some screens (seen on an LS43BM700 monitor); the cause is unknown. Use the setting `bannerAsOverlay`.
- The glass bar, the panel and the highlighted logo were checked by eye on one TV only (Q70C, Tizen 9). Other models and Tizen 6.5 are untested.
- The panel takes no remote keys, so it has no buttons; a request with `action` is shown full screen. Its title is a single line.
- Logos must be PNG (up to 2 MB and 1024x1024, not interlaced, 8 bits).
- The old flat bar code is still in the helper although it is no longer used.
- The panel preview is only approximate, and the setting that shows every banner as the bar can confuse next to the "Samsung" look.
- Other Shards still have to adopt the new fields (EPG alerts, Cast).
- The package is close to the size limit of the Vetro installer.
- The companion app (0.2.5) is unchanged and unsigned.

## Download

Ready-made files are in [`dist/`](dist/) (also attached to the [Releases](../../releases)): `notification-center-0.30.4.vplugin` (the Shard) and
`NotificationCenter-0.2.5.wgt` (the app, **unsigned**: sign and install it with your own certificate, e.g. with Apps2Samsung, TV-Store or Tizen Studio).

## Install

1. Vetro with root connected; if Vetro keeps restarting, set the TV's Host PC IP to `127.0.0.1` (otherwise it can end up in safe mode: "Resume plugins", then restart Vetro).
2. Vetro Shards -> enable **Developer mode** -> choose the `.vplugin` -> switch the Shard on.
3. Install the `.wgt` on the TV (privileges `notification`, `internet` and `systeminfo`; it contains the app and its background service `NotifCtr01.Svc`).
   The full-screen card (`full`, `both`): the TV's web view cannot reach `127.0.0.1:8099`, so the app (0.2.3 or newer) asks the TV for its own address on your network when it starts (the Samsung network API, then the Tizen system information of the wired and the wireless network, privilege `systeminfo`) and loads its script from there, with `127.0.0.1` as the last try. For that its `config.xml` has `<access origin="*"/>`; the app only ever loads one script, from the address it found. Older apps (0.2.2 and before) only try `127.0.0.1`: for those you had to build your own `.wgt` with the TV's address in `app/js/app.js`. The banner and the overlay do not need the screen app.
4. Send a notification:

```
curl -X POST http://<TV-IP>:8099/plugins/notification-center/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title":"Oven","message":"Dinner is ready","level":"ok"}'
```

The Shard's page in the Vetro dashboard (tabs **Send**, **Try it**, **Senders and rules**, **Settings** and **System**, English or Portuguese) has a form for it. Full details, the API and the limitations are in
[shard/README.md](shard/README.md).

## Repository layout

```
shard/   Vetro Shard source (ES5): manifest.json, index.js, rules.js, nt.js, ui.html, emoji.json, overlay/, wallpapers/, README.md, API.md, CHANGELOG.md
app/     companion web app source: config.xml, index.html, js/app.js, service.js, icon.png
docs/    the API (copy of shard/API.md), what works on a TV and what does not, handover and backlog
dist/    the built Shard (.vplugin) and the unsigned app (.wgt)
```

## Maintainers wanted

This project is looking for people (or the Vetro maintainers) to take it over or move it. Start with [docs/HANDOVER.md](docs/HANDOVER.md) (design, how to test, pitfalls, open work) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE).
