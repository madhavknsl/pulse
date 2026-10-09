"""Everything the tracker logs: steps and sleep (typed in by the person), weight, workouts, cycle, symptoms, meals, medicines, stress."""
import json
from datetime import date, timedelta

from server import defs, store
from server.router import route
from server.util import ApiError, bad, hhmm, iso_now, number, one_of, str_list, text, today_str, ymd


def _day(n):
    return (date.today() - timedelta(days=n)).isoformat()


# ---------- read everything the tracker pages need ----------
@route("GET", "/api/tracker")
def tracker(req):
    conn, uid = req.conn, req.user["id"]
    rows = {r["date"]: r for r in conn.execute("SELECT * FROM daily WHERE user_id = ? AND date >= ?", (uid, _day(29)))}
    daily = []
    for i in range(29, -1, -1):
        k = _day(i)
        r = rows.get(k)
        daily.append({"date": k, **{c: (r[c] if r else None) for c in
                                    ("steps", "sleep_min", "bed_min", "mood", "stress")}})
    weights = [dict(r) for r in conn.execute(
        "SELECT date, value FROM (SELECT date, value FROM measurements WHERE user_id = ? AND kind = 'weight' ORDER BY date DESC LIMIT 12) ORDER BY date", (uid,))]
    waist = store.latest_measurement(conn, uid, "waist")
    meds = []
    for m in conn.execute("SELECT * FROM medications WHERE user_id = ? ORDER BY id", (uid,)).fetchall():
        log = {r["date"]: r["status"] for r in conn.execute("SELECT date, status FROM med_log WHERE med_id = ? AND date >= ?", (m["id"], _day(6)))}
        meds.append({"id": m["id"], "name": m["name"], "dose": m["dose"], "week": [log.get(_day(i)) for i in range(6, 0, -1)],
                     "today": log.get(today_str())})
    qh = {}
    for kind in defs.QUESTIONNAIRES:
        qh[kind] = [{"date": r["date"], "score": r["score"], "ago": (date.today() - date.fromisoformat(r["date"])).days}
                    for r in conn.execute("SELECT date, score FROM questionnaires WHERE user_id = ? AND kind = ? ORDER BY date, id", (uid, kind))]
    return {
        "today": today_str(),
        "daily": daily,
        "weights": [{"date": w["date"], "kg": w["value"]} for w in weights],
        "waist": {"cm": waist["value"], "date": waist["date"]} if waist else None,
        "workouts": [{"id": r["id"], "date": r["date"], "type": r["type"], "min": r["minutes"]} for r in conn.execute(
            "SELECT * FROM workouts WHERE user_id = ? AND date >= ? ORDER BY date, id", (uid, _day(29)))],
        "period": {r["date"]: r["flow"] for r in conn.execute("SELECT date, flow FROM period_days WHERE user_id = ? AND date >= ?", (uid, _day(400)))},
        "symptom_logs": [{"date": r["date"], "syms": json.loads(r["symptoms"]), "tags": json.loads(r["tags"])} for r in conn.execute(
            "SELECT * FROM symptom_logs WHERE user_id = ? AND date >= ? ORDER BY date DESC", (uid, _day(29)))],
        "meals": [{"id": r["id"], "date": r["date"], "time": r["time"], "type": r["meal_type"], "src": r["source"], "text": r["text"]}
                  for r in conn.execute("SELECT * FROM meals WHERE user_id = ? AND date >= ? ORDER BY date, time", (uid, _day(6)))],
        "meds": meds,
        "questionnaires": qh,
        "goals": store.goals(conn, uid),
        "ui": store.get_setting(conn, uid, "ui", defs.DEFAULT_UI),
        "consents": store.consents(conn, uid),
        "user": {"preferred_name": req.user["preferred_name"] or req.user["first_name"]},
    }


def _entry_day(d):
    """The day an entry is for: today unless a day in the last 30 days is given."""
    day = ymd(d.get("date") or today_str(), not_future=True)
    if (date.today() - day).days > 29:
        raise bad("Pick a day in the last 30 days.", "date")
    return day.isoformat()


