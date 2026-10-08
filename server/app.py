#!/usr/bin/env python3
"""Pulse local server: serves the pages and the JSON API, with all data stored in ./data.

Run:  python3 server/app.py        then open  http://127.0.0.1:8000
Standard library only. It listens on this computer only (127.0.0.1) unless you change PULSE_HOST.
"""
import importlib
import json
import mimetypes
import pkgutil
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import os  # noqa: E402

from server import api as api_pkg  # noqa: E402
from server import db, router, security  # noqa: E402
from server.util import ApiError  # noqa: E402

for _finder, _name, _ispkg in pkgutil.iter_modules(api_pkg.__path__):
    importlib.import_module(f"server.api.{_name}")  # importing registers the routes

APP_PAGES = {"user.html", "tracker.html", "healthcare.html", "profile.html"}
PUBLIC_PAGES = {"index.html", "register.html"}
PAGE_PATHS = {"/": "index.html", **{f"/{p}": p for p in APP_PAGES | PUBLIC_PAGES}}
STATIC_DIRS = ("/css/", "/js/", "/assets/")
MAX_BODY = 1_000_000
MAX_UPLOAD = 6_000_000
MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
        ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon"}
SECURITY_HEADERS = [
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "same-origin"),
    ("Cache-Control", "no-store"),
]


def gate(page, user):
    """Where should this visitor go instead of the page they asked for? None means: show it."""
    if page == "index.html":
        if user:
            return "/user.html" if user["onboarded_at"] else "/register.html"
    elif page == "register.html":
        if user and user["onboarded_at"]:
            return "/user.html"
    else:
        if not user:
            return "/index.html"
        if not user["onboarded_at"]:
            return "/register.html"
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "Pulse"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # one short line, never the body or cookies
        sys.stderr.write(f"{self.command} {urlsplit(self.path).path} {args[1] if len(args) > 1 else ''}\n")

    # ----- plumbing -----
    def _send(self, status, body=b"", content_type="application/json; charset=utf-8", extra=()):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k, v in SECURITY_HEADERS:
            self.send_header(k, v)
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD" and status not in (204, 304):
            self.wfile.write(body)

    def _json(self, status, obj, extra=()):
        self._send(status, json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8"), extra=extra)

    def _error(self, status, message, field=None, code=None, extra=()):
        self._json(status, {"error": {"message": message, "field": field, "code": code}}, extra)

    def _cookies(self):
        out = {}
        for part in (self.headers.get("Cookie") or "").split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                out[k] = v
        return out

    def do_GET(self): self._dispatch()
    def do_HEAD(self): self._dispatch()
    def do_POST(self): self._dispatch()
    def do_PUT(self): self._dispatch()
    def do_PATCH(self): self._dispatch()
    def do_DELETE(self): self._dispatch()

    def _dispatch(self):
        try:
            parts = urlsplit(self.path)
            path = unquote(parts.path)
            if path.startswith("/api/"):
                self._api(path, parts.query)
            else:
                self._static(path)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            try:
                self._error(500, "Something went wrong on our side.")
            except Exception:
                pass

    # ----- API -----
    def _api(self, path, query):
        method = self.command
        fn, auth, args, path_known = router.match(method if method != "HEAD" else "GET", path)
        if fn is None:
            return self._error(405 if path_known else 404, "Method not allowed." if path_known else "Not found.")

        if method not in ("GET", "HEAD"):
            # CSRF: browsers can't add a custom header cross-site without our permission.
            if self.headers.get("X-Requested-With") != "pulse":
                return self._error(403, "Missing request header.")
            origin = self.headers.get("Origin")
            if origin and urlsplit(origin).netloc != self.headers.get("Host"):
                return self._error(403, "Cross-site request refused.")

        limit = MAX_UPLOAD if path.startswith("/api/files") else MAX_BODY
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._error(400, "Bad Content-Length.")
        if length > limit:
            self.close_connection = True
            return self._error(413, "That upload is too large.")
        body = self.rfile.read(length) if length else b""

        req = router.Request(method, path, query, self.headers, body, self._cookies(),
                             self.client_address[0])
        conn = db.connect()
        writing = method not in ("GET", "HEAD")
        try:
            req.conn = conn
            req.token = req.cookies.get(security.COOKIE)
            req.user = security.user_for_token(conn, req.token)
            req.args = args
            if auth and req.user is None:
                return self._error(401, "Please sign in.", code="signed_out")
            if writing:
                conn.execute("BEGIN IMMEDIATE")
            result = fn(req)
            if writing:
                conn.execute("COMMIT")
        except ApiError as e:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            return self._error(e.status, e.message, e.field, e.code)
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            traceback.print_exc()
            return self._error(500, "Something went wrong on our side.")
        finally:
            conn.close()

        extra = [("Set-Cookie", req.set_cookie)] if req.set_cookie else []
        if isinstance(result, router.Response):
            return self._send(result.status, result.body, result.content_type, list(result.headers) + extra)
        if result is None:
            return self._send(204, b"", extra=extra)
        status, obj = result if isinstance(result, tuple) else (200, result)
        return self._json(status, obj, extra)

    # ----- static files -----
    def _static(self, path):
        if self.command not in ("GET", "HEAD"):
            return self._error(405, "Method not allowed.")
        if path == "/favicon.ico":
            return self._send(204)
        page = PAGE_PATHS.get(path)
        if page:
            conn = db.connect()
            try:
                user = security.user_for_token(conn, self._cookies().get(security.COOKIE))
            finally:
                conn.close()
            target = gate(page, user)
            if target:
                return self._send(302, b"", extra=[("Location", target)])
            return self._file(ROOT / page)
        if path.startswith(STATIC_DIRS):
            candidate = (ROOT / path.lstrip("/")).resolve()
            if ROOT.resolve() in candidate.parents and candidate.is_file() and candidate.suffix in MIME:
                return self._file(candidate)
        return self._send(404, b"Not found.", "text/plain; charset=utf-8")

    def _file(self, path):
        try:
            data = path.read_bytes()
        except OSError:
            return self._send(404, b"Not found.", "text/plain; charset=utf-8")
        ctype = MIME.get(path.suffix) or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self._send(200, data, ctype)


def main():
    host = os.environ.get("PULSE_HOST", "127.0.0.1")
    port = int(os.environ.get("PULSE_PORT", "8000"))
    db.init()
    if "--no-demo" not in sys.argv:
        from server import seed
        seed.ensure_demo()
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    print(f"Pulse is running at http://{host}:{port}  (Ctrl+C to stop)")
    print(f"Your data is stored locally in {db.DATA_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
