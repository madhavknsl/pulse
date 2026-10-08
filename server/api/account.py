"""Accounts: register, sign in/out, verification, waitlist, and the person's right to export or delete their data."""
import json
from datetime import date, timedelta

from server import defs, security, store
from server.router import Response, route
from server.util import ApiError, age_on, bad, email, iso_now, one_of, phone, text, ymd


def public_user(conn, u):
    photo = f"/api/files/{u['photo_file_id']}" if u["photo_file_id"] else None
    first, last = u["first_name"], u["last_name"]
    return {
        "id": u["id"], "first_name": first, "last_name": last, "preferred_name": u["preferred_name"] or first,
        "initials": (first[:1] + last[:1]).upper(), "email": u["email"], "phone": u["phone"],
        "email_verified": bool(u["email_verified"]), "phone_verified": bool(u["phone_verified"]),
        "dob": u["dob"], "age": age_on(date.fromisoformat(u["dob"])), "sex": u["sex"], "city": u["city"],
        "language": u["language"], "height_cm": u["height_cm"], "photo": photo,
        "created_at": u["created_at"], "onboarded": bool(u["onboarded_at"]), "onboarding_step": u["onboarding_step"],
        "is_demo": bool(u["is_demo"]),
    }


def _new_defaults(conn, uid):
    store.set_setting(conn, uid, "notifications", defs.DEFAULT_NOTIFICATIONS)
    store.set_setting(conn, uid, "goals", defs.DEFAULT_GOALS)
    store.set_setting(conn, uid, "device", defs.DEFAULT_DEVICE)
    store.set_setting(conn, uid, "ui", defs.DEFAULT_UI)
    plan = dict(defs.DEFAULT_PLAN, renews=(date.today() + timedelta(days=30)).isoformat())
    store.set_setting(conn, uid, "plan", plan)


@route("GET", "/api/meta", auth=False)
def meta(req):
    return {"cities": defs.CITIES, "launch_city": defs.CITY_LAUNCH, "sex": defs.SEX, "languages": defs.LANGUAGES,
            "lifestyle_available": defs.LIFESTYLE_AVAILABLE, "stress_sources_available": defs.STRESS_SOURCES_AVAILABLE,
            "stress_durations": defs.STRESS_DURATIONS, "pcos_status": defs.PCOS_STATUS, "consent_kinds": defs.CONSENT_KINDS,
            "consent_required": defs.CONSENT_REQUIRED, "share_keys": defs.SHARE_KEYS, "expiry": defs.EXPIRY,
            "share_labels": defs.SHARE_LABELS}