def _upsert_daily(conn, uid, day, **cols):
    conn.execute("INSERT OR IGNORE INTO daily (user_id, date) VALUES (?,?)", (uid, day))
    sets = ", ".join(f"{k} = ?" for k in cols)
    conn.execute(f"UPDATE daily SET {sets} WHERE user_id = ? AND date = ?", (*cols.values(), uid, day))


# ---------- steps, sleep, weight, workouts (typed in by the person) ----------
@route("POST", "/api/tracker/steps")
def log_steps(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "sleep_activity")
    day = _entry_day(d)
    steps = number(d.get("steps"), "steps", 0, 100000, integer=True)
    if float(d["steps"]) != steps:
        raise bad("Enter a whole number of steps.", "steps")
    _upsert_daily(conn, uid, day, steps=steps)
    return {"date": day, "steps": steps}


@route("POST", "/api/tracker/sleep")
def log_sleep(req):
    """The night that ended on `date` (today if left out)."""
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "sleep_activity")
    day = _entry_day(d)
    bed, wake = hhmm(d.get("bed"), "bed"), hhmm(d.get("wake"), "wake")
    b, w = int(bed[:2]) * 60 + int(bed[3:]), int(wake[:2]) * 60 + int(wake[3:])
    dur = (w - b + 1440) % 1440
    if dur == 0:
        raise bad("Bedtime and wake time can't be the same.", "wake")
    _upsert_daily(conn, uid, day, sleep_min=dur, bed_min=b - 1440 if b >= 18 * 60 else b)
    return {"date": day, "sleep_min": dur}


@route("POST", "/api/tracker/weight")
def log_weight(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "health_basics")
    kg = number(d.get("kg"), "kg", 25, 250, required=False)
    cm = number(d.get("waist"), "waist", 40, 200, required=False)
    if kg is None and cm is None:
        raise bad("Enter a weight or a waist measurement.")
    for kind, val in (("weight", kg), ("waist", cm)):
        if val is not None:
            conn.execute("INSERT INTO measurements (user_id, date, kind, value) VALUES (?,?,?,?) "
                         "ON CONFLICT(user_id, date, kind) DO UPDATE SET value = excluded.value", (uid, today_str(), kind, val))
    return {"ok": True}


@route("POST", "/api/tracker/workouts")
def add_workout(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "sleep_activity")
    t = one_of(d.get("type"), "type", defs.WORKOUT_TYPES)
    m = number(d.get("minutes"), "minutes", 1, 600, integer=True)
    cur = conn.execute("INSERT INTO workouts (user_id, date, type, minutes) VALUES (?,?,?,?)", (uid, today_str(), t, m))
    return 201, {"id": cur.lastrowid}


@route("DELETE", "/api/tracker/workouts/(?P<wid>\\d+)")
def del_workout(req):
    req.conn.execute("DELETE FROM workouts WHERE id = ? AND user_id = ?", (int(req.args["wid"]), req.user["id"]))
    return None


# ---------- cycle and symptoms ----------
@route("PUT", "/api/tracker/period")
def put_period(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "cycle_symptoms")
    day = ymd(d.get("date"), not_future=True)
    flow = d.get("flow")
    if flow in (None, "none"):
        conn.execute("DELETE FROM period_days WHERE user_id = ? AND date = ?", (uid, day.isoformat()))
    else:
        conn.execute("INSERT INTO period_days (user_id, date, flow) VALUES (?,?,?) ON CONFLICT(user_id, date) DO UPDATE SET flow = excluded.flow",
                     (uid, day.isoformat(), one_of(flow, "flow", defs.FLOWS)))
    return {"ok": True}


@route("PUT", "/api/tracker/symptoms")
def put_symptoms(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "cycle_symptoms")
    syms = str_list(d.get("symptoms"), "symptoms", allowed=defs.SYMPTOMS)
    tags = str_list(d.get("tags"), "tags", allowed=defs.TAGS)
    if not syms and not tags:
        raise bad("Pick at least one symptom or tag.")
    conn.execute("INSERT INTO symptom_logs (user_id, date, symptoms, tags) VALUES (?,?,?,?) "
                 "ON CONFLICT(user_id, date) DO UPDATE SET symptoms = excluded.symptoms, tags = excluded.tags",
                 (uid, today_str(), json.dumps(syms), json.dumps(tags)))
    return {"ok": True}


