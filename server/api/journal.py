"""The AI Journal: the next question, and a wellbeing score for the check-in. A very low score alerts the people the user chose.

Privacy: the chat itself is never stored. Only the score, the risk level and who was alerted are kept.
"""
import json
import re
from datetime import datetime, timedelta

from server import ai, providers, security, store
from server.router import route
from server.util import ApiError, bad, iso_now

# ---- the rules the app applies to the AI's score (the AI is never told these numbers) ----
ALERT_BELOW = 35        # a score under this alerts the user's emergency contact and linked doctor(s)
SUPPORT_BELOW = 50      # a score under this shows the helpline card
MIN_TURNS_FOR_SCORE = 3  # a score alone only alerts after the person has written this many messages (a safety phrase needs none)
ASSESS_EVERY = 4        # during a chat, the score is also worked out after every 4th message
REALERT_MINUTES = 60    # the same person is not alerted about again within this time

MAX_MESSAGES, MAX_CHARS, MAX_TOTAL = 40, 2000, 16000
RATE_LIMIT, RATE_WINDOW = 40, 600   # AI calls per person per 10 minutes

# Words that always get the support card at once, without waiting for the AI.
CRISIS = re.compile(r"suicid|kill myself|end my life|end it all|self[- ]?harm|hurt myself|want to die|wanna die|don'?t want to (live|be here)"
                    r"|better off dead|no reason to live|marna chahta|mar jana chahta|jeena nahi|khud ko (khatam|maar)", re.I)


def band(score):
    if score is None or score < ALERT_BELOW:
        return "low"
    return "heavy" if score < SUPPORT_BELOW else "strain" if score < 70 else "good"


def _messages(d, must_end_with_user):
    raw = d.get("messages")
    if not isinstance(raw, list) or not raw:
        raise bad("Write a message first.", "messages")
    if len(raw) > MAX_MESSAGES:
        raise bad("This chat has got long. Please start a new one.", "messages", "chat_too_long")
    out, total = [], 0
    for m in raw:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant") or not isinstance(m.get("content"), str):
            raise bad("Those messages are not valid.", "messages")
        content = m["content"].strip()
        if not content:
            continue
        if len(content) > MAX_CHARS:
            raise bad("That message is too long.", "messages")
        total += len(content)
        out.append({"role": m["role"], "content": content})
    if not out or out[0]["role"] != "user" or total > MAX_TOTAL:
        raise bad("Those messages are not valid.", "messages")
    if must_end_with_user and out[-1]["role"] != "user":
        raise bad("Write a message first.", "messages")
    return out


def _guard(req):
    """Consent, availability and a limit on how fast someone can use the AI (it costs money)."""
    store.require_consent(req.conn, req.user["id"], "ai_journal")
    if not ai.available():
        raise ApiError(503, "The journal assistant isn't set up on this computer yet.", code="ai_unavailable")
    key = f"journal:{req.user['id']}"
    if security.throttled(key, RATE_LIMIT, RATE_WINDOW):
        raise ApiError(429, "You are going quite fast. Please wait a few minutes.", code="rate_limited")
    security.record_failure(key)


def _recipients(conn, uid):
    """Who the user has agreed may be told: (contact or None, [provider dicts], why_not or None)."""
    em = store.get_setting(conn, uid, "emergency", None) or {}
    if not em.get("auto_alert"):
        return None, [], "off"
    contact = {"name": em["name"], "relation": em.get("relation") or "", "phone": em["phone"]} if em.get("consent") and em.get("name") and em.get("phone") else None
    docs = []
    if em.get("alert_doctor"):
        for r in conn.execute("SELECT provider_id, share FROM links WHERE user_id = ?", (uid,)):
            if json.loads(r["share"]).get("mood") and r["provider_id"] in providers.BY_ID:   # only doctors who may see mood data
                docs.append(providers.BY_ID[r["provider_id"]])
    return contact, docs, (None if contact or docs else "nobody")


