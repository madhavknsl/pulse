"""Profile, settings, photo and file uploads, the (simulated) watch, plan and emergency contact."""
import json
import random
import secrets
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import unquote

from server import compute, db, defs, providers, store
from server.api.account import public_user
from server.api.onboarding import consent_view
from server.router import Response, route
from server.util import (ApiError, age_on, bad, email, flag, hhmm, iso_now, number, one_of, phone, str_list, text, ymd)


# ---------- reading ----------
@route("GET", "/api/profile")
def get_profile(req):
    conn, u = req.conn, req.user
    uid = u["id"]
    w, wa = store.latest_measurement(conn, uid, "weight"), store.latest_measurement(conn, uid, "waist")
    base = compute.baseline(conn, uid)
    first, now = compute.hf_first_now(conn, u)
    base["hf"] = {"first": first, "now": now}
    days = conn.execute("SELECT COUNT(*) c FROM daily WHERE user_id = ?", (uid,)).fetchone()["c"]
    links = [{"id": r["provider_id"], "name": providers.BY_ID[r["provider_id"]]["name"], "spec": providers.BY_ID[r["provider_id"]]["spec"],
              "ini": providers.BY_ID[r["provider_id"]]["ini"]}
             for r in conn.execute("SELECT provider_id FROM links WHERE user_id = ?", (uid,)) if r["provider_id"] in providers.BY_ID]
    return {
        "user": public_user(conn, u),
        "body": {"height_cm": u["height_cm"], "weight": dict(w) if w else None, "waist": dict(wa) if wa else None},
        "health": store.health_background(conn, uid),
        "consents": consent_view(conn, uid),
        "baseline": base,
        "notifications": store.get_setting(conn, uid, "notifications", defs.DEFAULT_NOTIFICATIONS),
        "device": store.get_setting(conn, uid, "device", defs.DEFAULT_DEVICE),
        "plan": store.get_setting(conn, uid, "plan", defs.DEFAULT_PLAN),
        "ui": store.get_setting(conn, uid, "ui", defs.DEFAULT_UI),
        "goals": store.goals(conn, uid),
        "emergency": store.get_setting(conn, uid, "emergency", None),
        "links": links,
        "days_tracked": days,
    }


# ---------- writing: personal details ----------
@route("PUT", "/api/profile/personal")
def put_personal(req):
    d, conn, u = req.json(), req.conn, req.user
    first = text(d.get("first_name"), "first_name", max_len=40)
    last = text(d.get("last_name"), "last_name", max_len=40)
    pref = text(d.get("preferred_name"), "preferred_name", max_len=30, required=False) or first
    dob = ymd(d.get("dob"), "dob", not_future=True)
    if age_on(dob) < 18:
        raise bad("Pulse is for adults aged 18 and over.", "dob")
    sex = one_of(d.get("sex"), "sex", defs.SEX)
    city = one_of(d.get("city"), "city", defs.CITIES)
    lang = one_of(d.get("language"), "language", defs.LANGUAGES)
    em, ph = email(d.get("email")), phone(d.get("phone"))
    if conn.execute("SELECT 1 FROM users WHERE email = ? AND id != ?", (em, u["id"])).fetchone():
        raise ApiError(409, "Another account already uses this email.", "email", "email_taken")
    if conn.execute("SELECT 1 FROM users WHERE phone = ? AND id != ?", (ph, u["id"])).fetchone():
        raise ApiError(409, "Another account already uses this mobile number.", "phone", "phone_taken")
    ev = u["email_verified"] if em == u["email"] else 0      # a changed contact needs verifying again
    pv = u["phone_verified"] if ph == u["phone"] else 0
    conn.execute("UPDATE users SET first_name=?, last_name=?, preferred_name=?, dob=?, sex=?, city=?, language=?, email=?, phone=?, "
                 "email_verified=?, phone_verified=? WHERE id=?",
                 (first, last, pref, dob.isoformat(), sex, city, lang, em, ph, ev, pv, u["id"]))
    return {"user": public_user(conn, conn.execute("SELECT * FROM users WHERE id = ?", (u["id"],)).fetchone())}


