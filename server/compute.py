"""Calculations from a person's own data: Health Factor, patterns and the pre-visit summary.

The Health Factor (v0) blends validated and tracked signals. The mind side uses only validated questionnaires
(PHQ-9 and GAD-7): the daily mood check-in is self-rated, so it is kept out of the score. It is a summary for the person
and their doctor, not a diagnosis. Weights are written down here so they can be defended and changed in one place.
"""
import json
import math
from datetime import date, timedelta

from server import defs, store

W_MIND = {"phq9": 0.60, "gad7": 0.40}
W_BODY = {"sleep": 0.35, "activity": 0.35, "cycle": 0.30}
W_TOP = {"mind": 0.5, "body": 0.5}


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _sd(xs):
    xs = [x for x in xs if x is not None]
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _weighted(parts, weights):
    num = den = 0.0
    for k, w in weights.items():
        if parts.get(k) is not None:
            num += parts[k] * w
            den += w
    return num / den if den else None


class Ctx:
    """Everything the Health Factor needs, loaded once for a range of days."""

    def __init__(self, conn, uid, start, end):
        self.daily = {r["date"]: r for r in conn.execute(
            "SELECT * FROM daily WHERE user_id = ? AND date BETWEEN ? AND ?",
            (uid, (start - timedelta(days=7)).isoformat(), end.isoformat()))}
        self.starts = period_starts(conn, uid)
        self.q = {"phq9": [], "gad7": []}
        for r in conn.execute("SELECT kind, date, score FROM questionnaires WHERE user_id = ? ORDER BY date, id", (uid,)):
            self.q[r["kind"]].append((r["date"], r["score"]))
        self.steps_goal = store.goals(conn, uid).get("steps") or 7000

    def latest_q(self, kind, day):
        best = None
        for d, score in self.q[kind]:
            if d <= day.isoformat():
                best = score
        return best

    def cycle_len(self, day):
        starts = [s for s in self.starts if s <= day]
        return (starts[-1] - starts[-2]).days if len(starts) >= 2 else None


def period_starts(conn, uid):
    starts, prev = [], None
    for r in conn.execute("SELECT date FROM period_days WHERE user_id = ? ORDER BY date", (uid,)):
        d = date.fromisoformat(r["date"])
        if prev is None or (d - prev).days > 1:
            starts.append(d)
        prev = d
    return starts


