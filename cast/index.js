'use strict';
// Cast: one notification to every TV on the network. The hub keeps a list of TVs (name, address, group, optional Vetro key) and forwards
// each message to the Notification Center Shard of every one of them. Plain ES5 (older TVs run Node 4.4).
// Outgoing: HTTP to the listed TVs on port 8099 only (private addresses), and, when you press "Find TVs", short TCP probes of this TV's own /24.
var fs = require('fs');
var path = require('path');
var http = require('http');
var net = require('net');
var dgram = require('dgram');
var os = require('os');

var PORT = 8099, NOTIFY = '/plugins/notification-center/api/notify', LANG = '/plugins/notification-center/api/lang';
var MAX_BODY = 8192, MAX_TVS = 20, MAX_LOG = 40, RETRY_MS = [10000, 30000, 60000];
var LEVELS = { info: 1, ok: 1, warn: 1, alert: 1 }, MODES = { banner: 1, full: 1, both: 1 };

module.exports = function (ctx) {
    var log = [], pending = [], scanning = false, seq = 0;

    function clean(s, max) { return String(s == null ? '' : s).replace(/[\x00-\x1f]/g, ' ').slice(0, max).trim(); }
    function sendJson(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
    function readBody(req, cb) {
        var s = '';
        req.on('data', function (d) { s += d; if (s.length > MAX_BODY) { req.destroy(); } });
        req.on('end', function () { cb(s); });
    }
    function addLog(kind, text) { log.unshift({ at: Date.now(), kind: kind, text: clean(text, 220) }); if (log.length > MAX_LOG) { log.pop(); } }
    function store() { return ctx.config.get() || {}; }
    function tvs() { var c = store(); return Array.isArray(c.tvs) ? c.tvs : []; }
    function lang() { return store().lang === 'pt' ? 'pt' : 'en'; }
    function save(c) { ctx.config.set(c); }

    // Private addresses and local names only: the hub never forwards to the internet.
    function allowedHost(h) {
        if (!/^[A-Za-z0-9.-]{1,64}$/.test(h)) { return false; }
        var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
        if (m) {
            var a = +m[1], b = +m[2];
            if (a > 255 || b > 255 || +m[3] > 255 || +m[4] > 255) { return false; }
            return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
        }
        return h.indexOf('.') < 0 || /\.(local|lan|home)$/i.test(h);
    }
    function publicTv(t) { return { id: t.id, name: t.name, host: t.host, group: t.group || '', paired: !!t.key }; }
    function findTv(id) { var l = tvs(), i; for (i = 0; i < l.length; i++) { if (l[i].id === id) { return l[i]; } } return null; }

    // One HTTP call to a TV; cb(err, parsedJson|null, statusCode).
    function call(tv, method, p, body, cb) {
        var done = false, data = body ? JSON.stringify(body) : '';
        function end(e, j, c) { if (!done) { done = true; cb(e, j, c); } }
        var headers = { 'Content-Type': 'application/json' };
        if (data) { headers['Content-Length'] = Buffer.byteLength(data); }
        if (tv.key) { headers.Authorization = 'Bearer ' + tv.key; }
        try {
            var rq = http.request({ host: tv.host, port: tv.port || PORT, path: p, method: method, headers: headers, timeout: 5000 }, function (r) {
                var s = '';
                r.setEncoding('utf8');
                r.on('data', function (d) { s += d; if (s.length > 100000) { r.destroy(); } });
                r.on('end', function () { var j = null; try { j = JSON.parse(s); } catch (e) { /* not json */ } end(null, j, r.statusCode); });
            });
            rq.on('error', function (e) { end(String(e && e.code || e && e.message || e)); });
            rq.on('timeout', function () { rq.destroy(); end('timeout'); });
            if (data) { rq.write(data); }
            rq.end();
        } catch (e) { end('request failed'); }
    }

    function send(tv, msg, cb) {
        call(tv, 'POST', NOTIFY, msg, function (err, j, code) {
            if (err) { return cb(err); }
            if (code === 401) { return cb('needs pairing (401)'); }
            if (code !== 200 || !j || !j.ok) { return cb('http ' + code + (j && j.error ? ': ' + j.error : '')); }
            cb(null);
        });
    }
    // Fan out to the chosen TVs; a TV that fails is retried a few times, then dropped.
    function fanOut(targets, msg, cb) {
        var results = [], left = targets.length;
        if (!left) { return cb(results); }
        targets.forEach(function (tv) {
            send(tv, msg, function (err) {
                var r = { id: tv.id, name: tv.name, ok: !err };
                if (err) { r.error = err; r.retry = true; queueRetry(tv, msg, 0); }
                addLog(err ? 'fail' : 'sent', tv.name + (err ? ': ' + err + ' (will retry)' : ': delivered'));
                results.push(r);
                left -= 1;
                if (!left) { cb(results); }
            });
        });
    }
    function queueRetry(tv, msg, n) {
        if (n >= RETRY_MS.length) { addLog('expired', tv.name + ': gave up'); return; }
        var t = setTimeout(function () {
            pending = pending.filter(function (x) { return x !== t; });
            var cur = findTv(tv.id);
            if (!cur) { return; }
            send(cur, msg, function (err) {
                if (!err) { addLog('sent', cur.name + ': delivered after retry'); } else { queueRetry(cur, msg, n + 1); }
            });
        }, RETRY_MS[n]);
        pending.push(t);
    }

    function normalise(b) {
        var m = { message: clean(b.message, 200), title: clean(b.title, 40), level: LEVELS[b.level] ? b.level : 'info', mode: MODES[b.mode] ? b.mode : 'banner' };
        if (b.icon) { m.icon = clean(b.icon, 8); }
        var d = parseInt(b.duration, 10);
        if (d >= 1) { m.duration = d > 60 ? 60 : d; }
        return m;
    }

    // Probe this TV's own /24 for Vetro on port 8099 (started by hand, one at a time).
    function localPrefix() {
        var ifs = os.networkInterfaces(), k, i;
        for (k in ifs) {
            if (!ifs.hasOwnProperty(k)) { continue; }
            for (i = 0; i < ifs[k].length; i++) {
                var a = ifs[k][i];
                if (a.family === 'IPv4' && !a.internal && /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(a.address)) { return { prefix: a.address.replace(/\.\d+$/, '.'), self: a.address }; }
            }
        }
        return null;
    }
    // Find Samsung TVs the way Apps2Samsung does: SSDP discovery plus a sweep of port 8001, where every Tizen TV answers /api/v2/ with its
    // name and model. Then check which of them already have the Notification Center (Vetro on port 8099).
    function ssdp(cb) {
        var seen = {}, sock;
        try { sock = dgram.createSocket('udp4'); } catch (e) { return cb(seen); }
        var msg = new Buffer('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n');
        sock.on('message', function (m, r) { seen[r.address] = true; });
        sock.on('error', function () { /* ignore */ });
        try { sock.send(msg, 0, msg.length, 1900, '239.255.255.250'); } catch (e) { /* ignore */ }
        setTimeout(function () { try { sock.close(); } catch (e) { /* ignore */ } cb(seen); }, 2500);
    }
    function scan(cb) {
        var lp = localPrefix();
        if (!lp) { return cb('no local network found'); }
        var cands = {}, next = 1, active = 0, started = false;
        function describe(host, done) {
            call({ host: host, port: 8001 }, 'GET', '/api/v2/', null, function (err, j) {
                var d = !err && j && j.device;
                if (!d) { return done(null); }
                var plain = function (s) { return String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); };
                var tv = { host: host, name: clean(plain(d.name || j.name || host), 40), model: clean(plain(d.modelName), 30), self: host === lp.self, notify: false };
                call({ host: host }, 'GET', LANG, null, function (e2, j2) { tv.notify = !e2 && !!(j2 && j2.lang); done(tv); });
            });
        }
        function finish() {
            var hosts = Object.keys(cands), out = [], left = hosts.length;
            if (!left) { scanning = false; return cb(null, out); }
            hosts.forEach(function (h) {
                describe(h, function (tv) { if (tv) { out.push(tv); } left -= 1; if (!left) { scanning = false; out.sort(function (a, b) { return a.host < b.host ? -1 : 1; }); cb(null, out); } });
            });
        }
        function probe(host) {
            active += 1;
            var s = net.connect({ host: host, port: 8001 }), t = setTimeout(function () { fin(false); }, 600), over = false;
            function fin(ok) { if (over) { return; } over = true; clearTimeout(t); s.destroy(); if (ok) { cands[host] = true; } active -= 1; pump(); }
            s.on('connect', function () { fin(true); });
            s.on('error', function () { fin(false); });
        }
        function pump() {
            while (active < 40 && next <= 254) { probe(lp.prefix + (next++)); }
            if (next > 254 && active === 0 && !started) { started = true; ssdp(function (seen) { Object.keys(seen).forEach(function (h) { if (h.indexOf(lp.prefix) === 0) { cands[h] = true; } }); finish(); }); }
        }
        pump();
    }

    function sendFile(res, name, type) {
        fs.readFile(path.join(__dirname, name), 'utf8', function (err, text) {
            if (err) { return sendJson(res, 500, { error: name + ' is missing' }); }
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            res.end(text);
        });
    }

    return {
        start: function () {},
        stop: function () { pending.forEach(function (t) { clearTimeout(t); }); pending = []; log = []; scanning = false; },
        status: function () { return { tvs: tvs().length, retrying: pending.length }; },
        route: function (req, res, sub) {
            sub = String(sub || '').split('?')[0].replace(/^\/+|\/+$/g, '');
            var c = store();
            if (sub === 'ui' && req.method === 'GET') { sendFile(res, 'ui.html', 'text/html; charset=utf-8'); return true; }
            if (sub === 'state' && req.method === 'GET') {
                sendJson(res, 200, { lang: lang(), tvs: tvs().map(publicTv), log: log, retrying: pending.length, senderKeySet: !!c.senderKey });
                return true;
            }
            if (req.method !== 'POST') { return false; }
            var known = { tv: 1, cast: 1, scan: 1, pair: 1, confirm: 1, lang: 1, senderkey: 1, test: 1 };
            if (!known[sub]) { return false; }
            readBody(req, function (raw) {
                var b;
                try { b = JSON.parse(raw || '{}') || {}; } catch (e) { return sendJson(res, 400, { error: 'invalid JSON' }); }
                var conf = store();
                if (sub === 'cast' && conf.senderKey && String(req.headers['x-cast-key'] || b.key || '') !== conf.senderKey) { return sendJson(res, 403, { error: 'a sender key is required (X-Cast-Key)' }); }
                if (sub === 'lang') {
                    if (b.lang !== 'en' && b.lang !== 'pt') { return sendJson(res, 400, { error: 'lang must be en or pt' }); }
                    conf.lang = b.lang; save(conf); return sendJson(res, 200, { lang: b.lang });
                }
                if (sub === 'senderkey') {
                    var k = clean(b.key, 64);
                    if (k && !/^[A-Za-z0-9_-]{6,64}$/.test(k)) { return sendJson(res, 400, { error: 'use 6-64 letters, digits, - or _' }); }
                    if (k) { conf.senderKey = k; } else { delete conf.senderKey; }
                    save(conf); return sendJson(res, 200, { senderKeySet: !!k });
                }
                if (sub === 'tv') {
                    var list = Array.isArray(conf.tvs) ? conf.tvs : [], i;
                    if (b.action === 'delete') {
                        conf.tvs = list.filter(function (t) { return t.id !== b.id; }); save(conf);
                        return sendJson(res, 200, { tvs: conf.tvs.map(publicTv) });
                    }
                    var name = clean(b.name, 40), host = clean(b.host, 64), group = clean(b.group, 24);
                    if (!name || !host) { return sendJson(res, 400, { error: 'name and address are required' }); }
                    if (!allowedHost(host)) { return sendJson(res, 400, { error: 'address must be a private IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x) or a local name' }); }
                    if (b.action === 'update' && b.id) {
                        for (i = 0; i < list.length; i++) { if (list[i].id === b.id) { list[i].name = name; list[i].host = host; list[i].group = group; } }
                    } else {
                        if (list.length >= MAX_TVS) { return sendJson(res, 400, { error: 'at most ' + MAX_TVS + ' TVs' }); }
                        seq += 1;
                        list.push({ id: Date.now().toString(36) + seq, name: name, host: host, group: group });
                    }
                    conf.tvs = list; save(conf);
                    return sendJson(res, 200, { tvs: list.map(publicTv) });
                }
                if (sub === 'scan') {
                    if (scanning) { return sendJson(res, 409, { error: 'a scan is already running' }); }
                    scanning = true;
                    return scan(function (err, found) {
                        if (err) { scanning = false; return sendJson(res, 502, { error: err }); }
                        addLog('scan', 'found ' + found.length + ' TV(s) with Notification Center');
                        sendJson(res, 200, { found: found });
                    });
                }
                if (sub === 'pair') {      // step 1: ask that TV for a 6-digit code (shown on its screen)
                    var tv = findTv(b.id);
                    if (!tv) { return sendJson(res, 404, { error: 'unknown TV' }); }
                    return call({ host: tv.host }, 'POST', '/auth/pair', { name: 'cast-hub' }, function (err, j, code) {
                        if (err) { return sendJson(res, 502, { error: err }); }
                        if (code !== 200 || !j || !j.id) { return sendJson(res, 502, { error: (j && j.error) || 'pairing not available (http ' + code + ')' }); }
                        sendJson(res, 200, { pairId: j.id });
                    });
                }
                if (sub === 'confirm') {   // step 2: the code read from the TV; the key stays on the hub
                    var tv2 = findTv(b.id);
                    if (!tv2 || !b.pairId || !/^\d{6}$/.test(String(b.code))) { return sendJson(res, 400, { error: 'TV, pairing id and 6-digit code are required' }); }
                    return call({ host: tv2.host }, 'POST', '/auth/confirm', { id: String(b.pairId), code: String(b.code) }, function (err, j, code) {
                        if (err) { return sendJson(res, 502, { error: err }); }
                        var token = j && (j.token || j.key);
                        if (code !== 200 || !token) { return sendJson(res, 502, { error: (j && j.error) || 'the code was not accepted' }); }
                        var cur = store(), l2 = cur.tvs || [], q;
                        for (q = 0; q < l2.length; q++) { if (l2[q].id === tv2.id) { l2[q].key = String(token); } }
                        cur.tvs = l2; save(cur);
                        addLog('pair', tv2.name + ': paired');
                        sendJson(res, 200, { paired: true });
                    });
                }
                // cast / test
                var msg = normalise(b);
                if (sub === 'test') { msg.message = msg.message || 'Cast test'; msg.title = msg.title || 'Cast'; msg.icon = msg.icon || String.fromCharCode(0xD83D, 0xDCE1); }
                if (!msg.message) { return sendJson(res, 400, { error: 'message is required' }); }
                var all = tvs(), targets;
                if (sub === 'test') { targets = all.filter(function (t) { return t.id === b.id; }); }
                else if (Array.isArray(b.tvIds) && b.tvIds.length) { targets = all.filter(function (t) { return b.tvIds.indexOf(t.id) >= 0; }); }
                else if (b.group) { targets = all.filter(function (t) { return t.group === clean(b.group, 24); }); }
                else { targets = all; }
                if (!targets.length) { return sendJson(res, 400, { error: 'no TV to send to' }); }
                addLog('cast', msg.title + ' ' + msg.message + ' -> ' + targets.length + ' TV(s)');
                fanOut(targets, msg, function (results) { sendJson(res, 200, { results: results }); });
            });
            return true;
        }
    };
};
