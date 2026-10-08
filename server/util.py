"""Shared helpers: errors and input validation. Standard library only."""
import re
from datetime import date, datetime, timedelta


class ApiError(Exception):
    """Raised by handlers; turned into a JSON error response."""

    def __init__(self, status, message, field=None, code=None):
        super().__init__(message)
        self.status, self.message, self.field, self.code = status, message, field, code


def bad(message, field=None, code=None):
    return ApiError(422, message, field, code)


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def text(v, field, min_len=1, max_len=200, required=True):
    if v is None or (isinstance(v, str) and not v.strip()):
        if required:
            raise bad("This field is required.", field)
        return None
    if not isinstance(v, str):
        raise bad("Expected text.", field)
    v = v.strip()
    if len(v) < min_len:
        raise bad(f"Use at least {min_len} characters.", field)
    if len(v) > max_len:
        raise bad(f"Use at most {max_len} characters.", field)
    return v


def email(v, field="email", required=True):
    v = text(v, field, required=required, max_len=254)
    if v is None:
        return None
    if not EMAIL_RE.match(v):
        raise bad("That email address does not look right.", field)
    return v.lower()


def phone(v, field="phone", required=True):
    v = text(v, field, required=required, max_len=20)
    if v is None:
        return None
    digits = re.sub(r"[\s\-]", "", v)
    if digits.startswith("+91"):
        digits = digits[3:]
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise bad("Enter a 10-digit Indian mobile number.", field)
    return digits


def number(v, field, lo, hi, integer=False, required=True):
    if v is None or v == "":
        if required:
            raise bad("This field is required.", field)
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float, str)):
        raise bad("Expected a number.", field)
    try:
        n = float(v)
    except ValueError:
        raise bad("Expected a number.", field)
    if n != n or n in (float("inf"), float("-inf")):
        raise bad("Expected a number.", field)
    if n < lo or n > hi:
        raise bad(f"Enter a value between {lo:g} and {hi:g}.", field)
    return int(round(n)) if integer else n


def ymd(v, field="date", not_future=False, required=True):
    if v is None or v == "":
        if required:
            raise bad("A date is required.", field)
        return None
    try:
        d = datetime.strptime(str(v), "%Y-%m-%d").date()
    except ValueError:
        raise bad("Use the format YYYY-MM-DD.", field)
    if not_future and d > date.today():
        raise bad("That date is in the future.", field)
    return d


def hhmm(v, field="time"):
    if not isinstance(v, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
        raise bad("Use the format HH:MM.", field)
    return v


def one_of(v, field, options, required=True):
    if v is None or v == "":
        if required:
            raise bad("Choose an option.", field)
        return None
    if v not in options:
        raise bad("That option is not available.", field)
    return v


def flag(v, field="value"):
    if not isinstance(v, bool):
        raise bad("Expected true or false.", field)
    return v


def str_list(v, field, allowed=None, max_items=30, max_len=60):
    if v is None:
        return []
    if not isinstance(v, list) or len(v) > max_items:
        raise bad("Expected a short list.", field)
    out = []
    for item in v:
        item = text(item, field, max_len=max_len)
        if allowed is not None and item not in allowed:
            raise bad("One of the options is not available.", field)
        if item not in out:
            out.append(item)
    return out


def age_on(dob, on=None):
    on = on or date.today()
    return on.year - dob.year - ((on.month, on.day) < (dob.month, dob.day))


def iso_now():
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def today_str():
    return date.today().isoformat()


def days_ago(n):
    return (date.today() - timedelta(days=n)).isoformat()