def _raise_alert(conn, user, score, risk):
    """Record an alert for each person who may be told. In this prototype nothing is actually sent (delivered = 0)."""
    uid = user["id"]
    contact, docs, why_not = _recipients(conn, uid)
    out = {"triggered": True, "contact": ({"name": contact["name"], "relation": contact["relation"]} if contact else None),
           "doctors": [d["name"] for d in docs], "already": False, "why_not": why_not}
    if why_not:
        return out
    cutoff = (datetime.now() - timedelta(minutes=REALERT_MINUTES)).replace(microsecond=0).isoformat(sep=" ")
    if conn.execute("SELECT 1 FROM alerts WHERE user_id = ? AND created_at >= ?", (uid, cutoff)).fetchone():
        out["already"] = True
        return out
    now, name = iso_now(), user["preferred_name"] or user["first_name"]
    what = "a possible safety concern" if risk == "crisis" else f"a very low wellbeing score ({score}/100)"
    if contact:
        conn.execute("INSERT INTO alerts (user_id, created_at, recipient_kind, recipient_name, recipient_phone, message, score, risk) VALUES (?,?,?,?,?,?,?,?)",
                     (uid, now, "emergency_contact", contact["name"], contact["phone"],
                      f"{name} may be having a hard time and could use your support. Please check in with them.", score, risk))
    for d in docs:
        conn.execute("INSERT INTO alerts (user_id, created_at, recipient_kind, provider_id, recipient_name, message, score, risk) VALUES (?,?,?,?,?,?,?,?)",
                     (uid, now, "doctor", d["id"], d["name"], f"Journal check-in for {name}: {what}. Please follow up with them.", score, risk))
    who = ", ".join(([f"{contact['name']} (emergency contact)"] if contact else []) + [d["name"] for d in docs])
    store.log_access(conn, uid, f"Your journal check-in was very low. Pulse alerted: {who}. (Prototype: nothing was actually sent.)")
    return out


def _assess_and_alert(req, history, safety_phrase, source):
    """Score the chat, keep only the score, and alert if the rules say so. Returns the result for the page, or None."""
    turns = sum(1 for m in history if m["role"] == "user")
    try:
        score, risk = ai.assess(history, safety_phrase)
    except ai.AiUnavailable as e:
        print(f"[journal] could not score the chat: {e}")
        if not safety_phrase:
            return None
        score, risk = None, "crisis"   # fail safe: a safety phrase plus no score is treated as a crisis
    trigger = risk == "crisis" or (score is not None and score < ALERT_BELOW and turns >= MIN_TURNS_FOR_SCORE)
    conn = req.conn
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("INSERT INTO journal_checks (user_id, created_at, score, risk, turns, source) VALUES (?,?,?,?,?,?)",
                     (req.user["id"], iso_now(), score, risk, turns, "safety_phrase" if score is None else source))
        alert = _raise_alert(conn, req.user, score, risk) if trigger else {"triggered": False}
        conn.execute("COMMIT")
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    return {"score": score, "risk": risk, "band": band(score), "turns": turns, "alert": alert}


@route("GET", "/api/journal/status")
def status(req):
    return {"consent": bool(store.consents(req.conn, req.user["id"]).get("ai_journal")), "available": ai.available()}


@route("POST", "/api/journal/chat", tx=False)
def chat(req):
    """Body: {messages: [{role, content}, ...]} ending with the person's message. Returns the next question."""
    history = _messages(req.json(), must_end_with_user=True)
    _guard(req)
    safety = bool(CRISIS.search(history[-1]["content"]))
    reply = None
    if not safety:   # a safety phrase gets the support card, not another question
        try:
            asked = sum(1 for m in history if m["role"] == "assistant")
            reply = ai.next_question(history, asked)
        except ai.AiUnavailable as e:
            print(f"[journal] could not get a question: {e}")
            raise ApiError(503, "I can't reach the assistant right now. Please try again in a moment.", code="ai_unavailable")
    turns = sum(1 for m in history if m["role"] == "user")
    check = None
    if safety or turns % ASSESS_EVERY == 0:
        check = _assess_and_alert(req, history, safety, "auto")
    return {"reply": reply, "crisis": safety, "check": check}


@route("POST", "/api/journal/finish", tx=False)
def finish(req):
    """Body: {messages: [...]}. Scores the whole chat."""
    history = _messages(req.json(), must_end_with_user=False)
    _guard(req)
    safety = any(CRISIS.search(m["content"]) for m in history if m["role"] == "user")
    check = _assess_and_alert(req, history, safety, "finish")
    if check is None:
        raise ApiError(503, "I couldn't work out your check-in just now. Please try again in a moment.", code="ai_unavailable")
    return {"check": check}
