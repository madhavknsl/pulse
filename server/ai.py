"""The Journal's AI: asks questions and scores a check-in, using the Claude API.

Standard library only. The key comes from the environment or from ./.env (ANTHROPIC_API_KEY) and is never logged.
The instructions the AI follows live in server/prompts/*.md. They are read on every call, so edits apply without a restart.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPTS = Path(__file__).resolve().parent / "prompts"
API_URL = "https://api.anthropic.com/v1/messages"
MODEL = os.environ.get("PULSE_AI_MODEL", "claude-haiku-5-5")
TIMEOUT = 30

FALLBACK_QUESTIONS = ["Can you tell me a little more about that?", "What has been on your mind the most today?",
                      "How did that feel in the moment?", "What happened next?"]
RISKS = ("none", "concern", "crisis")


class AiUnavailable(Exception):
    """The AI could not be reached or gave an answer we cannot use. The message is safe to log, never the key."""


def _api_key():
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    try:
        text = (ROOT / ".env").read_text(encoding="utf-8")
    except OSError:
        return None
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        if name.strip().removeprefix("export ").strip() == "ANTHROPIC_API_KEY":
            return value.strip().strip("\"'") or None
    return None


def available():
    return bool(_api_key())


def _prompt(name):
    try:
        return (PROMPTS / name).read_text(encoding="utf-8")
    except OSError:
        raise AiUnavailable(f"missing prompt file {name}")


def complete(system, messages, max_tokens, think=False):
    """One call to the Messages API. Returns the reply text. think=False keeps replies fast; scoring leaves thinking on."""
    key = _api_key()
    if not key:
        raise AiUnavailable("no API key")
    payload = {"model": MODEL, "max_tokens": max_tokens, "system": system, "messages": messages}
    if not think:
        payload["thinking"] = {"type": "disabled"}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, method="POST", headers={
        "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            err = json.loads(e.read().decode("utf-8")).get("error", {})
            detail = f"{err.get('type', '')}: {str(err.get('message', ''))[:160]}".replace(key, "<key>")
        except Exception:
            pass
        raise AiUnavailable(f"Claude API returned {e.code} {detail}".strip())
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise AiUnavailable(f"could not reach the Claude API ({type(e).__name__})")
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    if not text:
        raise AiUnavailable("empty reply")
    return text


def _plain(text):
    """The reply is shown as plain text: drop any markdown the model added."""
    text = re.sub(r"[*_`#>]+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def next_question(history, used_fallbacks=0):
    """history: [{'role': 'user'|'assistant', 'content': str}, ...], ending with the person's message."""
    text = _plain(complete(_prompt("journal_guide.md"), history, 220))
    if "?" not in text:   # guardrail: the journal only ever asks
        text = FALLBACK_QUESTIONS[used_fallbacks % len(FALLBACK_QUESTIONS)]
    return text[:600]


def assess(history, safety_phrase=False):
    """Score the conversation. Returns (score 0-100, risk). Raises AiUnavailable if there is no usable answer."""
    def clean(s):
        return s.replace("<", "(").replace(">", ")")   # the person cannot close our tags
    lines = [("Person: " if m["role"] == "user" else "Journal: ") + clean(m["content"]) for m in history]
    content = "<conversation>\n" + "\n".join(lines) + "\n</conversation>"
    if safety_phrase:
        content += "\n<app_flag>The app's keyword check noticed a possible self-harm phrase.</app_flag>"
    raw = complete(_prompt("journal_score.md"), [{"role": "user", "content": content}], 1500, think=True)
    found = re.search(r"\{.*?\}", raw, re.S)
    if not found:
        raise AiUnavailable("score was not JSON")
    try:
        obj = json.loads(found.group(0))
        score = int(round(float(obj["score"])))
    except (ValueError, KeyError, TypeError):
        raise AiUnavailable("score was not usable")
    risk = obj.get("risk") if obj.get("risk") in RISKS else "none"
    score = max(0, min(100, score))
    if risk == "crisis":
        score = min(score, 15)
    return score, risk
