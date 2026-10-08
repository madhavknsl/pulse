"""Small shared database helpers used by several API modules."""
import copy
import json

from server import defs
from server.util import ApiError, iso_now


def get_setting(conn, uid, key, default=None):
    row = conn.execute("SELECT value FROM user_settings WHERE user_id = ? AND key = ?", (uid, key)).fetchone()
    return json.loads(row["value"]) if row else copy.deepcopy(default)


def set_setting(conn, uid, key, value):
    conn.execute(
        "INSERT INTO user_settings (user_id, key, value) VALUES (?,?,?) "
        "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
        (uid, key, json.dumps(value, ensure_ascii=False)))


def consents(conn, uid):
    return {r["kind"]: bool(r["granted"]) for r in conn.execute("SELECT kind, granted FROM consents WHERE user_id = ?", (uid,))}


def require_consent(conn, uid, kind):
    if not consents(conn, uid).get(kind):
        raise ApiError(403, "You haven't agreed to this kind of data being collected. You can change that in your profile.",
                       code="consent_required")


def log_access(conn, uid, text):
    conn.execute("INSERT INTO access_log (user_id, at, text) VALUES (?,?,?)", (uid, iso_now(), text))


def health_background(conn, uid):
    return get_setting(conn, uid, "health_background", {
        "conditions": [], "allergies": [], "no_allergies": True, "family": [], "family_none": False,
        "diet": None, "work": None, "work_note": "", "lifestyle": [],
        "pcos_status": None, "stress_duration": None, "stress_sources": [],
    })


def goals(conn, uid):
    return get_setting(conn, uid, "goals", defs.DEFAULT_GOALS)


def latest_measurement(conn, uid, kind):
    return conn.execute("SELECT date, value FROM measurements WHERE user_id = ? AND kind = ? ORDER BY date DESC LIMIT 1",
                        (uid, kind)).fetchone()


def delete_files_on_disk(conn, uid):
    """Remove uploaded files from disk (used when an account is deleted)."""
    from pathlib import Path
    for r in conn.execute("SELECT path FROM files WHERE user_id = ?", (uid,)).fetchall():
        try:
            Path(r["path"]).unlink(missing_ok=True)
        except OSError:
            pass
