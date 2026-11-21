'use strict';
// Match alerts: follows one football team through a score provider of your choice and sends banners through the Notification Center Shard.
// Providers: ESPN (public scoreboard, no key) and API-Football (needs your own key, 100 requests/day on the free plan, experimental).
// Plain ES5 (older TVs run Node 4.4). Outgoing: HTTPS GET to the chosen provider, and POST notify to Vetro on 127.0.0.1:8099.
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');

var NOTIFY = '/plugins/notification-center/api/notify';
var MAX_BODY = 4096, MAX_LOG = 30;
var E = {
    ball: String.fromCharCode(0x26BD),
    net: String.fromCharCode(0xD83E, 0xDD45),
    no: String.fromCharCode(0xD83D, 0xDEAB),
    flag: String.fromCharCode(0xD83C, 0xDFC1),
    whistle: String.fromCharCode(0x23F1, 0xFE0F),
    pause: String.fromCharCode(0x23F8, 0xFE0F)
};
var DEFAULTS = {
    provider: 'espn', teamId: '2250', teamName: 'Sporting CP', lang: 'en',
    on: { goal: true, against: true, start: true, half: true, end: true },
    goalSeconds: 30, otherSeconds: 10
};
var TXT = {
    en: { goal: 'GOAL', against: 'Goal for ', varNo: 'Goal disallowed', start: 'Kick-off', half: 'Half-time', end: 'Full time', test: 'Test' },
    pt: { goal: 'GOLO', against: 'Golo do ', varNo: 'Golo anulado', start: 'Come' + String.fromCharCode(0xE7) + 'ou o jogo', half: 'Intervalo', end: 'Fim do jogo', test: 'Teste' }
};

