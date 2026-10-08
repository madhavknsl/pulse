"""A tiny router. Handlers get a Request and return data, (status, data) or a Response."""
import json
import re
from urllib.parse import parse_qs

from server.util import bad

ROUTES = []
MAX_JSON = 1_000_000


def route(method, pattern, auth=True):
    def deco(fn):
        ROUTES.append((method.upper(), re.compile("^" + pattern + "$"), fn, auth))
        return fn
    return deco


class Request:
    def __init__(self, method, path, query, headers, body, cookies, ip):
        self.method, self.path, self.headers, self.body, self.cookies, self.ip = method, path, headers, body, cookies, ip
        self.query = {k: v[0] for k, v in parse_qs(query).items()}
        self.user = None
        self.conn = None
        self.args = {}
        self.set_cookie = None   # handlers may set this to a Set-Cookie header value

    def json(self):
        if not self.body:
            return {}
        if len(self.body) > MAX_JSON:
            raise bad("That request is too large.")
        try:
            data = json.loads(self.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise bad("The request body is not valid JSON.")
        if not isinstance(data, dict):
            raise bad("Expected a JSON object.")
        return data


class Response:
    def __init__(self, body=b"", status=200, content_type="application/json; charset=utf-8", headers=None):
        self.body, self.status, self.content_type = body, status, content_type
        self.headers = headers or []


def match(method, path):
    """Return (handler, auth, args, method_known) for the first route that fits."""
    path_matched = False
    for m, rx, fn, auth in ROUTES:
        found = rx.match(path)
        if found:
            path_matched = True
            if m == method:
                return fn, auth, found.groupdict(), True
    return None, None, None, path_matched
