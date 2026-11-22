# Cast

Sends **one notification to every TV on your network** (or to a group, or to one), through each TV's
[Notification Center](https://github.com/mclaudiopt/tv-notification-center). One hub TV keeps the list; the other TVs only need Notification Center.

## What it does

- **My TVs:** a list of TVs (name, address, optional group). Add them by hand or with **Find TVs**.
- **Find TVs:** one scan, only when you press the button, as Apps2Samsung does: SSDP plus a sweep of port 8001 on this TV's own /24; every Samsung
  Tizen TV or Smart Monitor answers `http://<ip>:8001/api/v2/` with its name and model. Each one is then checked for Notification Center (port 8099) and shown as
  "ready" or "no Notification Center yet". Takes about 10 s.
- **Cast:** title, message, level, mode (Samsung banner / full screen / both) and duration, sent to all TVs, a group or one TV. A TV that cannot be reached
  (off, asleep) is retried after 10 s, 30 s and 60 s, then dropped.
- **Pair:** if Vetro pairing is on in a TV, press Pair, read the 6-digit code on that TV and type it; the key is stored on the hub only and never shown again.
- **Sender key (optional):** `POST .../senderkey {"key":"..."}`; then casting requires the header `X-Cast-Key`.

## API

`POST /plugins/cast/api/cast` with `{"title","message","level","mode","duration","icon"}` plus optional `"group":"living"` or `"tvIds":[...]`.
Answer: `{"results":[{"id","name","ok","error"}]}`. Other routes: `state`, `tv` (add, update, delete), `test`, `scan`, `pair`, `confirm`, `lang`, `senderkey`.

## A TV needs the app to show banners

A stock Samsung TV has no notification API to call from outside: it must run the Notification Center companion app (with its Shard). Finding a TV does not
install anything on it. Use Apps2Samsung or TV-Store for the app, and the Shard needs Vetro on that TV.

## Network and permissions

Permissions: none (no `exec`). The hub only talks to the TVs you list, on port 8099 (private addresses and local names only, never the internet), and,
when you press Find TVs, to this TV's own /24 on ports 8001 and 8099 and to UPnP multicast (239.255.255.250:1900). The list, groups and keys are stored in `ctx.config`
on the hub; the panel never shows a key back.

## Tested

Samsung Q70C (Tizen 9.0), Vetro 0.7.0, pairing off: Find TVs found three Samsung devices on the network; Cast delivered to this TV listed twice (loopback and LAN address).
**Not tested:** casting to a second TV with Notification Center, and the pairing flow (Pair / Confirm).