module.exports = function (ctx) {
    var timer = null, running = false;
    var last = {};                       // per match id: { state, desc, our, opp } (memory only)
    var log = [], teamsCache = {}, status = { at: 0, error: '', line: '', state: '', next: 0 };
    var af = { nextKick: 0, liveId: '' };   // API-Football bookkeeping, to spend few of the 100 daily requests

    function clamp(v, lo, hi, def) { var n = parseInt(v, 10); if (!(n >= lo)) { return def; } return n > hi ? hi : n; }
    function clean(s, max) { return String(s == null ? '' : s).replace(/[\x00-\x1f]/g, ' ').slice(0, max); }
    function sendJson(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
    function readBody(req, cb) {
        var s = '';
        req.on('data', function (d) { s += d; if (s.length > MAX_BODY) { req.destroy(); } });
        req.on('end', function () { cb(s); });
    }
    function addLog(kind, text) {
        log.unshift({ at: Date.now(), kind: kind, text: clean(text, 200) });
        if (log.length > MAX_LOG) { log.pop(); }
    }

    // ---- generic HTTPS JSON GET -------------------------------------------------------------------------------------------------
    function getJson(host, p, headers, cb) {
        var done = false;
        function end(err, data) { if (!done) { done = true; cb(err, data); } }
        var h = { 'Accept-Encoding': 'identity', 'User-Agent': 'vetro-match-alerts' }, k;
        for (k in headers) { if (headers.hasOwnProperty(k)) { h[k] = headers[k]; } }
        try {
            var rq = https.get({ host: host, path: p, headers: h, timeout: 10000 }, function (r) {
                var s = '';
                r.setEncoding('utf8');
                r.on('data', function (d) { s += d; if (s.length > 3000000) { r.destroy(); end('too large'); } });
                r.on('end', function () {
                    if (r.statusCode !== 200) { return end('http ' + r.statusCode); }
                    try { end(null, JSON.parse(s)); } catch (e) { end('bad json'); }
                });
            });
            rq.on('error', function (e) { end(String(e && e.message || e)); });
            rq.on('timeout', function () { rq.destroy(); end('timeout'); });
        } catch (e) { end('request failed'); }
    }

    // ---- providers: each gives the team's match as { id, state: pre|in|post, desc, clock, date, home, away } -----------------------
    // home / away = { id, name, short, score }
    function espnMatch(c, cb) {
        getJson('site.api.espn.com', '/apis/site/v2/sports/soccer/all/scoreboard', {}, function (err, data) {
            if (err) { return cb(err); }
            var evs = (data && data.events) || [], i, j, m = null;
            for (i = 0; i < evs.length && !m; i++) {
                var cs = (evs[i].competitions && evs[i].competitions[0] && evs[i].competitions[0].competitors) || [], home = null, away = null;
                for (j = 0; j < cs.length; j++) {
                    var side = { id: String(cs[j].team.id), name: cs[j].team.displayName, short: cs[j].team.shortDisplayName || cs[j].team.displayName, score: parseInt(cs[j].score, 10) || 0 };
                    if (cs[j].homeAway === 'home') { home = side; } else { away = side; }
                }
                if (home && away && (home.id === c.teamId || away.id === c.teamId)) {
                    var t = evs[i].status && evs[i].status.type ? evs[i].status.type : {};
                    m = { id: 'espn-' + evs[i].id, state: t.state || '', desc: t.description || '', clock: evs[i].status.displayClock || '', date: evs[i].date, home: home, away: away };
                }
            }
            cb(null, m, m ? { wait: m.state === 'in' ? 20000 : (m.state === 'pre' && new Date(m.date).getTime() - Date.now() < 900000 ? 30000 : 120000) } : { wait: 180000 });
        });
    }
    function espnTeams(c, cb) {
        getJson('site.api.espn.com', '/apis/site/v2/sports/soccer/por.1/teams', {}, function (err, d) {
            if (err) { return cb(err); }
            var list = [];
            try { d.sports[0].leagues[0].teams.forEach(function (t) { list.push({ id: String(t.team.id), name: t.team.displayName }); }); } catch (e) { return cb('unexpected answer'); }
            cb(null, list);
        });
    }

    function afGet(c, p, cb) {
        var key = (ctx.config.get() || {}).keys && (ctx.config.get() || {}).keys.apifootball;
        if (!key) { return cb('no API-Football key set'); }
        getJson('v3.football.api-sports.io', p, { 'x-apisports-key': key }, function (err, d) {
            if (err) { return cb(err); }
            var e = d && d.errors;
            if (e && ((Array.isArray(e) && e.length) || (!Array.isArray(e) && Object.keys(e).length))) { return cb('API-Football: ' + clean(JSON.stringify(e), 120)); }
            cb(null, (d && d.response) || []);
        });
    }
    function afNorm(f) {
        var s = f.fixture.status.short, st = (s === 'NS' || s === 'TBD' || s === 'PST') ? 'pre' : (s === 'FT' || s === 'AET' || s === 'PEN' || s === 'CANC' || s === 'ABD' || s === 'AWD' || s === 'WO') ? 'post' : 'in';
        return {
            id: 'af-' + f.fixture.id, state: st, desc: s === 'HT' ? 'Halftime' : f.fixture.status.long, clock: f.fixture.status.elapsed ? f.fixture.status.elapsed + "'" : '', date: f.fixture.date,
            home: { id: String(f.teams.home.id), name: f.teams.home.name, short: f.teams.home.name, score: f.goals.home || 0 },
            away: { id: String(f.teams.away.id), name: f.teams.away.name, short: f.teams.away.name, score: f.goals.away || 0 }
        };
    }
    function afMatch(c, cb) {
        var now = Date.now();
        if (af.nextKick && now < af.nextKick - 300000) { return cb(null, null, { wait: Math.min(af.nextKick - 300000 - now, 7200000) }); }
        function schedule() {   // one request: the team's next fixture
            afGet(c, '/fixtures?team=' + c.teamId + '&next=1', function (err, list) {
                if (err) { return cb(err); }
                af.nextKick = list[0] ? new Date(list[0].fixture.date).getTime() : now + 7200000;
                cb(null, null, { wait: Math.min(Math.max(af.nextKick - 300000 - Date.now(), 60000), 7200000) });
            });
        }
        if (af.liveId) {   // a match we saw live: ask for it directly so the final whistle is not missed
            return afGet(c, '/fixtures?id=' + af.liveId.replace(/\D/g, ''), function (err, list) {
                if (err) { return cb(err); }
                var m = list[0] ? afNorm(list[0]) : null;
                if (!m || m.state === 'post') { af.liveId = ''; af.nextKick = 0; }
                cb(null, m, { wait: 100000 });
            });
        }
        afGet(c, '/fixtures?live=all', function (err, list) {
            if (err) { return cb(err); }
            var i, m = null;
            for (i = 0; i < list.length && !m; i++) {
                if (String(list[i].teams.home.id) === c.teamId || String(list[i].teams.away.id) === c.teamId) { m = afNorm(list[i]); }
            }
            if (m) { af.liveId = m.id; return cb(null, m, { wait: 100000 }); }
            if (af.nextKick && now >= af.nextKick - 300000 && now < af.nextKick + 1800000) { return cb(null, null, { wait: 100000 }); }   // about to start
            schedule();
        });
    }
    function afTeams(c, cb) {
        var d = new Date(), season = d.getMonth() < 6 ? d.getFullYear() - 1 : d.getFullYear();
        afGet(c, '/teams?league=94&season=' + season, function (err, list) {
            if (err) { return cb(err); }
            cb(null, list.map(function (t) { return { id: String(t.team.id), name: t.team.name }; }));
        });
    }
    var PROVIDERS = {
        espn: { label: 'ESPN (public scoreboard, no key)', needsKey: false, team: { id: '2250', name: 'Sporting CP' }, match: espnMatch, teams: espnTeams },
        apifootball: { label: 'API-Football (your key, 100 requests/day, experimental)', needsKey: true, team: { id: '228', name: 'Sporting CP' }, match: afMatch, teams: afTeams }
    };

    // ---- config ----------------------------------------------------------------------------------------------------------------
    function rawCfg() { return ctx.config.get() || {}; }
    function cfg() {
        var c = rawCfg(), d = DEFAULTS, o = {};
        o.provider = PROVIDERS.hasOwnProperty(c.provider) ? c.provider : d.provider;
        o.teamId = /^\d{1,8}$/.test(String(c.teamId)) ? String(c.teamId) : PROVIDERS[o.provider].team.id;
        o.teamName = clean(c.teamName || PROVIDERS[o.provider].team.name, 40);
        o.lang = c.lang === 'pt' ? 'pt' : 'en';
        o.on = {};
        Object.keys(d.on).forEach(function (k) { o.on[k] = !(c.on && c.on[k] === false); });
        o.goalSeconds = clamp(c.goalSeconds, 5, 60, d.goalSeconds);
        o.otherSeconds = clamp(c.otherSeconds, 3, 30, d.otherSeconds);
        return o;
    }
    function publicCfg() {
        var o = cfg(), keys = rawCfg().keys || {};
        o.hasKey = !!keys[o.provider];
        o.providers = Object.keys(PROVIDERS).map(function (k) { return { id: k, label: PROVIDERS[k].label, needsKey: PROVIDERS[k].needsKey }; });
        return o;
    }

    // ---- banners ---------------------------------------------------------------------------------------------------------------
    function banner(title, message, level, icon, seconds) {
        var body = JSON.stringify({ title: title, message: message, level: level, icon: icon, mode: 'banner', duration: seconds });
        try {
            var rq = http.request({
                host: '127.0.0.1', port: 8099, path: NOTIFY, method: 'POST', timeout: 5000,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            }, function (r) { r.resume(); });
            rq.on('error', function () { /* Notification Center not installed or Vetro busy */ });
            rq.on('timeout', function () { rq.destroy(); });
            rq.write(body);
            rq.end();
        } catch (e) { /* ignore */ }
    }
    function lineOf(m) { return m.home.name + ' ' + m.home.score + '-' + m.away.score + ' ' + m.away.name + (m.clock ? ' (' + m.clock + ')' : ''); }
    function announce(kind, c, m, extra) {
        var t = TXT[c.lang], line = lineOf(m), seconds = c.otherSeconds, title, level = 'info', icon = '';
        if (kind === 'goal') { title = E.ball + ' ' + t.goal + ' ' + c.teamName.toUpperCase() + '!'; level = 'ok'; seconds = c.goalSeconds; }
        else if (kind === 'against') { title = t.against + (extra || '?'); level = 'warn'; icon = E.net; }
        else if (kind === 'var') { title = t.varNo; level = 'warn'; icon = E.no; }
        else if (kind === 'start') { title = t.start; icon = E.whistle; }
        else if (kind === 'half') { title = t.half; icon = E.pause; }
        else { title = t.end; icon = E.flag; }
        banner(title, line, level, icon, seconds);   // the goal title already carries the ball, so it has no separate icon
        addLog(kind, title + ' - ' + line);
    }
    function analyse(m, c) {
        var us = m.home.id === c.teamId ? m.home : m.away, them = us === m.home ? m.away : m.home;
        var prev = last[m.id];
        last[m.id] = { state: m.state, desc: m.desc, our: us.score, opp: them.score };
        status.line = lineOf(m); status.state = m.desc;
        if (!prev) { return; }                                    // first sight: baseline only, no banner
        if (us.score > prev.our && c.on.goal) { announce('goal', c, m); }
        else if (them.score > prev.opp && c.on.against) { announce('against', c, m, them.short); }
        else if ((us.score < prev.our || them.score < prev.opp) && (c.on.goal || c.on.against)) { announce('var', c, m); }
        if (prev.state === 'pre' && m.state === 'in' && c.on.start) { announce('start', c, m); }
        if (/half/i.test(m.desc) && !/half/i.test(prev.desc) && c.on.half) { announce('half', c, m); }
        if (prev.state === 'in' && m.state === 'post' && c.on.end) { announce('end', c, m); }
    }

    // ---- polling ---------------------------------------------------------------------------------------------------------------
    function schedule(ms) {
        if (!running) { return; }
        status.next = Date.now() + ms;
        clearTimeout(timer);
        timer = setTimeout(poll, ms);
    }
    function poll() {
        if (!running) { return; }
        var c = cfg();
        PROVIDERS[c.provider].match(c, function (err, m, hint) {
            status.at = Date.now();
            if (err) { status.error = String(err); return schedule(120000); }
            status.error = '';
            if (!m) { status.line = ''; status.state = ''; return schedule((hint && hint.wait) || 180000); }
            analyse(m, c);
            schedule((hint && hint.wait) || 60000);
        });
    }

    function sendFile(res, name, type) {
        fs.readFile(path.join(__dirname, name), 'utf8', function (err, text) {
            if (err) { return sendJson(res, 500, { error: name + ' is missing' }); }
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
            res.end(text);
        });
    }
    function teams(c, cb) {
        var hit = teamsCache[c.provider];
        if (hit && Date.now() - hit.at < 86400000) { return cb(null, hit.list); }
        PROVIDERS[c.provider].teams(c, function (err, list) {
            if (err) { return cb(err); }
            list.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
            teamsCache[c.provider] = { at: Date.now(), list: list };
            cb(null, list);
        });
    }

    return {
        start: function () { running = true; schedule(3000); },
        stop: function () { running = false; clearTimeout(timer); last = {}; af = { nextKick: 0, liveId: '' }; },
        status: function () { var c = cfg(); return { provider: c.provider, team: c.teamName, match: status.line || null, error: status.error || null }; },
        route: function (req, res, sub) {
            sub = String(sub || '').split('?')[0].replace(/^\/+|\/+$/g, '');
            if (sub === 'ui' && req.method === 'GET') { sendFile(res, 'ui.html', 'text/html; charset=utf-8'); return true; }
            if (sub === 'state' && req.method === 'GET') { sendJson(res, 200, { config: publicCfg(), status: status, log: log }); return true; }
            if (sub === 'teams' && req.method === 'GET') {
                teams(cfg(), function (err, list) { sendJson(res, err ? 502 : 200, err ? { error: String(err) } : { teams: list }); });
                return true;
            }
            if (sub === 'poll' && req.method === 'POST') { poll(); sendJson(res, 200, { ok: true }); return true; }
            if (sub === 'config' && req.method === 'POST') {
                readBody(req, function (raw) {
                    var b, c = cfg(), store = rawCfg();
                    try { b = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: 'invalid JSON' }); }
                    b = b || {};
                    if (b.provider !== undefined) {
                        if (!PROVIDERS.hasOwnProperty(b.provider)) { return sendJson(res, 400, { error: 'unknown provider' }); }
                        if (b.provider !== c.provider) { c.provider = b.provider; c.teamId = PROVIDERS[b.provider].team.id; c.teamName = PROVIDERS[b.provider].team.name; last = {}; af = { nextKick: 0, liveId: '' }; }
                    }
                    if (b.apiKey !== undefined) {
                        var k = String(b.apiKey).trim();
                        if (k && !/^[A-Za-z0-9_-]{8,80}$/.test(k)) { return sendJson(res, 400, { error: 'that does not look like an API key' }); }
                        store.keys = store.keys || {};
                        if (k) { store.keys[c.provider] = k; } else { delete store.keys[c.provider]; }
                    }
                    if (b.teamId !== undefined) {
                        if (!/^\d{1,8}$/.test(String(b.teamId))) { return sendJson(res, 400, { error: 'teamId must be a number' }); }
                        if (String(b.teamId) !== c.teamId) { last = {}; af = { nextKick: 0, liveId: '' }; }
                        c.teamId = String(b.teamId);
                    }
                    if (b.teamName !== undefined) { c.teamName = clean(b.teamName, 40); }
                    if (b.lang === 'en' || b.lang === 'pt') { c.lang = b.lang; }
                    if (b.on && typeof b.on === 'object') { Object.keys(c.on).forEach(function (kk) { if (typeof b.on[kk] === 'boolean') { c.on[kk] = b.on[kk]; } }); }
                    if (b.goalSeconds !== undefined) { c.goalSeconds = clamp(b.goalSeconds, 5, 60, c.goalSeconds); }
                    if (b.otherSeconds !== undefined) { c.otherSeconds = clamp(b.otherSeconds, 3, 30, c.otherSeconds); }
                    store.provider = c.provider; store.teamId = c.teamId; store.teamName = c.teamName; store.lang = c.lang; store.on = c.on;
                    store.goalSeconds = c.goalSeconds; store.otherSeconds = c.otherSeconds;
                    ctx.config.set(store);
                    sendJson(res, 200, { config: publicCfg() });
                    schedule(1000);
                });
                return true;
            }
            if (sub === 'test' && req.method === 'POST') {
                readBody(req, function (raw) {
                    var b = {}, c = cfg(), t = TXT[c.lang];
                    try { b = JSON.parse(raw) || {}; } catch (e) { b = {}; }
                    var line = status.line || (c.teamName + ' 1-0 ' + t.test);
                    if (b.kind === 'against') { banner(t.against + t.test, line, 'warn', E.net, c.otherSeconds); }
                    else { banner(E.ball + ' ' + t.goal + ' ' + c.teamName.toUpperCase() + '!', line, 'ok', '', c.goalSeconds); }
                    addLog('test', (b.kind === 'against' ? 'against' : 'goal') + ' - ' + line);
                    sendJson(res, 200, { ok: true });
                });
                return true;
            }
            return false;
        }
    };
};
