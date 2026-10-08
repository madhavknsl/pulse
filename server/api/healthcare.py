"""Healthcare: providers and slots, appointments, links and sharing, reports, the doctor's plan and the summary."""
import json
from datetime import date, datetime, timedelta

from server import compute, defs, providers, store
from server.router import route
from server.util import ApiError, bad, flag, iso_now, number, one_of, text, today_str, ymd


def _provider(pid):
    p = providers.BY_ID.get(pid)
    if p is None:
        raise ApiError(404, "That provider was not found.")
    return p


def _taken(conn, pid):
    return {(r["date"], r["minute"]) for r in conn.execute(
        "SELECT date, minute FROM appointments WHERE provider_id = ? AND status = 'upcoming' AND date >= ?", (pid, today_str()))}


def _next_slot(conn, p):
    av = providers.availability(p, _taken(conn, p["id"]))
    for d, mins in av.items():
        if mins:
            return {"date": d, "minute": mins[0]}
    return None


def _clean_share(d):
    if not isinstance(d, dict):
        raise bad("Choose what to share.", "share")
    return {k: flag(d.get(k, False), k) for k in defs.SHARE_KEYS}


def _link_row(r):
    return {"provider_id": r["provider_id"], "share": json.loads(r["share"]), "expires": r["expires"], "since": r["since"]}


# ---------- providers ----------
@route("GET", "/api/providers")
def list_providers(req):
    return {"providers": [{**p, "next_slot": _next_slot(req.conn, p)} for p in providers.PROVIDERS], "areas": providers.AREAS}


@route("GET", "/api/providers/(?P<pid>[a-z]+)/availability")
def availability(req):
    p = _provider(req.args["pid"])
    return {"availability": providers.availability(p, _taken(req.conn, p["id"]))}


@route("POST", "/api/invites")
def invite(req):
    from server.util import email
    em = email(req.json().get("email"))
    req.conn.execute("INSERT INTO invites (user_id, email, created_at) VALUES (?,?,?)", (req.user["id"], em, iso_now()))
    return 201, {"message": "Invitation noted. Email isn't connected in this prototype, so nothing was sent."}


# ---------- the whole healthcare picture ----------
@route("GET", "/api/healthcare")
def healthcare(req):
    conn, uid = req.conn, req.user["id"]
    links = [_link_row(r) for r in conn.execute("SELECT * FROM links WHERE user_id = ? ORDER BY since", (uid,))]
    appts = [{"id": r["id"], "provider_id": r["provider_id"], "date": r["date"], "minute": r["minute"], "mode": r["mode"],
              "reason": r["reason"], "status": r["status"]} for r in conn.execute("SELECT * FROM appointments WHERE user_id = ? ORDER BY date, minute", (uid,))]
    tests = [{"id": r["id"], "key": r["test_key"], "name": defs.TESTS[r["test_key"]]["name"], "provider_id": r["provider_id"],
              "ordered_on": r["ordered_on"], "due_on": r["due_on"], "status": r["status"], "status_on": r["status_on"]}
             for r in conn.execute("SELECT * FROM tests WHERE user_id = ? ORDER BY id", (uid,))]
    results = []
    for r in conn.execute("SELECT * FROM results WHERE user_id = ? ORDER BY date, id", (uid,)):
        f = conn.execute("SELECT id, original_name FROM files WHERE id = ? AND user_id = ?", (r["file_id"], uid)).fetchone() if r["file_id"] else None
        results.append({"id": r["id"], "test_key": r["test_key"], "date": r["date"], "values": json.loads(r["vals"]),
                        "ranges": json.loads(r["ranges"]), "file": {"id": f["id"], "name": f["original_name"], "url": f"/api/files/{f['id']}"} if f else None})
    plans = {}
    for l in links:
        plan = providers.PLANS.get(l["provider_id"])
        if plan:
            plans[l["provider_id"]] = {**plan, "updated": (date.today() - timedelta(days=plan["updated_days_ago"])).isoformat()}
    wk = conn.execute("SELECT AVG(sleep_min) s, AVG(steps) t FROM daily WHERE user_id = ? AND date >= ?",
                      (uid, (date.today() - timedelta(days=6)).isoformat())).fetchone()
    return {
        "week": {"sleep_h": None if wk["s"] is None else round(wk["s"] / 60, 1), "steps": None if wk["t"] is None else int(round(wk["t"]))},
        "links": links, "appointments": appts, "tests": tests, "results": results,
        "test_defs": {k: {"name": v["name"], "analytes": [{"k": a, "unit": u} for a, u in v["analytes"]]} for k, v in defs.TESTS.items()},
        "questions": [{"id": r["id"], "text": r["text"]} for r in conn.execute("SELECT * FROM questions WHERE user_id = ? ORDER BY id", (uid,))],
        "log": [{"at": r["at"], "text": r["text"]} for r in conn.execute("SELECT * FROM access_log WHERE user_id = ? ORDER BY id DESC LIMIT 60", (uid,))],
        "summary_shared": {r["provider_id"]: r["at"] for r in conn.execute("SELECT * FROM summary_shares WHERE user_id = ?", (uid,))},
        "diet_today": [r["idx"] for r in conn.execute("SELECT idx FROM diet_log WHERE user_id = ? AND date = ?", (uid, today_str()))],
        "plans": plans,
        "emergency": store.get_setting(conn, uid, "emergency", None),
        "share_labels": defs.SHARE_LABELS, "share_keys": defs.SHARE_KEYS, "expiry": defs.EXPIRY, "reasons": defs.REASONS,
        "goals": store.goals(conn, uid),
    }