@route("PUT", "/api/profile/body")
def put_body(req):
    d, conn, u = req.json(), req.conn, req.user
    store.require_consent(conn, u["id"], "health_basics")
    today = date.today().isoformat()
    if d.get("height_cm") is not None:
        conn.execute("UPDATE users SET height_cm = ? WHERE id = ?", (number(d["height_cm"], "height_cm", 100, 230), u["id"]))
    if d.get("sex") is not None:
        conn.execute("UPDATE users SET sex = ? WHERE id = ?", (one_of(d["sex"], "sex", defs.SEX), u["id"]))
    for field, kind, lo, hi in (("weight_kg", "weight", 25, 250), ("waist_cm", "waist", 40, 200)):
        if d.get(field) not in (None, ""):
            conn.execute("INSERT INTO measurements (user_id, date, kind, value) VALUES (?,?,?,?) "
                         "ON CONFLICT(user_id, date, kind) DO UPDATE SET value = excluded.value",
                         (u["id"], today, kind, number(d[field], field, lo, hi)))
    return {"ok": True}


def _clean_conditions(v):
    if not isinstance(v, list) or len(v) > 20:
        raise bad("Expected a short list of conditions.", "conditions")
    out = []
    for c in v:
        if not isinstance(c, dict):
            raise bad("Each condition needs a name.", "conditions")
        year = number(c.get("year"), "year", 1950, date.today().year, integer=True, required=False)
        out.append({"name": text(c.get("name"), "conditions", max_len=60), "year": year})
    return out


@route("PUT", "/api/profile/health")
def put_health(req):
    d, conn, u = req.json(), req.conn, req.user
    store.require_consent(conn, u["id"], "health_basics")
    cur = store.health_background(conn, u["id"])
    if "conditions" in d: cur["conditions"] = _clean_conditions(d["conditions"])
    if "allergies" in d: cur["allergies"] = str_list(d["allergies"], "allergies")
    if "no_allergies" in d: cur["no_allergies"] = flag(d["no_allergies"], "no_allergies")
    if "family" in d: cur["family"] = str_list(d["family"], "family", allowed=defs.FAMILY)
    if "family_none" in d: cur["family_none"] = flag(d["family_none"], "family_none")
    if "diet" in d: cur["diet"] = one_of(d["diet"], "diet", defs.DIETS, required=False)
    if "work" in d: cur["work"] = one_of(d["work"], "work", defs.WORKS, required=False)
    if "work_note" in d: cur["work_note"] = text(d["work_note"], "work_note", max_len=120, required=False) or ""
    if "lifestyle" in d: cur["lifestyle"] = str_list(d["lifestyle"], "lifestyle", allowed=defs.LIFESTYLE_AVAILABLE)
    if "pcos_status" in d: cur["pcos_status"] = one_of(d["pcos_status"], "pcos_status", defs.PCOS_STATUS, required=False)
    if "stress_duration" in d: cur["stress_duration"] = one_of(d["stress_duration"], "stress_duration", defs.STRESS_DURATIONS, required=False)
    if "stress_sources" in d: cur["stress_sources"] = str_list(d["stress_sources"], "stress_sources", allowed=defs.STRESS_SOURCES_AVAILABLE)
    if not cur["no_allergies"] and "allergies" in d and not cur["allergies"]:
        raise bad('Add an allergy, or choose "None known".', "allergies")
    store.set_setting(conn, u["id"], "health_background", cur)
    return {"health": cur}


# ---------- settings ----------
def _time_pair(d, key):
    return {"on": flag(d.get("on"), key), "time": hhmm(d.get("time"), key)}


@route("PUT", "/api/settings/notifications")
def put_notifications(req):
    d = req.json()
    q = d.get("quiet") or {}
    out = {"on": flag(d.get("on"), "on"), "limit": number(d.get("limit"), "limit", 0, 3, integer=True),
           "quiet": {"on": flag(q.get("on"), "quiet"), "from": hhmm(q.get("from"), "quiet"), "to": hhmm(q.get("to"), "quiet")},
           "checkin": _time_pair(d.get("checkin") or {}, "checkin"), "meds": _time_pair(d.get("meds") or {}, "meds"),
           "data": flag(d.get("data"), "data"), "weekly": flag(d.get("weekly"), "weekly"), "neutral": flag(d.get("neutral"), "neutral")}
    if out["quiet"]["from"] == out["quiet"]["to"]:
        raise bad("Quiet hours can't start and end at the same time.", "quiet")
    store.set_setting(req.conn, req.user["id"], "notifications", out)
    return {"notifications": out}


@route("PUT", "/api/settings/ui")
def put_ui(req):
    d = req.json()
    out = {"hide_numbers": flag(d.get("hide_numbers"), "hide_numbers"), "show_bmi": flag(d.get("show_bmi"), "show_bmi")}
    store.set_setting(req.conn, req.user["id"], "ui", out)
    return {"ui": out}


