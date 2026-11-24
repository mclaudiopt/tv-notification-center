# Notification Center for Samsung TV (Vetro Shard + web app)

Any device on your LAN (PC, phone, script) sends a message over HTTP; your Samsung TV shows it as a **native Samsung banner**
(top-right, with "OK" / "View history", kept in the TV's own notification history) **on top of whatever is running, without opening or
leaving any app**. Optionally also (or only) as a full-screen card. Everything runs on the TV, no PC is needed at runtime.

* **Shard** (`shard/`): a [Vetro](https://github.com/andrearicci93/vetro) Shard that queues the messages and asks Vetro to launch the companion app. `exec` for two fixed commands only: playing a system sound, and showing the **overlay bar** (a bar near the bottom of the screen, drawn over the running picture by a small native helper, with rounded corners, an optional icon and adjustable transparency).
* **API** ([docs/API.md](docs/API.md), also `GET /plugins/notification-center/api/api` on the TV): everything the Notification Center shows can be sent from any source: another Shard, a PC, Home Assistant, a script or any ntfy client.
* **Companion app** (`app/`): a `.wgt` with a background **service** (posts the native banner with Samsung's `webapis.postPlainNotification`, no app switch) and a thin screen app (full-screen card, logic served by the Shard as `nt.js`).
* **Related projects** (separate repositories that use this one through its [API](docs/API.md)): [Match alerts](https://github.com/mclaudiopt/tv-match-alerts) (football goal banners) and [Cast](https://github.com/mclaudiopt/tv-cast) (one notification to every TV on the network).
* Catalog pull request (draft): https://github.com/andrearicci93/vetro-plugins/pull/20

> **Status: early.** Tested on one TV (Samsung Q70C, Tizen 9.0, Vetro 0.7.0), pairing off. How the background service works, and what did not:
> [docs/NATIVE-NOTIFICATIONS.md](docs/NATIVE-NOTIFICATIONS.md).

## Download

Ready-made files are in [`dist/`](dist/) (also attached to the [Releases](../../releases)): `notification-center-0.8.1.vplugin` (the Shard) and `NotificationCenter-0.2.2.wgt` (the app, **unsigned**:
sign and install it with your own certificate, e.g. with Apps2Samsung, TV-Store or Tizen Studio).

## Install

1. Vetro with root connected; if Vetro keeps restarting, set the TV's Host PC IP to `127.0.0.1` (otherwise it can end up in safe mode: "Resume plugins", then restart Vetro).
2. Vetro Shards -> enable **Developer mode** -> choose the `.vplugin` -> switch the Shard on.
3. Install the `.wgt` on the TV (privileges `notification` and `internet`; it contains the app and its background service `NotifCtr01.Svc`).
   **The full-screen card (`full`, `both`) needs your TV's address in the app.** The screen app loads its script from the Shard, and the TV's web view cannot reach `127.0.0.1:8099`; it can reach the TV's own address on your network. The `.wgt` in `dist/` only has `127.0.0.1`, so for the full-screen card you must build your own `.wgt`: in `app/js/app.js` put `"http://<TV-IP>:8099"` in `BASES` (after `127.0.0.1`), and add `<access origin="http://<TV-IP>:8099" subdomains="false"/>` to `app/config.xml`, then sign and install it. The banner, the overlay bar and everything else work without this. (A later app version will find the address by itself.)
4. Send a notification:

```
curl -X POST http://<TV-IP>:8099/plugins/notification-center/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title":"Oven","message":"Dinner is ready","seconds":30}'
```

The Shard's page (tab **Notifications** in the Vetro dashboard) has a form for it. Full details, the API and the limitations are in
[shard/README.md](shard/README.md).

## Repository layout

```
shard/   Vetro Shard source (ES5): manifest.json, index.js, nt.js, ui.html, README.md
app/     companion web app source: config.xml, index.html, js/app.js, icon.png
docs/    what works, what does not, and why (measured on a real TV)
```

## Help wanted

To show the banner over the running app without launching anything, the TV needs a background `service-application`
(native or .NET) with the `notification` privilege that calls `NotificationManager.Post`. I do not have Tizen Studio or the .NET SDK,
so it is not built. If you do, the Shard already exposes the queue the service would read
(`GET /plugins/notification-center/api/notifications`).

## Maintainers wanted

This project is looking for people (or the Vetro maintainers) to take it over or move it. Start with [docs/HANDOVER.md](docs/HANDOVER.md) (design, how to test, pitfalls, open work) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE).
