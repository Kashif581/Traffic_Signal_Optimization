#!/usr/bin/env python3
"""
Traffic dashboard server (Python standard library only - nothing to pip install).

    python server.py
    python server.py --recordings C:\\path\\to\\Test\\recordings --port 8000

What it does
  * serves the React app from the ./web folder
  * reads the recordings made by traci9_record.py / build_dashboard.py
    (recordings/<fixed|ql|dqn>/metrics.csv, meta.json, video.mp4)
  * handles sign up / sign in. The FIRST account that signs up is the administrator;
    after that, sign up is closed and people sign in.
  * serves the videos with "Range" support, so the video can be scrubbed

Passwords are stored as salted scrypt hashes in ./data/users.json.
Forgot the admin password?  Stop the server, delete ./data/users.json, start again and sign up again.
"""
import argparse
import csv
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sys
import threading
import time
import webbrowser
import xml.etree.ElementTree as ET
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE, "web")
DATA_DIR = os.path.join(BASE, "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
SESSIONS_FILE = os.path.join(DATA_DIR, "sessions.json")

ORDER = ["fixed", "ql", "dqn"]
NAMES = {"fixed": "Fixed timing", "ql": "Q-learning", "dqn": "Deep Q-learning (DQN)"}
SESSION_DAYS = 7
CONGESTED_AT = 10                       # "congested" = this many vehicles or more at the stop lines
HIST_EDGES = [0, 3, 6, 9, 12, 15]       # queue bands: 0-2, 3-5, 6-8, 9-11, 12-14, 15+
PHASE_GROUP = {0: "B_green", 3: "A_green", 1: "yellow", 4: "yellow", 2: "all_red", 5: "all_red"}

# Which approach edge belongs to which road / compass direction, and what each movement is.
# (matches the network built in netedit: road A = E9 + E10, road B = E5 + E6)
APPROACH = {"E9": ("NW", "A"), "E10": ("SE", "A"), "E5": ("NE", "B"), "E6": ("SW", "B")}
TURN = {("E9", "E11"): "straight", ("E10", "E8"): "straight", ("E5", "E7"): "straight", ("E6", "E4"): "straight",
        ("E10", "E4"): "right", ("E5", "E8"): "right", ("E6", "E11"): "right", ("E9", "E7"): "right",
        ("E9", "E4"): "left", ("E10", "E7"): "left", ("E5", "E11"): "left", ("E6", "E8"): "left"}

RECORDINGS = ""
ROUTES_FILE = ""
LOCK = threading.Lock()


# ----------------------------------------------------------------------------------------
# Users and sessions
# ----------------------------------------------------------------------------------------
def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write_json(path, obj):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


def hash_password(password, salt_hex=None, algo=None):
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    if algo in (None, "scrypt"):
        try:
            h = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
            return "scrypt", salt.hex(), h.hex()
        except (AttributeError, ValueError):
            if algo == "scrypt":
                raise
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000, dklen=32)
    return "pbkdf2", salt.hex(), h.hex()


def verify_password(user, password):
    _, _, h = hash_password(password, user["salt"], user["algo"])
    return hmac.compare_digest(h, user["hash"])


def load_users():
    return _read_json(USERS_FILE, [])


def public_user(u):
    return {"name": u["name"], "email": u["email"], "role": u["role"]}


def create_session(email):
    token = secrets.token_urlsafe(32)
    with LOCK:
        sessions = _read_json(SESSIONS_FILE, {})
        now = time.time()
        sessions = {k: v for k, v in sessions.items() if v["exp"] > now}      # forget expired ones
        sessions[hashlib.sha256(token.encode()).hexdigest()] = {"email": email, "exp": now + SESSION_DAYS * 86400}
        _write_json(SESSIONS_FILE, sessions)
    return token


def session_user(token):
    if not token:
        return None
    key = hashlib.sha256(token.encode()).hexdigest()
    s = _read_json(SESSIONS_FILE, {}).get(key)
    if not s or s["exp"] < time.time():
        return None
    for u in load_users():
        if u["email"] == s["email"]:
            return u
    return None


def drop_session(token):
    if not token:
        return
    with LOCK:
        sessions = _read_json(SESSIONS_FILE, {})
        sessions.pop(hashlib.sha256(token.encode()).hexdigest(), None)
        _write_json(SESSIONS_FILE, sessions)


FAILS = {}      # ip -> (count, first_time)