@route("PUT", "/api/settings/goals")
def put_goals(req):
    d = req.json()
    out = {"sleep_h": number(d.get("sleep_h"), "sleep_h", 4, 12), "steps": number(d.get("steps"), "steps", 500, 40000, integer=True),
           "weight_kg": number(d.get("weight_kg"), "weight_kg", 25, 250, required=False)}
    store.set_setting(req.conn, req.user["id"], "goals", out)
    return {"goals": out}


@route("PUT", "/api/emergency")
def put_emergency(req):
    d = req.json()
    if not flag(d.get("consent"), "consent"):
        raise bad("Please confirm this person can be contacted if you ask for urgent help.", "consent")
    out = {"name": text(d.get("name"), "name", max_len=60), "relation": text(d.get("relation"), "relation", max_len=40, required=False) or "",
           "phone": phone(d.get("phone")), "consent": True, "alert_doctor": flag(d.get("alert_doctor", False), "alert_doctor")}
    store.set_setting(req.conn, req.user["id"], "emergency", out)
    store.log_access(req.conn, req.user["id"], "You saved an emergency contact")
    return {"emergency": out}


@route("DELETE", "/api/emergency")
def delete_emergency(req):
    req.conn.execute("DELETE FROM user_settings WHERE user_id = ? AND key = 'emergency'", (req.user["id"],))
    return None


# ---------- the (simulated) watch ----------
def _simulate_day(uid, d, today_fraction=1.0):
    r = random.Random(f"{uid}:{d.isoformat()}")
    weekend = d.weekday() >= 5
    steps = max(900, int(r.gauss(5800 + (900 if weekend else 0), 1200) * today_fraction))
    return {"steps": int(round(steps / 10) * 10), "rhr": int(round(r.gauss(75, 2))), "hrv": int(round(r.gauss(40, 4))),
            "spo2_avg": round(_clip(r.gauss(96, 0.5), 94, 99), 1), "spo2_min": int(round(_clip(r.gauss(93, 1), 88, 96))),
            "sleep_min": int(round(_clip(r.gauss(6.2, 0.7), 4, 9) * 60)), "bed_min": int(round(r.gauss(40, 45)))}


def _clip(v, lo, hi):
    return max(lo, min(hi, v))


@route("POST", "/api/device/connect")
def device_connect(req):
    store.require_consent(req.conn, req.user["id"], "wearable")
    dev = store.get_setting(req.conn, req.user["id"], "device", defs.DEFAULT_DEVICE)
    dev["connected"] = True
    store.set_setting(req.conn, req.user["id"], "device", dev)
    return _sync(req, dev)


@route("POST", "/api/device/disconnect")
def device_disconnect(req):
    dev = store.get_setting(req.conn, req.user["id"], "device", defs.DEFAULT_DEVICE)
    dev["connected"] = False
    store.set_setting(req.conn, req.user["id"], "device", dev)
    return {"device": dev}


@route("PUT", "/api/device/perms")
def device_perms(req):
    d = req.json().get("perms") or {}
    dev = store.get_setting(req.conn, req.user["id"], "device", defs.DEFAULT_DEVICE)
    for k in ("steps", "hr", "spo2", "sleep"):
        if k in d:
            dev["perms"][k] = flag(d[k], k)
    store.set_setting(req.conn, req.user["id"], "device", dev)
    return {"device": dev}


@route("POST", "/api/device/sync")
def device_sync(req):
    store.require_consent(req.conn, req.user["id"], "wearable")
    dev = store.get_setting(req.conn, req.user["id"], "device", defs.DEFAULT_DEVICE)
    if not dev["connected"]:
        raise ApiError(409, "Connect the watch first.", code="not_connected")
    return _sync(req, dev)


def _sync(req, dev):
    """Fill in simulated readings for days that have none. Real values the person typed are never overwritten."""
    conn, uid = req.conn, req.user["id"]
    today = date.today()
    first_time = dev.get("last_sync") is None
    start = today - timedelta(days=13 if first_time else 3)
    now = datetime.now()
    for i in range((today - start).days + 1):
        d = start + timedelta(days=i)
        frac = max(0.15, min(1.0, (now.hour * 60 + now.minute) / 1200)) if d == today else 1.0
        v = _simulate_day(uid, d, frac)
        perms = dev["perms"]
        conn.execute("INSERT OR IGNORE INTO daily (user_id, date) VALUES (?,?)", (uid, d.isoformat()))
        sets, vals = [], []
        for col, perm in (("steps", "steps"), ("rhr", "hr"), ("hrv", "hr"), ("spo2_avg", "spo2"), ("spo2_min", "spo2"),
                          ("sleep_min", "sleep"), ("bed_min", "sleep")):
            if perms.get(perm):
                sets.append(f"{col} = COALESCE({col}, ?)" if col not in ("steps",) or d != today else "steps = ?")
                vals.append(v[col])
        if sets:
            conn.execute(f"UPDATE daily SET {', '.join(sets)} WHERE user_id = ? AND date = ?", (*vals, uid, d.isoformat()))
    dev["last_sync"] = iso_now()
    store.set_setting(conn, uid, "device", dev)
    return {"device": dev}


