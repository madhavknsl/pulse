"""The home dashboard: Health Factor over time, the 30-day check-in calendar, and today's check-in."""
from server import compute, store
from server.api.account import public_user
from server.router import route
from server.util import bad, iso_now, number, text, today_str


def _today(conn, uid):
    r = conn.execute("SELECT mood, mood_note FROM daily WHERE user_id = ? AND date = ?", (uid, today_str())).fetchone()
    return {"mood": r["mood"] if r else None, "note": r["mood_note"] if r else None}


@route("GET", "/api/home")
def home(req):
    conn, u = req.conn, req.user
    series = compute.hf_series(conn, u, 90)
    current = next((v for v in reversed(series) if v is not None), None)
    return {
        "user": public_user(conn, u),
        "hf": {"now": current, "series90": series, "series21": series[-21:]},
        "checkins": compute.checkin_days(conn, u["id"], 30),
        "today": _today(conn, u["id"]),
        "consents": store.consents(conn, u["id"]),
    }


@route("POST", "/api/checkins")
def checkin(req):
    d, conn, uid = req.json(), req.conn, req.user["id"]
    mood = number(d.get("mood"), "mood", 1, 5, integer=True, required=False)
    note = text(d.get("note"), "note", max_len=1000, required=False)
    if mood is None and note is None:
        raise bad("Pick how you feel or write a few words.")
    store.require_consent(conn, uid, "mental_health")
    today = today_str()
    conn.execute("INSERT OR IGNORE INTO daily (user_id, date) VALUES (?,?)", (uid, today))
    conn.execute("UPDATE daily SET mood = COALESCE(?, mood), mood_note = COALESCE(?, mood_note), mood_at = ? WHERE user_id = ? AND date = ?",
                 (mood, note, iso_now(), uid, today))
    return {"today": _today(conn, uid), "checkins": compute.checkin_days(conn, uid, 30), "support": bool(mood and mood <= 2)}
