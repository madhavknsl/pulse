"""Passwords, sessions and login throttling. Standard library only."""
import base64
import hashlib
import hmac
import os
import secrets
import threading
import time
from datetime import datetime, timedelta

COOKIE = "pulse_session"
SESSION_DAYS = 7

# scrypt cost: ~16 MB, a few tens of ms. Strong enough for a local prototype.
_N, _R, _P = 2 ** 14, 8, 1


def _b64(b):
    return base64.b64encode(b).decode("ascii")


def hash_password(password):
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password, stored):
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=base64.b64decode(salt),
                                n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


# A real hash to compare against when the account does not exist, so timing doesn't reveal which accounts exist.
_DUMMY = hash_password("not-a-real-password")


def burn_time(password):
    verify_password(password, _DUMMY)


def check_password_strength(password):
    if not isinstance(password, str):
        return "Enter a password."
    if len(password) < 8:
        return "Use at least 8 characters."
    if len(password) > 128:
        return "That password is too long."
    if password.lower() in {"password", "12345678", "123456789", "qwertyui", "password1"}:
        return "That password is too easy to guess."
    return None


# ---------- sessions ----------
def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_session(conn, user_id):
    token = secrets.token_urlsafe(32)
    now = datetime.now().replace(microsecond=0)
    conn.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
                 (_hash_token(token), user_id, now.isoformat(sep=" "),
                  (now + timedelta(days=SESSION_DAYS)).isoformat(sep=" ")))
    return token


def user_for_token(conn, token):
    if not token:
        return None
    row = conn.execute(
        "SELECT u.*, s.expires_at AS _exp FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (_hash_token(token),)).fetchone()
    if row is None:
        return None
    if datetime.fromisoformat(row["_exp"]) < datetime.now():
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))
        return None
    return row


def end_session(conn, token):
    if token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))


def end_all_sessions(conn, user_id):
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def session_cookie(token, max_age=SESSION_DAYS * 86400):
    # HttpOnly: scripts can't read it. SameSite=Lax: other sites can't make it ride along on a POST.
    # No 'Secure' flag because this prototype runs on plain http://localhost.
    return f"{COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax"


def clear_cookie():
    return f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"


# ---------- throttling ----------
_fails = {}
_lock = threading.Lock()


def throttled(key, limit=6, window=300):
    now = time.time()
    with _lock:
        hits = [t for t in _fails.get(key, []) if now - t < window]
        _fails[key] = hits
        return len(hits) >= limit


def record_failure(key):
    with _lock:
        _fails.setdefault(key, []).append(time.time())


def clear_failures(key):
    with _lock:
        _fails.pop(key, None)
