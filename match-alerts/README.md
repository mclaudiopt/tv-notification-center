# Match alerts

Follows one football team and shows **goals, kick-off, half-time and full-time** as the native Samsung TV banner, on top of whatever is running, through the
[Notification Center](https://github.com/mclaudiopt/tv-notification-center) Shard (it must be installed, with its companion app). Everything runs on the TV.

## Providers (chosen in the panel)

| Provider | Key | Notes |
|---|---|---|
| **ESPN** (public scoreboard) | none | Default. Unofficial, can change without notice. Polls every 20 s while the team's match is live, every 2-3 minutes otherwise. Covers leagues and cups on one feed (tested with Liga Portugal and the Taca de Portugal). |
| **API-Football** | your own key (free plan: 100 requests/day) | **Experimental, not tested without a key.** Spends few requests: checks the team's next fixture, then polls about every 100 s only while the match is live. |

Other providers (GOAL API, TheSportsDB, football-data.org) are not implemented: add a provider by writing one `match(config, callback)` function in `index.js`.

## What it sends

For the chosen team: **goal** (banner 30 s by default, up to 60), **goal for the opponent**, **goal disallowed**, **kick-off**, **half-time**, **full time**
(10 s by default). Each type can be switched off in the panel. A match already in progress when the Shard starts only sets a baseline: no banner for the current score.
"Test" buttons send a sample goal or opponent goal.

## Network and permissions

- Permissions: none (no `exec`).
- Outgoing: HTTPS GET to `site.api.espn.com` (ESPN) or `v3.football.api-sports.io` (API-Football, with your key), and one local call, `POST /plugins/notification-center/api/notify` on `127.0.0.1:8099`.
- Stored in `ctx.config`: provider, team, options and, if you set one, the API-Football key (on the TV only; the panel never shows it back).
- The match log and state are in memory only.

## Install

Install `match-alerts-0.1.1.vplugin` as a file in Vetro (Developer mode), switch it on, open the **Match alerts** tab, pick the team and press "Test: goal".
Needs Notification Center 0.2.1 or newer (banner mode).
