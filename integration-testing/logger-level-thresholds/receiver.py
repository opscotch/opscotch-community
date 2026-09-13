#!/usr/bin/env python3

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


EXPECTED_METRICS = {
    "logger-levels-bootstrap-wins-complete",
    "logger-levels-workflow-fallback-complete",
    "logger-levels-control-complete",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--state-directory", type=Path, required=True)
    return parser.parse_args()


def build_handler(state_directory: Path):
    received_metrics: set[str] = set()
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
                return
            self.send_error(404)

        def do_POST(self) -> None:
            if self.path not in ("/metrics", "/logs"):
                self.send_error(404)
                return
            raw_body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            try:
                records = [json.loads(line) for line in raw_body.decode().splitlines() if line.strip()]
            except json.JSONDecodeError as error:
                (state_directory / "failure.txt").write_text(f"Invalid {self.path} payload: {error}\n")
                self.send_error(400)
                return

            with lock:
                if self.path == "/metrics":
                    for record in records:
                        name = record.get("name")
                        if name in EXPECTED_METRICS:
                            received_metrics.add(name)
                    (state_directory / "received-metrics.json").write_text(
                        json.dumps(sorted(received_metrics), indent=2) + "\n"
                    )
                    if received_metrics == EXPECTED_METRICS:
                        (state_directory / "metrics-complete.txt").write_text("received\n")
                else:
                    with (state_directory / "received-logs.ndjson").open("ab") as output:
                        output.write(raw_body)
                        if not raw_body.endswith(b"\n"):
                            output.write(b"\n")

            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")

        def log_message(self, format_string: str, *args) -> None:
            print(f"{self.address_string()} {format_string % args}", flush=True)

    return Handler


def main() -> int:
    args = parse_args()
    args.state_directory.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer((args.bind_address, args.port), build_handler(args.state_directory)).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
