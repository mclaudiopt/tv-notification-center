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

### On a monitor the native banner does not appear (Samsung LS43BM700, November 2026)
* The background service there runs on **Node.js 12.16.3**: no `fetch`, and it cannot read the queue file the Shard writes in `/tmp` (`EACCES`). Companion app 0.2.5
  asks the Shard over the network with Node's `http` instead.
* With that fixed, `webapis.postPlainNotification` is called and returns no error, but **nothing appears on the screen**. The cause is not known.
* Work-around: the Shard setting `bannerAsOverlay` shows every banner as the bottom bar (seen on that screen). `GET status`, field `serviceDiag`, shows what the service reported.

## Looked at: the sleep-timer banner (not reusable, November 2026)
The big, transparent banner in the middle of the picture ("the TV will turn off in 1 minute") would have been a nice second native style. It was investigated with read-only commands on the Q70C (Tizen 9.0) and **cannot be reused for our own text**:
* **Who draws it:** the `org.tizen.tv-viewer` app (the one that shows the picture). Its binary contains `SleepTimerPopup`, `SLEEP_TIMER_REMAINING` and `tvtimer.so`. It is an internal popup of that app, not a system service that accepts a message.
* **What was measured:** with a 30 minute sleep timer running, the keys of `tv-viewer` changed at the moment the banner appeared and changed back exactly one minute later: `memory/tv-viewer/banner_show` 0 -> 1, `memory/tv-viewer/visible_banners` `""` -> `commonpopup`, `memory/tv-viewer/tv_viewer_banner_state_16` 0 -> 1, and the `tv-viewer` app went from state 4 to 3 (foreground). One minute later the banner went away and the TV switched off (`memory/menu/system/time/sleeptimer/savetime` 1 -> 0).
* **No way in:** those keys are state (what `tv-viewer` is showing), not commands. `commonpopup` appears in `tv-viewer` only as that value; `libtv-viewer-api.so.0` exports almost nothing and `libtv-viewer-kevent.so.0` only handles key events. The text of the warning comes from the timer logic inside the app.
* **The timer service is something else:** the D-Bus name `org.tizen.tv.system.tvtimer` (process `common-daemon-basic-monitor`) schedules the on/off timers (`schedule_timer`, `cancel_timer`, `request_timer_list`, ...). It does not draw the banner.
* **Not tried, on purpose:** writing those keys. They are output state of a protected, preloaded system app; writing them would not give us text and could leave the app in a wrong state. The sleep-timer key (`savetime`) is what switches the TV off, so it is never touched.
* **What we use instead:** the native banner from the web service (`webapis.postPlainNotification`, top-right, above the running app) and, when a big centred card is wanted, the full-screen card of the companion app (which opens the app).

### Follow-up: the system popup `org.tizen.alert-syspopup` does not take free text
It looked like a way to show our own text in a centred box above any app, so it was tried (Q70C, Tizen 9.0, read-only first, then a launch test):
* **What it is:** a preloaded system app (`nodisplay`, no icon) that draws message boxes with the Flux UI (`elm_flux_popup_title_set`, `elm_flux_popup_message_set`) in a window with notification level (`efl_util_set_notification_window_level`), so it does sit above other apps. It is started with `aul_test launch <app_id> <key> <value> ...` (the `app_launcher` of this TV cannot pass data).
* **Layouts:** `notitle_message_1button`, `notitle_message_2button`, `title_message_1button`, `title_message_2button`, and classes for the Samsung guides it is used for (`CCMMessage`, `CNudge`, `CMultiControlGuide`, `CEManualGuide`, `CPannelLock`, `CRegulation`, `CUpdateConfirm`, `CPinCode`).
* **Why our text does not show:** the texts come from Samsung string identifiers (`TV_SID_...`, `SID_YES`, `COM_TV_SID_SET_UP_SMART_HUB`) chosen by a `type` field with fixed names (for example `SMARTHUB_SETUP`); the layouts are only templates. Nine launch variants (popup type in `popup_type` or `content`, text in `message` or `content`, with and without title and button texts, one and two buttons, no data at all) started the app, which ended at once without drawing anything, so nothing from the request reaches the screen.
* **Not tried, on purpose:** launching it with a real `type` such as `SMARTHUB_SETUP`: that would show a Smart Hub setup prompt whose button starts the TV's setup wizard.
* **Observation limits:** this TV is a production build with the debug log off (`dlogutil` reports `plog(0)`), and the system D-Bus showed no message about the sleep-timer banner, so its trigger could not be observed from outside.

