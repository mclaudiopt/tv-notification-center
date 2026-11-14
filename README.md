# Notification Center for Samsung TV (Vetro Shard + web app)

Any device on your LAN (PC, phone, script) sends a message over HTTP; your Samsung TV shows it as a **native banner**
(top-right, with "OK" / "View history", kept in the TV's own notification history). Everything runs on the TV, no PC is
needed at runtime.

* **Shard** (`shard/`): a [Vetro](https://github.com/andrearicci93/vetro) Shard that queues the messages and asks Vetro to launch the companion app. No `exec` permission.
* **Companion web app** (`app/`): a thin `.wgt` that loads its logic from the Shard (`nt.js`) and posts the banner with the web `Notification` API.
* Catalog pull request (draft): https://github.com/andrearicci93/vetro-plugins/pull/20

> **Status: early.** Tested on one TV (Samsung Q70C, Tizen 9.0, Vetro 0.5.0). The companion app has to come to the
> foreground for a few seconds to post; a banner on top of the running app *without* launching an app is not possible with
> this approach (see [docs/NATIVE-NOTIFICATIONS.md](docs/NATIVE-NOTIFICATIONS.md)).

## Download

[Releases](../../releases): `notification-center-0.1.0.vplugin` (the Shard) and `NotificationCenter-0.1.0.wgt` (the app, **unsigned**:
sign and install it with your own certificate, e.g. with Apps2Samsung, TV-Store or Tizen Studio).

## Install

1. Vetro with root connected; if Vetro keeps restarting, set the TV's Host PC IP to `127.0.0.1` (otherwise it can end up in safe mode: "Resume plugins", then restart Vetro).
2. Vetro Shards -> enable **Developer mode** -> choose the `.vplugin` -> switch the Shard on.
3. Install the `.wgt` on the TV (privileges `notification` and `internet`).
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

## License

MIT, see [LICENSE](LICENSE).
