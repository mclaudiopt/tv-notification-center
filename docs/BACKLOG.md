# Backlog

What is not done yet, with what was decided. Updated for Shard 0.8.1 / app 0.2.2.

## Next
0a. **The screen app finds the TV's address by itself.** Today `app/js/app.js` only tries `127.0.0.1:8099`, which the TV's web view cannot reach, so the full-screen card (`full`, `both`) works only with a local build that also lists the TV's LAN address (see the README, Install, step 3). A new `.wgt` (0.2.3) should read the TV's own IP (for example with `tizen.systeminfo`, ETHERNET/WIFI network) and add it to `BASES` at run time, with the matching `access origin` in `config.xml`. It needs a new signed `.wgt`.
0. **Overlay (done in 0.8.0):** `mode: overlay` draws a bar over the running picture without interrupting it (native helper, `shard/overlay/`). The icon of an installed app is chosen by id with the field `app` (0.8.1). Still to do: the catalog pull request for 0.8.0 once the sound pull request (#34) is merged; the helper runs as root, so it needs a careful review.
1. **Full-screen modes with Vetro pairing on** (`full`, `both`). The app screen is a web page, so it cannot read `/tmp`; today it asks the Shard over the network and fails with pairing on.
   Idea to try: the banner service (which can read the queue file) launches the app with the notification as app-control data (`launchAppControl`), so the app needs no request.
   It needs a new signed `.wgt` and tests on a real TV with pairing on. Start with a diagnosis: pairing on, send one `full`, look at what the loader shows.
2. **A catalog pull request for the Cast bridge** (0.7.0): `POST cast` / `GET cast` and the panel option "Send to all TVs". It forwards to the separate Cast Shard on the same TV, so the pull request should say that Cast is optional. Open it after the sound pull request (#34) is reviewed.
3. **Sound pull request** (0.6.1): open as pull request 34 on the catalog; waiting for its review. It asks for `exec` for one fixed command, so the README must keep the "Commands it runs" section and the tests that check the shape of every command.
4. **The sound in time with the banner:** today the sound starts a fixed delay after the request (`soundDelayMs`, tuned by ear), because the banner service cannot tell the Shard when the banner appears (it has no permission to write to `/tmp`). A new companion app (0.2.3) could report back over HTTP.

## Decided
- **Sounds for other Shards and apps** (for example the OpenCode project): there is no separate sound Shard any more. Send the sound with the notification:
  `POST /plugins/notification-center/api/notify` with `{"title":"Goal","message":"Sporting 1-0","level":"ok","source":"match-alerts","sound":"reward","volume":80}`.
  Sounds: `chime soft reward success alert rotation open poweron`. No `sound` = silence. The sound starts `soundDelayMs` after the request (default 3 s, tuned by ear in the panel tab "Testing", because the banner service cannot tell the Shard when the banner appears), at most one every 0.8 s,
  and never for a notification held back by quiet hours or grouped as a repeat. Give each sender its own `source`, and set its default sound in the panel tab "Sources and rules".
  A Shard on the same TV calls `http://127.0.0.1:8099` and needs no key, even with pairing on. Full description: `docs/API.md` and `GET /plugins/notification-center/api/api`.
- **Weather, news and match results do not belong in this Shard.** They live in the alerts Shard (github.com/mclaudiopt/tv-match-alerts), which sends banners here.
- **Tests and sounds**: every test lives in the panel tab "Testing".

## Done (for reference)
Cast in the panel: "Send to all TVs" (the Cast Shard sends **one notification to every TV of the network**, not a video), tests of the full-screen app (`nt.js`), the panel checked at phone width.
Sources with keys and rate limits, quiet hours, grouping of repeats, webhooks, sounds in the same Shard, the Testing tab, the review fixes of the catalog pull request (type-checked input, bounded downloads, atomic queue file), tests with a real Node 4.9.1.

## Housekeeping
- The first commits of the catalog pull request branch (in the fork) contain a `.claude/` folder with local paths. The tip is clean. Rewriting that history needs a force push; or squash on merge.
- Uninstall the Service Probe app from the TV and revoke the "claude-test" pairing in Vetro, if still there.
