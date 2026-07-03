#!/usr/bin/env python3

import argparse
import json
import threading
import time
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    parser.add_argument("--time-scale", type=float, default=0.1)
    return parser.parse_args()


def build_handler(state_directory: Path, scale: float):
    metric_counts: Counter[str] = Counter()
    agent_metrics: list[dict] = []
    active_slow = 0
    maximum_slow = 0
    lock = threading.Lock()

    def write_state() -> None:
        (state_directory / "metrics.json").write_text(
            json.dumps(metric_counts, indent=2, sort_keys=True) + "\n"
        )
        (state_directory / "concurrency.json").write_text(
            json.dumps(
                {"activeSlowRequests": active_slow, "maximumSlowRequests": maximum_slow},
                indent=2,
            )
            + "\n"
        )
        (state_directory / "agent-metrics.json").write_text(
            json.dumps(agent_metrics, indent=2, sort_keys=True) + "\n"
        )

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            nonlocal active_slow, maximum_slow

            if self.path == "/health":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
                return

            if self.path.startswith("/upstream/fast/"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"value":1}')
                return

            delays = {
                "/upstream/slow-60/": 65 * scale,
                "/upstream/slow-120/": 125 * scale,
            }
            delay = next(
                (value for prefix, value in delays.items() if self.path.startswith(prefix)),
                None,
            )
            if delay is None:
                self.send_error(404)
                return

            with lock:
                active_slow += 1
                maximum_slow = max(maximum_slow, active_slow)
                write_state()
            try:
                time.sleep(delay)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"value":1}')
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                with lock:
                    active_slow -= 1
                    write_state()

        def do_POST(self) -> None:
            if self.path == "/reset":
                with lock:
                    metric_counts.clear()
                    agent_metrics.clear()
                    write_state()
                self.send_response(200)
                self.end_headers()
                return

            if self.path not in ("/metrics", "/agent-metrics"):
                self.send_error(404)
                return

            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            try:
                records = [json.loads(line) for line in body.splitlines() if line.strip()]
                names = [record["name"] for record in records]
            except (json.JSONDecodeError, KeyError) as error:
                (state_directory / "failure.txt").write_text(
                    f"Invalid metric payload: {error}\n{body}\n"
                )
                self.send_error(400)
                return

            with lock:
                if self.path == "/metrics":
                    metric_counts.update(names)
                else:
                    agent_metrics.extend(records)
                write_state()
            self.send_response(200)
            self.end_headers()

        def log_message(self, format_string: str, *args) -> None:
            return

    return Handler


def main() -> int:
    args = parse_args()
    args.state_directory.mkdir(parents=True, exist_ok=True)
    handler = build_handler(args.state_directory, args.time_scale)
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
