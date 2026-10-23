"""Real model + in-memory Ditto transport for local UI checks; no MQTT claim."""
import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "services")]
from setup_twins import twins
from field import publish_hour, Totals
from platform_client import modify, prop
from tynys.params import aktogay
from tynys.sim import Env, init_state, step
from tynys.live import scenario_from_events, state_to_dict, dumps
from tynys.controllers import V1Reactive

p = aktogay()
things = {f"kz.tynys:{k}": dict(v, thingId=f"kz.tynys:{k}") for k,v in twins().items()}
state, totals, hour = init_state(p), Totals(), 8
lock = threading.Lock()


class Bus:
    def send(self, name, values):
        things[f"kz.tynys:{name}"]["features"] = modify(name, values)["value"]


def advance():
    global hour
    hour += 1
    events = json.loads(prop(things["kz.tynys:scenario"], "events", "[]"))
    env = Env(p, scenario_from_events(p, events, 105), 7)
    r = step(p, env, state, hour, V1Reactive().decide(p, env, state, hour), False)
    totals.add(p, r, state)
    bus = Bus()
    publish_hour(bus, p, env, state, r, hour, "fixture_v1", state.fleet)
    bus.send("site", {"sim_hour":hour, "sim_time":f"2026-04-15 {hour%24:02d}:00",
                      "state_json":dumps(state_to_dict(state)), **totals.feats()})


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "ui"), **kwargs)

    def log_message(self, *args):
        pass

    def answer(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False, default=lambda o:o.item()).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        path = unquote(url.path)
        if "/api/2/things" not in path:
            return super().do_GET()
        suffix = path.split("/api/2/things", 1)[1]
        with lock:
            if not suffix:
                ids = parse_qs(url.query).get("ids", [""])[0].split(",")
                return self.answer([things[n] for n in ids if n in things])
            parts = suffix.strip("/").split("/")
            value = things.get(parts[0])
            for part in parts[1:]:
                value = value.get(part) if isinstance(value, dict) else None
            return self.answer(value, 200 if value is not None else 404)

    def do_PUT(self):
        if not unquote(urlparse(self.path).path).endswith("/things/kz.tynys:scenario/features"):
            return self.answer({}, 404)
        values = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        with lock:
            things["kz.tynys:scenario"]["features"] = values
            advance()
        self.answer(None)


if __name__ == "__main__":
    advance()
    port = int(sys.argv[1]) if len(sys.argv)>1 else 18098
    print(f"MODEL UI FIXTURE http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