@route("POST", "/api/auth/register", auth=False)
def register(req):
    d = req.json()
    if security.throttled(f"reg:{req.ip}", limit=15, window=3600):
        raise ApiError(429, "Too many sign-ups from this device. Please try again later.")
    first = text(d.get("first_name"), "first_name", max_len=40)
    last = text(d.get("last_name"), "last_name", max_len=40)
    em = email(d.get("email"))
    ph = phone(d.get("phone"))
    pw = d.get("password")
    err = security.check_password_strength(pw)
    if err:
        raise bad(err, "password")
    dob = ymd(d.get("dob"), "dob", not_future=True)
    if age_on(dob) < 18:
        raise bad("Pulse is for adults aged 18 and over.", "dob")
    city = one_of(d.get("city"), "city", defs.CITIES)
    if city != defs.CITY_LAUNCH:
        raise ApiError(409, "Pulse is starting in Bengaluru. Join the waitlist and we will tell you when we reach your city.",
                       "city", "city_unavailable")
    conn = req.conn
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (em,)).fetchone():
        raise ApiError(409, "An account with this email already exists. Try signing in.", "email", "email_taken")
    if conn.execute("SELECT 1 FROM users WHERE phone = ?", (ph,)).fetchone():
        raise ApiError(409, "An account with this mobile number already exists. Try signing in.", "phone", "phone_taken")
    security.record_failure(f"reg:{req.ip}")  # counts every sign-up toward the hourly limit
    cur = conn.execute(
        "INSERT INTO users (email, phone, password_hash, first_name, last_name, preferred_name, dob, city, language, created_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        (em, ph, security.hash_password(pw), first, last, first, dob.isoformat(), city, "English", iso_now()))
    uid = cur.lastrowid
    _new_defaults(conn, uid)
    req.set_cookie = security.session_cookie(security.new_session(conn, uid))
    user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return 201, {"user": public_user(conn, user)}


@route("POST", "/api/auth/verify")
def verify(req):
    d = req.json()
    kind = one_of(d.get("kind"), "kind", ["email", "phone"])
    code = text(d.get("code"), "code", max_len=6)
    if not (len(code) == 6 and code.isdigit()):
        raise bad("Enter the 6-digit code.", "code")
    # Demo: no message is actually sent, so any 6 digits are accepted.
    req.conn.execute(f"UPDATE users SET {kind}_verified = 1 WHERE id = ?", (req.user["id"],))
    return {"verified": kind}


@route("POST", "/api/auth/login", auth=False)
def login(req):
    d = req.json()
    ident = text(d.get("identity"), "identity", max_len=254)
    pw = d.get("password")
    if not isinstance(pw, str) or not pw:
        raise bad("Enter your password.", "password")
    key = f"login:{req.ip}:{ident.lower()}"
    if security.throttled(key):
        raise ApiError(429, "Too many attempts. Please wait a few minutes and try again.", code="throttled")
    digits = ident.replace(" ", "").replace("-", "")
    if digits.startswith("+91"):
        digits = digits[3:]
    conn = req.conn
    u = conn.execute("SELECT * FROM users WHERE email = ? OR phone = ?", (ident.lower(), digits)).fetchone()
    if u is None:
        security.burn_time(pw)
    if u is None or not security.verify_password(pw, u["password_hash"]):
        security.record_failure(key)
        raise ApiError(401, "That email or mobile number and password don't match.", code="bad_credentials")
    security.clear_failures(key)
    req.set_cookie = security.session_cookie(security.new_session(conn, u["id"]))
    return {"user": public_user(conn, u), "next": "home" if u["onboarded_at"] else "onboarding"}


@route("POST", "/api/auth/logout")
def logout(req):
    security.end_session(req.conn, req.token)
    req.set_cookie = security.clear_cookie()
    return None


@route("GET", "/api/me")
def me(req):
    return {"user": public_user(req.conn, req.user)}


@route("POST", "/api/waitlist", auth=False)
def waitlist(req):
    d = req.json()
    em = email(d.get("email"))
    city = text(d.get("city"), "city", max_len=60)
    req.conn.execute("INSERT OR IGNORE INTO waitlist (email, city, created_at) VALUES (?,?,?)", (em, city, iso_now()))
    return 201, {"message": "You're on the list. We'll email you when Pulse reaches your city."}


# ---------- the right to a copy, and to deletion ----------
_EXPORT_TABLES = ["measurements", "daily", "period_days", "symptom_logs", "meals", "medications", "workouts", "questionnaires",
                  "appointments", "links", "access_log", "tests", "results", "questions", "summary_shares", "diet_log", "invites",
                  "consents", "user_settings", "journal_checks", "alerts"]


@route("GET", "/api/data/export")
def export(req):
    conn, u = req.conn, req.user
    out = {"exported_at": iso_now(), "account": {k: u[k] for k in ("first_name", "last_name", "preferred_name", "email", "phone", "dob",
                                                                    "sex", "city", "language", "height_cm", "created_at")}}
    for t in _EXPORT_TABLES:
        out[t] = [dict(r) for r in conn.execute(f"SELECT * FROM {t} WHERE user_id = ?", (u["id"],))]
    out["med_log"] = [dict(r) for r in conn.execute(
        "SELECT l.* FROM med_log l JOIN medications m ON m.id = l.med_id WHERE m.user_id = ?", (u["id"],))]
    out["files"] = [{k: r[k] for k in ("id", "kind", "original_name", "mime", "size", "created_at")}
                    for r in conn.execute("SELECT * FROM files WHERE user_id = ?", (u["id"],))]
    body = json.dumps(out, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    return Response(body, headers=[("Content-Disposition", 'attachment; filename="my-pulse-data.json"')])


@route("POST", "/api/data/delete")
def delete_account(req):
    d = req.json()
    pw = d.get("password")
    if not isinstance(pw, str) or not security.verify_password(pw, req.user["password_hash"]):
        raise ApiError(403, "That password is not right.", "password", "bad_password")
    uid = req.user["id"]
    store.delete_files_on_disk(req.conn, uid)
    req.conn.execute("DELETE FROM users WHERE id = ?", (uid,))   # everything else cascades
    req.set_cookie = security.clear_cookie()
    return None