# ---------- plan ----------
@route("POST", "/api/plan/cancel")
def plan_cancel(req):
    p = store.get_setting(req.conn, req.user["id"], "plan", defs.DEFAULT_PLAN)
    p["status"] = "cancelled"
    store.set_setting(req.conn, req.user["id"], "plan", p)
    return {"plan": p}


@route("POST", "/api/plan/resume")
def plan_resume(req):
    p = store.get_setting(req.conn, req.user["id"], "plan", defs.DEFAULT_PLAN)
    p["status"] = "active"
    store.set_setting(req.conn, req.user["id"], "plan", p)
    return {"plan": p}


# ---------- files: profile photo and lab reports ----------
def _sniff(body):
    if body[:8] == b"\x89PNG\r\n\x1a\n": return "image/png", ".png"
    if body[:3] == b"\xff\xd8\xff": return "image/jpeg", ".jpg"
    if body[:4] == b"RIFF" and body[8:12] == b"WEBP": return "image/webp", ".webp"
    if body[:5] == b"%PDF-": return "application/pdf", ".pdf"
    return None, None


def _remove_file(conn, file_id, uid):
    row = conn.execute("SELECT path FROM files WHERE id = ? AND user_id = ?", (file_id, uid)).fetchone()
    if row:
        try:
            Path(row["path"]).unlink(missing_ok=True)
        except OSError:
            pass
        conn.execute("DELETE FROM files WHERE id = ? AND user_id = ?", (file_id, uid))


@route("POST", "/api/files")
def upload(req):
    conn, u = req.conn, req.user
    kind = one_of(req.query.get("kind"), "kind", ["photo", "report"])
    body = req.body
    if not body:
        raise bad("No file was received.")
    mime, ext = _sniff(body)
    if mime is None or (kind == "photo" and mime == "application/pdf"):
        raise bad("Upload a PNG, JPEG or WebP image" + (" or a PDF." if kind == "report" else "."))
    if kind == "photo" and len(body) > 5_000_000:
        raise bad("That photo is over 5 MB. Choose a smaller one.")
    name = unquote(req.headers.get("X-Filename") or "file")
    name = Path(name.replace("\\", "/")).name[:100] or "file"
    folder = db.UPLOAD_DIR / str(u["id"])
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (secrets.token_hex(16) + ext)
    path.write_bytes(body)
    cur = conn.execute("INSERT INTO files (user_id, kind, original_name, mime, path, size, created_at) VALUES (?,?,?,?,?,?,?)",
                       (u["id"], kind, name, mime, str(path), len(body), iso_now()))
    fid = cur.lastrowid
    if kind == "photo":
        if u["photo_file_id"]:
            _remove_file(conn, u["photo_file_id"], u["id"])
        conn.execute("UPDATE users SET photo_file_id = ? WHERE id = ?", (fid, u["id"]))
    return 201, {"id": fid, "url": f"/api/files/{fid}", "name": name}


@route("GET", "/api/files/(?P<fid>\\d+)")
def get_file(req):
    row = req.conn.execute("SELECT * FROM files WHERE id = ? AND user_id = ?", (int(req.args["fid"]), req.user["id"])).fetchone()
    if row is None:
        raise ApiError(404, "Not found.")
    try:
        data = Path(row["path"]).read_bytes()
    except OSError:
        raise ApiError(404, "Not found.")
    headers = [("Content-Disposition", "inline"), ("Content-Security-Policy", "sandbox"), ("Cache-Control", "private, max-age=60")]
    return Response(data, content_type=row["mime"], headers=headers)


@route("DELETE", "/api/profile/photo")
def delete_photo(req):
    u = req.user
    if u["photo_file_id"]:
        conn = req.conn
        conn.execute("UPDATE users SET photo_file_id = NULL WHERE id = ?", (u["id"],))
        _remove_file(conn, u["photo_file_id"], u["id"])
    return None