def too_many_failures(ip):
    count, first = FAILS.get(ip, (0, 0))
    if count >= 5 and time.time() - first < 300:
        return True
    if time.time() - first >= 300:
        FAILS.pop(ip, None)
    return False


def note_failure(ip):
    count, first = FAILS.get(ip, (0, time.time()))
    FAILS[ip] = (count + 1, first)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ----------------------------------------------------------------------------------------
# Recording data
# ----------------------------------------------------------------------------------------
_cache = {"key": None, "value": None}


def find_first(candidates):
    for c in candidates:
        if c and os.path.exists(c):
            return os.path.abspath(c)
    return ""


def _stats(rows, step_length):
    n = len(rows)
    q = [r["q"] for r in rows]
    h = [r["h"] for r in rows]
    sq = sorted(q)
    phases = [r["phase"] for r in rows]
    share = {"A_green": 0, "B_green": 0, "yellow": 0, "all_red": 0}
    for p in phases:
        share[PHASE_GROUP.get(p, "all_red")] += 1
    runs, cur, length = [], None, 0
    for p in phases:
        if p == cur:
            length += 1
        else:
            if cur in (0, 3):
                runs.append(length)
            cur, length = p, 1
    avg_green = (sum(runs) / len(runs) * step_length) if runs else 0.0
    bins = [0] * len(HIST_EDGES)
    for v in q:
        i = 0
        for k, e in enumerate(HIST_EDGES):
            if v >= e:
                i = k
        bins[i] += 1
    win = max(1, round(100 / step_length))
    windows = [round(sum(q[i:i + win]) / len(q[i:i + win]), 2) for i in range(0, n, win)]
    return {
        "steps": n, "seconds": round(n * step_length, 1),
        "avgQueue": round(sum(q) / n, 2), "peakQueue": max(q), "p95Queue": sq[int(0.95 * (n - 1))],
        "avgHalting": round(sum(h) / n, 2),
        "stoppedShare": round(sum(h) / max(1, sum(q)) * 100, 1),
        "congestedPct": round(sum(1 for v in q if v >= CONGESTED_AT) / n * 100, 1),
        "finalReward": round(rows[-1]["cum"], 1),
        "throughput": rows[-1]["arrived"],
        "avgInNetwork": round(sum(r["inNet"] for r in rows) / n, 1),
        "switches": sum(1 for r in rows if r["action"] == 1),
        "avgGreen": round(avg_green, 1),
        "phaseShare": {k: round(v / n * 100, 1) for k, v in share.items()},
        "hist": [round(b / n * 100, 1) for b in bins],
        "windows": windows,
    }


def load_run(key):
    run_dir = os.path.join(RECORDINGS, key)
    csv_path = os.path.join(run_dir, "metrics.csv")
    if not os.path.exists(csv_path):
        return None
    meta = _read_json(os.path.join(run_dir, "meta.json"), {})
    step_length = float(meta.get("step_length", 0.1))
    frame_every = int(meta.get("frame_every", 5))
    rows = []
    with open(csv_path, newline="") as f:
        for r in csv.DictReader(f):
            try:
                rows.append({"step": int(r["step"]), "q": int(r["total_queue"]), "h": int(r["halting"]),
                             "inNet": int(r["in_network"]), "arrived": int(r["arrived_total"]),
                             "cum": float(r["cumulative_reward"]), "phase": int(r["phase"]),
                             "action": int(r["action"])})
            except (KeyError, ValueError):
                continue
    if not rows:
        return None
    frames_dir = os.path.join(run_dir, "frames")
    n_frames = None
    if os.path.isdir(frames_dir):
        n_frames = sum(1 for n in os.listdir(frames_dir) if n.lower().endswith((".jpg", ".jpeg", ".png")))
    sampled = [r for r in rows if r["step"] % frame_every == 0]
    if n_frames:
        sampled = sampled[:n_frames]
    has_video = os.path.exists(os.path.join(run_dir, "video.mp4"))
    return {
        "key": key, "name": meta.get("name", NAMES[key]),
        "video": f"/recordings/{key}/video.mp4" if has_video else None,
        "queue": [r["q"] for r in sampled], "halting": [r["h"] for r in sampled],
        "cum": [round(r["cum"], 1) for r in sampled], "phase": [r["phase"] for r in sampled],
        "arrived": [r["arrived"] for r in sampled], "inNet": [r["inNet"] for r in sampled],
        "stats": _stats(rows, step_length),
        "_meta": {"fps": int(meta.get("fps", 20)), "frame_every": frame_every, "step_length": step_length,
                  "seed": meta.get("seed", 42)},
    }


