"""Registration onboarding: progress, consents and finishing. Other steps reuse the profile/healthcare endpoints."""
import json
from datetime import date, timedelta

from server import defs, store
from server.api.account import public_user
from server.router import route
from server.util import ApiError, bad, flag, iso_now, number


def consent_view(conn, uid):
    have = {r["kind"]: r for r in conn.execute("SELECT * FROM consents WHERE user_id = ?", (uid,))}
    return {k: (None if k not in have else bool(have[k]["granted"])) for k in defs.CONSENT_KINDS}


def _latest_q(conn, uid, kind):
    r = conn.execute("SELECT score, date FROM questionnaires WHERE user_id = ? AND kind = ? ORDER BY date DESC, id DESC LIMIT 1", (uid, kind)).fetchone()
    return {"score": r["score"], "date": r["date"]} if r else None


@route("GET", "/api/onboarding")
def get_onboarding(req):
    conn, u = req.conn, req.user
    uid = u["id"]
    w, wa = store.latest_measurement(conn, uid, "weight"), store.latest_measurement(conn, uid, "waist")
    return {
        "user": public_user(conn, u),
        "step": u["onboarding_step"],
        "consents": consent_view(conn, uid),
        "body": {"height_cm": u["height_cm"], "sex": u["sex"], "weight_kg": w["value"] if w else None, "waist_cm": wa["value"] if wa else None},
        "health": store.health_background(conn, uid),
        "questionnaires": {"phq9": _latest_q(conn, uid, "phq9"), "gad7": _latest_q(conn, uid, "gad7")},
        "links": [r["provider_id"] for r in conn.execute("SELECT provider_id FROM links WHERE user_id = ?", (uid,))],
        "invites": [r["email"] for r in conn.execute("SELECT email FROM invites WHERE user_id = ?", (uid,))],
        "goals": store.goals(conn, uid),
        "notifications": store.get_setting(conn, uid, "notifications", defs.DEFAULT_NOTIFICATIONS),
        "emergency": store.get_setting(conn, uid, "emergency", None),
    }


@route("PUT", "/api/onboarding/step")
def set_step(req):
    step = number(req.json().get("step"), "step", 1, 9, integer=True)
    if not req.user["onboarded_at"]:
        req.conn.execute("UPDATE users SET onboarding_step = ? WHERE id = ?", (step, req.user["id"]))
    return {"step": step}


@route("GET", "/api/consents")
def get_consents(req):
    return {"consents": consent_view(req.conn, req.user["id"])}


@route("PUT", "/api/consents")
def put_consents(req):
    d = req.json().get("consents")
    if not isinstance(d, dict) or not d:
        raise bad("Send the consents to save.")
    conn, uid = req.conn, req.user["id"]
    current = consent_view(conn, uid)
    for kind, val in d.items():
        if kind not in defs.CONSENT_KINDS:
            raise bad("Unknown kind of consent.", kind)
        flag(val, kind)
        if not val and kind in defs.CONSENT_REQUIRED and req.user["onboarded_at"] and current.get(kind):
            raise bad("This one is needed to use Pulse. To remove it, delete your data from Healthcare > Sharing & privacy.", kind)
        conn.execute(
            "INSERT INTO consents (user_id, kind, granted, version, at) VALUES (?,?,?,?,?) "
            "ON CONFLICT(user_id, kind) DO UPDATE SET granted = excluded.granted, version = excluded.version, at = excluded.at",
            (uid, kind, 1 if val else 0, defs.CONSENT_VERSION, iso_now()))
        if req.user["onboarded_at"] and current.get(kind) != val:
            store.log_access(conn, uid, f"You {'agreed to' if val else 'withdrew'} consent: {kind.replace('_', ' ')}")
    return {"consents": consent_view(conn, uid)}


@route("POST", "/api/onboarding/complete")
def complete(req):
    conn, u = req.conn, req.user
    uid = u["id"]
    c = consent_view(conn, uid)
    for k in defs.CONSENT_REQUIRED:
        if not c.get(k):
            raise ApiError(422, "Please agree to the required items first.", code="consent_missing")
    w = store.latest_measurement(conn, uid, "weight")
    if not u["height_cm"] or not w:
        raise ApiError(422, "Please add your height and weight first.", code="body_missing")
    if not u["onboarded_at"]:
        conn.execute("UPDATE users SET onboarded_at = ?, onboarding_step = 9 WHERE id = ?", (iso_now(), uid))
        plan = store.get_setting(conn, uid, "plan", defs.DEFAULT_PLAN)
        plan["renews"] = (date.today() + timedelta(days=30)).isoformat()
        store.set_setting(conn, uid, "plan", plan)
        store.log_access(conn, uid, "You joined Pulse and chose what to share")
    return {"ok": True}
