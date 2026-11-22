# Contributing

Thanks for helping. Read [docs/HANDOVER.md](docs/HANDOVER.md) first: it explains the design, how to test on a TV and the known pitfalls.

* Open an issue before a big change. Small fixes: open a pull request.
* Shard code: **ES5**, no `eval`, no `new Function`, no downloaded code, files in **LF**; keep `README.md` honest about network, data and limitations.
* Say which TV model, Tizen version and Vetro version you tested on. A fake-TV test is not proof of working on hardware.
* **No personal data** in commits, issues or release files (no IPs of your network, e-mails, local paths, serial numbers). Use the GitHub no-reply e-mail for commits.
* The project is MIT licensed; by contributing you agree your contribution is too.

## Every feature is an API feature

Anything the Notification Center (or any Shard here) can do must be possible from an external source and documented. A new field, mode or route goes into the code, the
Shard's self-description (`describe()` for the Notification Center) and `docs/API.md` / the Shard's own README together, and the panel is just one client of it.
Fields are only added, never renamed or removed, so existing senders keep working.