def load_demand():
    if not ROUTES_FILE or not os.path.exists(ROUTES_FILE):
        return None
    try:
        root = ET.parse(ROUTES_FILE).getroot()
    except ET.ParseError:
        return None
    approaches, roads, turns, total = {}, {"A": 0.0, "B": 0.0}, {"straight": 0.0, "right": 0.0, "left": 0.0}, 0.0
    for fl in root.iter("flow"):
        src, dst, vph = fl.get("from"), fl.get("to"), fl.get("vehsPerHour")
        if src not in APPROACH or vph is None:
            continue
        v = float(vph)
        name, road = APPROACH[src]
        a = approaches.setdefault(name, {"id": name, "edge": src, "road": road, "vehPerHour": 0.0})
        a["vehPerHour"] += v
        roads[road] += v
        turns[TURN.get((src, dst), "straight")] += v
        total += v
    if not total:
        return None
    return {"approaches": sorted(approaches.values(), key=lambda a: a["id"]), "roads": roads,
            "turns": turns, "total": total}


def load_all():
    files = []
    for key in ORDER:
        for name in ("metrics.csv", "meta.json", "video.mp4"):
            p = os.path.join(RECORDINGS, key, name)
            files.append((p, os.path.getmtime(p) if os.path.exists(p) else 0))
    if ROUTES_FILE and os.path.exists(ROUTES_FILE):
        files.append((ROUTES_FILE, os.path.getmtime(ROUTES_FILE)))
    cache_key = tuple(files)
    if _cache["key"] == cache_key:
        return _cache["value"]
    runs = [r for r in (load_run(k) for k in ORDER) if r]
    meta = runs[0]["_meta"] if runs else {"fps": 20, "frame_every": 5, "step_length": 0.1, "seed": 42}
    for r in runs:
        r.pop("_meta")
    value = {"fps": meta["fps"], "frameEvery": meta["frame_every"], "stepLength": meta["step_length"],
             "seed": meta["seed"], "runs": runs, "demand": load_demand()}
    _cache["key"], _cache["value"] = cache_key, value
    return value


