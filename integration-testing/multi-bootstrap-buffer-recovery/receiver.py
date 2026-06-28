#!/usr/bin/env python3

import argparse
import hashlib
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--expected-metrics", type=Path, required=True)
    parser.add_argument("--expected-logs", type=Path, required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    parser.add_argument("--response-status", type=int, default=200)
    parser.add_argument("--response-delay", type=float, default=0)
    return parser.parse_args()


def build_handler(
    expected_metrics: set[str],
    expected_logs: set[str],
    state_directory: Path,
    response_status: int,
    response_delay: float,
):
    received_metrics: set[str] = set()
    received_logs: set[str] = set()
    received_bytes = {"metrics": 0, "logs": 0}
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
            if self.path not in ("/metrics", "/logs"):
                self.send_error(404)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            body = raw_body.decode("utf-8")
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
                token_matches = re.findall(
                    r"bootstrap-\d+-[a-z0-9-]+-(?:metric|log)-\d{3,4}",
                    body,
                )
                journal_entry = {
                    "timestamp": time.time(),
                    "path": self.path,
                    "status": response_status,
                    "recordCount": len(records),
                    "bodyHash": hashlib.sha256(raw_body).hexdigest(),
                    "sampleToken": token_matches[0] if token_matches else None,
                }
                with (state_directory / "requests.ndjson").open("a") as journal:
                    journal.write(json.dumps(journal_entry) + "\n")

            if response_status < 200 or response_status >= 300:
                if response_delay > 0:
                    time.sleep(response_delay)
                self.send_response(response_status)
                self.end_headers()
                return

            with lock:
                if self.path == "/metrics":
                    received_bytes["metrics"] += len(raw_body)
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
                    received_bytes["logs"] += len(raw_body)
                    for record in records:
                        received_logs.update(
                            re.findall(
                                r"bootstrap-\d+-[a-z0-9-]+-log-\d{3,4}",
                                str(record.get("value", "")),
                            )
                        )
                    (state_directory / "received-logs.json").write_text(
                        json.dumps(sorted(received_logs), indent=2) + "\n"
                    )
                (state_directory / "received-bytes.json").write_text(
                    json.dumps(received_bytes, indent=2) + "\n"
                )
                update_completion_marker()

            if response_delay > 0:
                time.sleep(response_delay)
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
    handler = build_handler(
        expected_metrics,
        expected_logs,
        args.state_directory,
        args.response_status,
        args.response_delay,
    )
    server = ReusableThreadingHTTPServer(("127.0.0.1", args.port), handler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
