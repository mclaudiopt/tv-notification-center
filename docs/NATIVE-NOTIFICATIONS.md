# Native notifications on a Samsung TV: what works and what does not

Measured on a Samsung Q70C (TQ55Q70CATXXC), Tizen 9.0, Vetro 0.5.0 with root, November 2026.

## Works
* The web **`Notification`** API in a web app that declares `http://tizen.org/privilege/notification`. The banner appears top-right with
  "OK" / "View history" and the notification is stored in the TV's history (`noti_list` in `/opt/dbspace/.notification.db`).
* Only **while the app is in the foreground**. A background web app is suspended (timers stop) and cannot post.
* Flow used here, fully on the TV: Shard queues the message -> Vetro `POST /apps/launch` opens the app -> the app reads the queue,
  posts, stays ~8 s (leaving earlier hides the banner), exits.
* The app can be a thin loader whose logic is served by the Shard, so the logic changes without reinstalling the app (useful because
  with Host PC IP = 127.0.0.1 a PC-based installer cannot reach the TV).

## Does not work
* `tizen.notification` / `StatusNotification`: not available on the TV profile.
* Posting from a Shard or a shell: no `notification_test` on the TV; `libnotification` uses its own sockets (file descriptors), and
  `dbus-monitor --system` shows no notification calls; writing to the notification database does not notify the UI.
* Unsigned script files ("the file is NOT signed") are refused; inline commands through Vetro's `exec` still run.

## Native pieces found (read-only, root)
* UI: `com.samsung.tv.notification-app` (.NET, single instance; privileges `notification`, `window.priority.set`).
* Service: `com.samsung.tv.notification-serviceapp`; `global-notif-service` (C, links `libnotification`).
* Libraries: `libnotification.so.0` (0.7.22), `libnotification-ex.so.1`, `libnotification-vd.so.1`.
* Already posting: `org.tizen.easysetup-daemon`, `com.samsung.tv.vd-sc-client-service`, YouTube (`com.samsung.tv.cobalt-yt`), `webappservice` (on behalf of web apps).
* More than 50 packages declare the `notification` privilege (Bluetooth, connection guide, ...).

## Solved: banner over the running app, no app switch (November 2026)
A web app can declare a background **web service** (`<tizen:service>` in `config.xml`, a `service.js` with `module.exports.onStart/onRequest`).
It runs headless in `/usr/bin/wrt-service-launcher` (title `wrt-service`) on **Node.js 18**, with `fetch`, `fs`, `os`, `http`, and a `tizen`/`webapis`
object that is **different from the one in the UI app**. Inside it:
* `webapis.postPlainNotification(title, message, seconds = 10)` posts the **native Samsung banner** (same one Bluetooth / SmartThings use), over
  whatever is running, with the notification privilege of the package. Measured on the Q70C: appears exactly like a system notification, the running app stays.
* `tizen.StatusNotification` / `tizen.UserNotification` are listed but are not constructors; `Notification` and `XMLHttpRequest` do not exist there.
* Vetro can start the service with `POST /apps/launch {"appId":"<package>.<service id>"}` (an already running service gets `onRequest`).
* The service could **not** reach Vetro on `127.0.0.1` (`EHOSTUNREACH`); it must use the TV's own LAN address (`os.networkInterfaces()`).
* Limits: plain title, message and duration only (no icon or colour on the native banner).

Used by the Shard's default `banner` mode; the full-screen card still needs the app on screen.