# ----------------------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "TrafficDashboard/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---- small helpers ----
    def _security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                         "media-src 'self'; connect-src 'self'; frame-ancestors 'none'")

    def send_json(self, status, obj, extra_headers=None):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._security_headers()
        for k, v in (extra_headers or {}):
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def token(self):
        c = SimpleCookie(self.headers.get("Cookie", ""))
        return c["session"].value if "session" in c else None

    def user(self):
        return session_user(self.token())

    def cookie_header(self, token, max_age):
        return ("Set-Cookie", f"session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={max_age}")

    def read_json(self):
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            return None
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            return None
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if n <= 0 or n > 10_000:
            return None
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8"))
        except ValueError:
            return None
        return data if isinstance(data, dict) else None

    def send_file(self, path, ctype=None, cache="no-cache"):
        try:
            size = os.path.getsize(path)
        except OSError:
            return self.send_json(404, {"error": "Not found"})
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
            if m and (m.group(1) or m.group(2)):
                a, b = m.groups()
                if not a:
                    start = max(0, size - int(b))
                else:
                    start = int(a)
                    end = min(size - 1, int(b)) if b else size - 1
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype or mimetypes.guess_type(path)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", cache)
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self._security_headers()
        self.end_headers()
        if self.command == "HEAD":
            return
        try:
            with open(path, "rb") as f:
                f.seek(start)
                left = length
                while left > 0:
                    chunk = f.read(min(65536, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass        # the browser stopped asking (for example it jumped to another time)

    # ---- routes ----
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/status":
            u = self.user()
            return self.send_json(200, {"hasAdmin": bool(load_users()), "authenticated": bool(u),
                                        "user": public_user(u) if u else None})
        if path == "/api/runs":
            if not self.user():
                return self.send_json(401, {"error": "Please sign in"})
            return self.send_json(200, load_all())
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Not found"})

        m = re.match(r"^/recordings/(fixed|ql|dqn)/video\.mp4$", path)
        if m:
            if not self.user():
                return self.send_json(401, {"error": "Please sign in"})
            return self.send_file(os.path.join(RECORDINGS, m.group(1), "video.mp4"), "video/mp4")

        # static files of the React app (with a fallback to index.html for page routes)
        rel = unquote(path).lstrip("/")
        full = os.path.normpath(os.path.join(WEB_DIR, rel))
        if (full == WEB_DIR or not full.startswith(WEB_DIR + os.sep)) and rel:
            return self.send_json(404, {"error": "Not found"})
        if os.path.isfile(full):
            cache = "public, max-age=31536000, immutable" if "/assets/" in path else "no-cache"
            return self.send_file(full, cache=cache)
        if "." in os.path.basename(rel):
            return self.send_json(404, {"error": "Not found"})
        index = os.path.join(WEB_DIR, "index.html")
        if not os.path.isfile(index):
            return self.send_json(500, {"error": "The 'web' folder is missing index.html"})
        return self.send_file(index, "text/html; charset=utf-8")

    def do_POST(self):
        path = urlparse(self.path).path
        ip = self.client_address[0]
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Bad request"})

        if path == "/api/signup":
            with LOCK:
                if load_users():
                    return self.send_json(403, {"error": "Sign up is closed. Please sign in."})
                name = str(data.get("name", "")).strip()
                email = str(data.get("email", "")).strip().lower()
                password = str(data.get("password", ""))
                if not (1 <= len(name) <= 80):
                    return self.send_json(400, {"error": "Please enter your name."})
                if not EMAIL_RE.match(email) or len(email) > 120:
                    return self.send_json(400, {"error": "Please enter a valid email address."})
                if len(password) < 8 or len(password) > 200:
                    return self.send_json(400, {"error": "The password must have at least 8 characters."})
                algo, salt, h = hash_password(password)
                user = {"name": name, "email": email, "role": "admin", "algo": algo, "salt": salt, "hash": h,
                        "created": time.strftime("%Y-%m-%d %H:%M:%S")}
                _write_json(USERS_FILE, [user])
            token = create_session(email)
            return self.send_json(200, {"user": public_user(user)},
                                  [self.cookie_header(token, SESSION_DAYS * 86400)])

        if path == "/api/signin":
            if too_many_failures(ip):
                return self.send_json(429, {"error": "Too many tries. Please wait a few minutes."})
            email = str(data.get("email", "")).strip().lower()
            password = str(data.get("password", ""))
            user = next((u for u in load_users() if u["email"] == email), None)
            if not user or not verify_password(user, password):
                note_failure(ip)
                return self.send_json(401, {"error": "Wrong email or password."})
            FAILS.pop(ip, None)
            token = create_session(email)
            return self.send_json(200, {"user": public_user(user)},
                                  [self.cookie_header(token, SESSION_DAYS * 86400)])

        if path == "/api/signout":
            drop_session(self.token())
            return self.send_json(200, {"ok": True}, [self.cookie_header("", 0)])

        return self.send_json(404, {"error": "Not found"})


def main():
    global RECORDINGS, ROUTES_FILE
    ap = argparse.ArgumentParser(description="Traffic dashboard server")
    ap.add_argument("--recordings", help="folder with fixed/, ql/, dqn/ (default: look for 'recordings')")
    ap.add_argument("--routes", help="RL.rou.xml (optional, used for the demand charts)")
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to allow other computers (default: this computer only)")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    cwd = os.getcwd()
    RECORDINGS = find_first([args.recordings, os.path.join(cwd, "recordings"),
                             os.path.join(BASE, "..", "recordings"), os.path.join(BASE, "recordings")])
    if not RECORDINGS:
        RECORDINGS = os.path.join(cwd, "recordings")
        print("Note: no 'recordings' folder found yet. Record a run first (python traci9_record.py fixed).")
    ROUTES_FILE = find_first([args.routes, os.path.join(cwd, "RL.rou.xml"), os.path.join(BASE, "..", "RL.rou.xml"),
                              os.path.join(RECORDINGS, "..", "RL.rou.xml")])
    if not os.path.isfile(os.path.join(WEB_DIR, "index.html")):
        sys.exit("The 'web' folder is missing. Keep server.py next to the 'web' folder.")

    found = [k for k in ORDER if os.path.exists(os.path.join(RECORDINGS, k, "metrics.csv"))]
    print(f"Recordings folder : {RECORDINGS}")
    print(f"Controllers found : {', '.join(NAMES[k] for k in found) or 'none yet'}")
    print(f"Demand file       : {ROUTES_FILE or 'not found (the demand charts will be hidden)'}")
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{args.port}/"
    print(f"\nDashboard is running at {url}   (press Ctrl+C to stop)")
    if args.host != "127.0.0.1":
        print("Warning: other computers on your network can reach this server.")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