# ---------- appointments ----------
@route("POST", "/api/appointments")
def book(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    p = _provider(d.get("provider_id"))
    day = ymd(d.get("date"), "date")
    if day < date.today() or day > date.today() + timedelta(days=13):
        raise bad("Choose a day in the next two weeks.", "date")
    minute = number(d.get("minute"), "minute", 0, 1439, integer=True)
    mode = one_of(d.get("mode"), "mode", p["modes"])
    reason = one_of(d.get("reason"), "reason", defs.REASONS)
    if minute not in providers.slots_for(p, day):
        raise ApiError(409, "That time isn't available. Please pick another.", "minute", "slot_unavailable")
    if (day.isoformat(), minute) in _taken(conn, p["id"]):
        raise ApiError(409, "That time was just taken. Please pick another.", "minute", "slot_taken")
    cur = conn.execute("INSERT INTO appointments (user_id, provider_id, date, minute, mode, reason, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
                       (uid, p["id"], day.isoformat(), minute, mode, reason, "upcoming", iso_now()))
    shared = False
    if d.get("share_summary") is True:
        if not conn.execute("SELECT 1 FROM links WHERE user_id = ? AND provider_id = ?", (uid, p["id"])).fetchone():
            raise bad("Link this doctor first to share your summary.", "share_summary")
        conn.execute("INSERT INTO summary_shares (user_id, provider_id, at) VALUES (?,?,?) ON CONFLICT(user_id, provider_id) DO UPDATE SET at = excluded.at",
                     (uid, p["id"], iso_now()))
        store.log_access(conn, uid, f"You shared your pre-visit summary with {p['name']}")
        shared = True
    return 201, {"id": cur.lastrowid, "shared": shared}


@route("PATCH", "/api/appointments/(?P<aid>\\d+)")
def change_appointment(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    a = conn.execute("SELECT * FROM appointments WHERE id = ? AND user_id = ?", (int(req.args["aid"]), uid)).fetchone()
    if a is None or a["status"] != "upcoming":
        raise ApiError(404, "That appointment can't be changed.")
    p = _provider(a["provider_id"])
    action = one_of(d.get("action"), "action", ["reschedule", "cancel"])
    if action == "cancel":
        conn.execute("UPDATE appointments SET status = 'cancelled' WHERE id = ?", (a["id"],))
        return {"ok": True}
    day = ymd(d.get("date"), "date")
    minute = number(d.get("minute"), "minute", 0, 1439, integer=True)
    if day < date.today() or day > date.today() + timedelta(days=13):
        raise bad("Choose a day in the next two weeks.", "date")
    if minute not in providers.slots_for(p, day):
        raise ApiError(409, "That time isn't available. Please pick another.", "minute", "slot_unavailable")
    taken = _taken(conn, p["id"]) - {(a["date"], a["minute"])}
    if (day.isoformat(), minute) in taken:
        raise ApiError(409, "That time was just taken. Please pick another.", "minute", "slot_taken")
    conn.execute("UPDATE appointments SET date = ?, minute = ? WHERE id = ?", (day.isoformat(), minute, a["id"]))
    return {"ok": True}


# ---------- links and sharing ----------
@route("POST", "/api/links")
def link(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    p = _provider(d.get("provider_id"))
    share = _clean_share(d.get("share"))
    expires = one_of(d.get("expires"), "expires", defs.EXPIRY)
    conn.execute("INSERT INTO links (user_id, provider_id, share, expires, since) VALUES (?,?,?,?,?) "
                 "ON CONFLICT(user_id, provider_id) DO UPDATE SET share = excluded.share, expires = excluded.expires",
                 (uid, p["id"], json.dumps(share), expires, iso_now()))
    store.log_access(conn, uid, f"You linked {p['name']} and shared {sum(share.values())} of {len(defs.SHARE_KEYS)} data types")
    return 201, {"link": _link_row(conn.execute("SELECT * FROM links WHERE user_id = ? AND provider_id = ?", (uid, p["id"])).fetchone())}


@route("PUT", "/api/links/(?P<pid>[a-z]+)")
def update_link(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    p = _provider(req.args["pid"])
    row = conn.execute("SELECT * FROM links WHERE user_id = ? AND provider_id = ?", (uid, p["id"])).fetchone()
    if row is None:
        raise ApiError(404, "You haven't linked this provider.")
    old = json.loads(row["share"])
    share = _clean_share({**old, **(d.get("share") or {})}) if "share" in d else old
    expires = one_of(d.get("expires"), "expires", defs.EXPIRY) if "expires" in d else row["expires"]
    conn.execute("UPDATE links SET share = ?, expires = ? WHERE user_id = ? AND provider_id = ?", (json.dumps(share), expires, uid, p["id"]))
    for k in defs.SHARE_KEYS:
        if old.get(k) != share.get(k):
            store.log_access(conn, uid, f"You turned {'on' if share[k] else 'off'} sharing \"{defs.SHARE_LABELS[k]}\" with {p['name']}")
    if expires != row["expires"]:
        store.log_access(conn, uid, f"You set access for {p['name']} to: {expires}")
    return {"link": {"provider_id": p["id"], "share": share, "expires": expires, "since": row["since"]}}


@route("DELETE", "/api/links/(?P<pid>[a-z]+)")
def unlink(req):
    conn, uid = req.conn, req.user["id"]
    p = _provider(req.args["pid"])
    conn.execute("DELETE FROM links WHERE user_id = ? AND provider_id = ?", (uid, p["id"]))
    conn.execute("DELETE FROM summary_shares WHERE user_id = ? AND provider_id = ?", (uid, p["id"]))
    store.log_access(conn, uid, f"You stopped sharing with {p['name']} and unlinked them")
    return None


# ---------- questions for the doctor ----------
@route("POST", "/api/questions")
def add_question(req):
    cur = req.conn.execute("INSERT INTO questions (user_id, text, created_at) VALUES (?,?,?)",
                           (req.user["id"], text(req.json().get("text"), "text", max_len=200), iso_now()))
    return 201, {"id": cur.lastrowid}


@route("DELETE", "/api/questions/(?P<qid>\\d+)")
def del_question(req):
    req.conn.execute("DELETE FROM questions WHERE id = ? AND user_id = ?", (int(req.args["qid"]), req.user["id"]))
    return None


# ---------- lab reports ----------
@route("POST", "/api/reports")
def add_report(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "health_basics")
    key = one_of(d.get("test_key"), "test_key", list(defs.TESTS))
    day = ymd(d.get("date"), "date", not_future=True)
    allowed = dict(defs.TESTS[key]["analytes"])
    vals, ranges = {}, {}
    for name, v in (d.get("values") or {}).items():
        if name not in allowed:
            raise bad("That measurement isn't part of this test.", "values")
        vals[name] = number(v, name, 0, 100000)
        r = (d.get("ranges") or {}).get(name)
        if r is not None:
            if not isinstance(r, list) or len(r) != 2:
                raise bad("A range needs a start and an end.", "ranges")
            ranges[name] = [number(r[0], name, -100000, 100000, required=False), number(r[1], name, -100000, 100000, required=False)]
    file_id = d.get("file_id")
    if file_id is not None and not conn.execute("SELECT 1 FROM files WHERE id = ? AND user_id = ? AND kind = 'report'", (file_id, uid)).fetchone():
        raise bad("That file was not found.", "file_id")
    if not vals and file_id is None:
        raise bad("Add the report file or type in at least one number.")
    conn.execute("INSERT INTO results (user_id, test_key, date, vals, ranges, file_id) VALUES (?,?,?,?,?,?)",
                 (uid, key, day.isoformat(), json.dumps(vals), json.dumps(ranges), file_id))
    conn.execute("UPDATE tests SET status = 'uploaded', status_on = ? WHERE user_id = ? AND test_key = ? AND status = 'ordered'", (today_str(), uid, key))
    visible = [providers.BY_ID[r["provider_id"]]["name"] for r in conn.execute("SELECT provider_id, share FROM links WHERE user_id = ?", (uid,))
               if json.loads(r["share"]).get("labs") and r["provider_id"] in providers.BY_ID]
    store.log_access(conn, uid, f"You added a {defs.TESTS[key]['name']} report" + (f" and it is visible to {', '.join(visible)}" if visible else ""))
    return 201, {"visible_to": visible}


# ---------- doctor's plan: diet tick-offs ----------
@route("PUT", "/api/diet")
def diet(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    idx = number(d.get("idx"), "idx", 0, 9, integer=True)
    if flag(d.get("done"), "done"):
        conn.execute("INSERT OR IGNORE INTO diet_log (user_id, date, idx) VALUES (?,?,?)", (uid, today_str(), idx))
    else:
        conn.execute("DELETE FROM diet_log WHERE user_id = ? AND date = ? AND idx = ?", (uid, today_str(), idx))
    return {"ok": True}


# ---------- pre-visit summary ----------
def _linked(conn, uid, pid):
    row = conn.execute("SELECT * FROM links WHERE user_id = ? AND provider_id = ?", (uid, pid)).fetchone()
    if row is None:
        raise ApiError(404, "Link this doctor to prepare a summary.")
    return _link_row(row)


@route("GET", "/api/summary/(?P<pid>[a-z]+)")
def summary(req):
    p = _provider(req.args["pid"])
    return compute.build_summary(req.conn, req.user, p, _linked(req.conn, req.user["id"], p["id"]))


@route("POST", "/api/summary/(?P<pid>[a-z]+)/share")
def share_summary(req):
    conn, uid = req.conn, req.user["id"]
    p = _provider(req.args["pid"])
    _linked(conn, uid, p["id"])
    at = iso_now()
    conn.execute("INSERT INTO summary_shares (user_id, provider_id, at) VALUES (?,?,?) ON CONFLICT(user_id, provider_id) DO UPDATE SET at = excluded.at",
                 (uid, p["id"], at))
    store.log_access(conn, uid, f"You shared your pre-visit summary with {p['name']}")
    return {"at": at}