# ---------- meals ----------
@route("POST", "/api/tracker/meals")
def add_meal(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "meals_meds")
    src = one_of(d.get("source"), "source", defs.MEAL_SOURCES)
    txt = text(d.get("text"), "text", max_len=120, required=(src != "Skipped")) or ""
    cur = conn.execute("INSERT INTO meals (user_id, date, time, meal_type, source, text) VALUES (?,?,?,?,?,?)",
                       (uid, today_str(), hhmm(d.get("time"), "time"), one_of(d.get("type"), "type", defs.MEAL_TYPES), src, txt))
    return 201, {"id": cur.lastrowid}


@route("DELETE", "/api/tracker/meals/(?P<mid>\\d+)")
def del_meal(req):
    req.conn.execute("DELETE FROM meals WHERE id = ? AND user_id = ?", (int(req.args["mid"]), req.user["id"]))
    return None


# ---------- medicines ----------
@route("POST", "/api/tracker/meds")
def add_med(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "meals_meds")
    cur = conn.execute("INSERT INTO medications (user_id, name, dose, created_at) VALUES (?,?,?,?)",
                       (uid, text(d.get("name"), "name", max_len=60), text(d.get("dose"), "dose", max_len=60, required=False) or "", iso_now()))
    return 201, {"id": cur.lastrowid}


@route("DELETE", "/api/tracker/meds/(?P<mid>\\d+)")
def del_med(req):
    req.conn.execute("DELETE FROM medications WHERE id = ? AND user_id = ?", (int(req.args["mid"]), req.user["id"]))
    return None


@route("PUT", "/api/tracker/meds/(?P<mid>\\d+)/log")
def log_med(req):
    conn, uid = req.conn, req.user["id"]
    mid = int(req.args["mid"])
    if not conn.execute("SELECT 1 FROM medications WHERE id = ? AND user_id = ?", (mid, uid)).fetchone():
        raise ApiError(404, "Not found.")
    status = req.json().get("status")
    if status is None:
        conn.execute("DELETE FROM med_log WHERE med_id = ? AND date = ?", (mid, today_str()))
    else:
        conn.execute("INSERT INTO med_log (med_id, date, status) VALUES (?,?,?) ON CONFLICT(med_id, date) DO UPDATE SET status = excluded.status",
                     (mid, today_str(), one_of(status, "status", ["taken", "missed"])))
    return {"ok": True}


# ---------- stress rating and questionnaires ----------
@route("PUT", "/api/tracker/stress")
def put_stress(req):
    conn, uid = req.conn, req.user["id"]
    store.require_consent(conn, uid, "mental_health")
    v = number(req.json().get("value"), "value", 1, 5, integer=True, required=False)
    _upsert_daily(conn, uid, today_str(), stress=v)
    return {"value": v}


@route("POST", "/api/questionnaires")
def submit_questionnaire(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    store.require_consent(conn, uid, "mental_health")
    kind = one_of(d.get("kind"), "kind", list(defs.QUESTIONNAIRES))
    spec = defs.QUESTIONNAIRES[kind]
    answers = d.get("answers")
    if not isinstance(answers, list) or len(answers) != spec["items"] or any(
            isinstance(a, bool) or not isinstance(a, int) or a < 0 or a > 3 for a in answers):
        raise bad(f"Answer all {spec['items']} questions.", "answers")
    first = conn.execute("SELECT 1 FROM questionnaires WHERE user_id = ? AND kind = ?", (uid, kind)).fetchone() is None
    score = sum(answers)
    conn.execute("INSERT INTO questionnaires (user_id, kind, date, answers, score, is_baseline, created_at) VALUES (?,?,?,?,?,?,?)",
                 (uid, kind, today_str(), json.dumps(answers), score, 1 if first else 0, iso_now()))
    return 201, {"kind": kind, "score": score, "max": spec["max"], "is_baseline": first,
                 "safety": kind == "phq9" and answers[8] > 0}