def hf(ctx, day):
    win = [(day - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    rows = [ctx.daily.get(k) for k in win]
    sleeps = [r["sleep_min"] / 60 for r in rows if r and r["sleep_min"] is not None]
    steps = [r["steps"] for r in rows if r and r["steps"] is not None]
    parts = {}
    for kind in ("phq9", "gad7"):
        score = ctx.latest_q(kind, day)
        parts[kind] = None if score is None else 100 * (1 - score / defs.QUESTIONNAIRES[kind]["max"])
    parts["sleep"] = _clamp(_mean(sleeps) / 8 * 100 - min(15, _sd(sleeps) * 8), 0, 100) if sleeps else None
    parts["activity"] = _clamp(_mean(steps) / ctx.steps_goal * 100, 0, 100) if steps else None
    length = ctx.cycle_len(day)
    parts["cycle"] = None if length is None else (100 if 21 <= length <= 35 else max(30, 100 - 5 * ((length - 35) if length > 35 else (21 - length))))
    mind, body = _weighted(parts, W_MIND), _weighted(parts, W_BODY)
    total = _weighted({"mind": mind, "body": body}, W_TOP)
    r = lambda v: None if v is None else int(round(v))
    return {"total": r(total), "mind": r(mind), "body": r(body)}


def hf_series(conn, user, n):
    """Health Factor for each of the last n days. None before the person had any data."""
    today = date.today()
    ctx = Ctx(conn, user["id"], today - timedelta(days=n), today)
    created = date.fromisoformat(user["created_at"][:10])
    out = []
    for i in range(n - 1, -1, -1):
        d = today - timedelta(days=i)
        out.append(None if d < created else hf(ctx, d)["total"])
    return out


def checkin_days(conn, uid, n=30):
    start = (date.today() - timedelta(days=n - 1)).isoformat()
    have = {r["date"] for r in conn.execute(
        "SELECT date FROM daily WHERE user_id = ? AND date >= ? AND (mood IS NOT NULL OR mood_note IS NOT NULL)", (uid, start))}
    return [(date.today() - timedelta(days=i)).isoformat() in have for i in range(n - 1, -1, -1)]


# ---------- observational patterns (never advice) ----------
def patterns(conn, uid):
    since = (date.today() - timedelta(days=90)).isoformat()
    rows = conn.execute("SELECT date, steps, sleep_min, mood FROM daily WHERE user_id = ? AND date >= ? ORDER BY date",
                        (uid, since)).fetchall()
    out = []
    pairs = [(r["sleep_min"] / 60, r["mood"]) for r in rows if r["sleep_min"] is not None and r["mood"] is not None]
    short, good = [m for s, m in pairs if s < 6.5], [m for s, m in pairs if s >= 7]
    if len(short) >= 4 and len(good) >= 4 and _mean(good) - _mean(short) >= 0.5:
        out.append(f"After nights under 6.5 hours of sleep, mood averaged {_mean(short):.1f} out of 5 ({len(short)} days). "
                   f"After 7 hours or more it averaged {_mean(good):.1f} ({len(good)} days).")
    goal = store.goals(conn, uid).get("steps") or 7000
    by_date = {r["date"]: r for r in rows}
    hi, lo = [], []
    for r in rows:
        prev = by_date.get((date.fromisoformat(r["date"]) - timedelta(days=1)).isoformat())
        if prev and prev["steps"] is not None and r["mood"] is not None:
            (hi if prev["steps"] >= goal * 0.85 else lo if prev["steps"] < goal * 0.65 else []).append(r["mood"])
    if len(hi) >= 4 and len(lo) >= 4 and _mean(hi) - _mean(lo) >= 0.4:
        out.append(f"After days with {round(goal * 0.85 / 100) * 100:,}+ steps, next-day mood averaged {_mean(hi):.1f}; "
                   f"after days under {round(goal * 0.65 / 100) * 100:,} steps it averaged {_mean(lo):.1f}.")
    return out


# ---------- baseline snapshot ----------
def baseline(conn, uid):
    out = {}
    for kind in ("phq9", "gad7"):
        first = conn.execute("SELECT score, date FROM questionnaires WHERE user_id = ? AND kind = ? ORDER BY date, id LIMIT 1", (uid, kind)).fetchone()
        last = conn.execute("SELECT score, date FROM questionnaires WHERE user_id = ? AND kind = ? ORDER BY date DESC, id DESC LIMIT 1", (uid, kind)).fetchone()
        out[kind] = {"first": first["score"] if first else None, "now": last["score"] if last else None,
                     "first_date": first["date"] if first else None}
    w = conn.execute("SELECT value, date FROM measurements WHERE user_id = ? AND kind = 'weight' ORDER BY date LIMIT 1", (uid,)).fetchone()
    wn = store.latest_measurement(conn, uid, "weight")
    out["weight"] = {"first": w["value"] if w else None, "now": wn["value"] if wn else None}
    return out


def hf_first_now(conn, user):
    """Health Factor on the first day there was enough to compute it, and today."""
    today = date.today()
    created = date.fromisoformat(user["created_at"][:10])
    ctx = Ctx(conn, user["id"], created, today)
    first = hf(ctx, created)["total"]
    return first, hf(ctx, today)["total"]


# ---------- pre-visit summary (what a doctor would be shown) ----------
def build_summary(conn, user, provider, link):
    uid, share = user["id"], link["share"]
    today = date.today()
    d30 = (today - timedelta(days=30)).isoformat()
    d90 = (today - timedelta(days=90)).isoformat()
    d7 = (today - timedelta(days=7)).isoformat()
    s = {"patient": {"name": f"{user['first_name']} {user['last_name'][:1]}.", "city": user["city"]},
         "provider": {"id": provider["id"], "name": provider["name"]},
         "period_to": today.isoformat(), "sections": {}}
    from server.util import age_on
    s["patient"]["age"] = age_on(date.fromisoformat(user["dob"]))

    def section(key, ok, fn):
        s["sections"][key] = fn() if ok else None

    if share.get("mood") and share.get("sleep") and share.get("activity") and share.get("cycle"):
        first, now = hf_first_now(conn, user)
        s["sections"]["overall"] = {"first": first, "now": now}
    else:
        s["sections"]["overall"] = None

    def mind():
        b = baseline(conn, uid)
        moods = [r["mood"] for r in conn.execute("SELECT mood FROM daily WHERE user_id = ? AND date >= ? AND mood IS NOT NULL", (uid, d7))]
        return {"phq9": b["phq9"], "gad7": b["gad7"], "mood7": _mean(moods)}
    section("mind", share.get("mood"), mind)

    def body_sa():
        rows = conn.execute("SELECT * FROM daily WHERE user_id = ? AND date >= ?", (uid, d30)).fetchall()
        wo = conn.execute("SELECT COUNT(*) c FROM workouts WHERE user_id = ? AND date >= ?", (uid, (today - timedelta(days=28)).isoformat())).fetchone()["c"]
        sl = _mean([r["sleep_min"] for r in rows])
        return {"sleep_min": None if sl is None else int(round(sl)),
                "steps": None if not rows else (None if _mean([r["steps"] for r in rows]) is None else int(round(_mean([r["steps"] for r in rows])))),
                "workouts_per_week": round(wo / 4, 1)}
    section("sleep_activity", share.get("sleep") and share.get("activity"), body_sa)

    def cycle():
        starts = period_starts(conn, uid)
        lens = [(starts[i] - starts[i - 1]).days for i in range(1, len(starts))][-2:]
        counts = {}
        for r in conn.execute("SELECT symptoms FROM symptom_logs WHERE user_id = ? AND date >= ?", (uid, d30)):
            for sym in json.loads(r["symptoms"]):
                counts[sym] = counts.get(sym, 0) + 1
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:3]
        return {"cycle_lengths": lens, "symptoms": [{"name": k, "days": v} for k, v in top]}
    section("cycle", share.get("cycle"), cycle)

    def weight():
        first = conn.execute("SELECT value, date FROM measurements WHERE user_id = ? AND kind = 'weight' AND date >= ? ORDER BY date LIMIT 1", (uid, d90)).fetchone()
        last = store.latest_measurement(conn, uid, "weight")
        waist = store.latest_measurement(conn, uid, "waist")
        return {"first": first["value"] if first else None, "now": last["value"] if last else None,
                "waist": waist["value"] if waist else None, "waist_date": waist["date"] if waist else None}
    section("weight", share.get("weight"), weight)

    def meds():
        row = conn.execute(
            "SELECT SUM(l.status = 'taken') t, COUNT(*) n FROM med_log l JOIN medications m ON m.id = l.med_id "
            "WHERE m.user_id = ? AND l.date >= ?", (uid, d30)).fetchone()
        return {"adherence_pct": None if not row["n"] else int(round(100 * row["t"] / row["n"]))}
    section("meds", share.get("meds"), meds)

    def meals():
        rows = conn.execute("SELECT * FROM meals WHERE user_id = ? AND date >= ?", (uid, d7)).fetchall()
        return {"total": len(rows), "ordered": sum(1 for r in rows if r["source"] == "Ordered in"),
                "late_dinners": sum(1 for r in rows if r["meal_type"] == "Dinner" and r["time"] >= "22:00")}
    section("meals", share.get("meals"), meals)

    def labs():
        out = []
        for tkey, tdef in defs.TESTS.items():
            for aname, unit in tdef["analytes"]:
                best = None
                for r in conn.execute("SELECT * FROM results WHERE user_id = ? AND test_key = ? ORDER BY date, id", (uid, tkey)):
                    vals = json.loads(r["vals"])
                    if aname in vals:
                        best = {"name": aname, "unit": unit, "value": vals[aname], "date": r["date"],
                                "range": json.loads(r["ranges"]).get(aname)}
                if best:
                    out.append(best)
        return out
    section("labs", share.get("labs"), labs)

    s["sections"]["patterns"] = patterns(conn, uid) if share.get("mood") and share.get("sleep") else None
    s["questions"] = [r["text"] for r in conn.execute("SELECT text FROM questions WHERE user_id = ? ORDER BY id", (uid,))]
    return s
