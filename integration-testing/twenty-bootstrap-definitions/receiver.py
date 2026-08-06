#!/usr/bin/env python3

import argparse
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--expected-metrics", type=Path, required=True)
    parser.add_argument("--expected-logs", type=Path, required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    return parser.parse_args()


def build_handler(
    expected_metrics: set[str],
    expected_logs: set[str],
    state_directory: Path,
):
    received_metrics: set[str] = set()
    received_logs: set[str] = set()
    lock = threading.Lock()

    def update_completion_marker() -> None:
        if (
            expected_metrics.issubset(received_metrics)
            and expected_logs.issubset(received_logs)
        ):
            (state_directory / "all-outputs.received").write_text("received\n")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
                return
            self.send_error(404)

        def do_POST(self) -> None:
            if self.path == "/reset":
                with lock:
                    received_metrics.clear()
                    received_logs.clear()
                    for name in (
                        "all-outputs.received",
                        "failure.txt",
                        "received-metrics.json",
                        "received-logs.json",
                    ):
                        (state_directory / name).unlink(missing_ok=True)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"reset")
                return

            if self.path not in ("/metrics", "/logs"):
                self.send_error(404)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                records = [
                    json.loads(line)
                    for line in body.splitlines()
                    if line.strip()
                ]
            except json.JSONDecodeError as error:
                (state_directory / "failure.txt").write_text(
                    f"Invalid {self.path} payload: {error}\n{body}\n"
                )
                self.send_error(400)
                return

            with lock:
                if self.path == "/metrics":
                    try:
                        received_metrics.update(
                            record["name"] for record in records
                        )
                    except KeyError as error:
                        (state_directory / "failure.txt").write_text(
                            f"Metric payload missing field: {error}\n{body}\n"
                        )
                        self.send_error(400)
                        return
                    (state_directory / "received-metrics.json").write_text(
                        json.dumps(sorted(received_metrics), indent=2) + "\n"
                    )
                else:
                    for record in records:
                        received_logs.update(
                            re.findall(
                                r"bootstrap-\d+-log-\d{3}",
                                str(record.get("value", "")),
                            )
                        )
                    (state_directory / "received-logs.json").write_text(
                        json.dumps(sorted(received_logs), indent=2) + "\n"
                    )
                update_completion_marker()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

        def log_message(self, format_string: str, *args) -> None:
            print(f"{self.address_string()} {format_string % args}", flush=True)

    return Handler


def main() -> int:
    args = parse_args()
    expected_metrics = set(json.loads(args.expected_metrics.read_text()))
    expected_logs = set(json.loads(args.expected_logs.read_text()))
    args.state_directory.mkdir(parents=True, exist_ok=True)
    handler = build_handler(expected_metrics, expected_logs, args.state_directory)
    server = ThreadingHTTPServer((args.bind_address, args.port), handler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
