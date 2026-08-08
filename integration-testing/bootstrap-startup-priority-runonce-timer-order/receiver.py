#!/usr/bin/env python3

import argparse
import json
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


def find_expected_token(value, expected_tokens):
    if isinstance(value, str):
        for token in expected_tokens:
            if token in value:
                return token
        return None
    if isinstance(value, list):
        for item in value:
            token = find_expected_token(item, expected_tokens)
            if token is not None:
                return token
        return None
    if isinstance(value, dict):
        for item in value.values():
            token = find_expected_token(item, expected_tokens)
            if token is not None:
                return token
        return None
    return None


def build_handler(expected_metrics, expected_logs, state_directory):
    received_metrics = []
    received_logs = []
    received_events = []
    lock = threading.Lock()

    def write_state() -> None:
        ordered_metrics = sorted(
            received_metrics,
            key=lambda record: (record["timestamp"], record["sequence"]),
        )
        ordered_logs = sorted(
            received_logs,
            key=lambda record: (record["timestamp"], record["sequence"]),
        )
        ordered_events = sorted(
            received_events,
            key=lambda record: (record["timestamp"], record["sequence"]),
        )
        (state_directory / "received-metrics.json").write_text(
            json.dumps([record["token"] for record in ordered_metrics], indent=2) + "\n"
        )
        (state_directory / "received-logs.json").write_text(
            json.dumps([record["token"] for record in ordered_logs], indent=2) + "\n"
        )
        (state_directory / "received-events.ndjson").write_text(
            "\n".join(json.dumps(event, sort_keys=True) for event in ordered_events)
            + ("\n" if ordered_events else "")
        )

    def maybe_complete() -> None:
        if len(received_metrics) == len(expected_metrics) and len(received_logs) == len(expected_logs):
            (state_directory / "complete.txt").write_text("received\n")

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
                        "complete.txt",
                        "failure.txt",
                        "received-events.ndjson",
                        "received-metrics.json",
                        "received-logs.json",
                    ):
                        (state_directory / name).unlink(missing_ok=True)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"reset")
                return

            channel_expected_tokens = {
                "/metrics": expected_metrics,
                "/logs": expected_logs,
            }.get(self.path)
            if channel_expected_tokens is None:
                self.send_error(404)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                records = [json.loads(line) for line in body.splitlines() if line.strip()]
            except json.JSONDecodeError as error:
                (state_directory / "failure.txt").write_text(
                    f"Invalid {self.path} payload: {error}\n{body}\n"
                )
                self.send_error(400)
                return

            with lock:
                for record in records:
                    token = find_expected_token(record, channel_expected_tokens)
                    if token is None:
                        continue
                    timestamp = record.get("timestamp")
                    if timestamp is None:
                        timestamp = 0
                    try:
                        timestamp = float(timestamp)
                    except (TypeError, ValueError):
                        timestamp = 0
                    event = {
                        "channel": "metrics" if self.path == "/metrics" else "logs",
                        "sequence": len(received_events) + 1,
                        "timestamp": timestamp,
                        "token": token,
                    }
                    if self.path == "/metrics":
                        if token in expected_metrics and all(existing["token"] != token for existing in received_metrics):
                            received_metrics.append(event)
                            received_events.append(event)
                    else:
                        if token in expected_logs and all(existing["token"] != token for existing in received_logs):
                            received_logs.append(event)
                            received_events.append(event)

                write_state()
                maybe_complete()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

        def log_message(self, format_string, *args) -> None:
            print(f"{self.address_string()} {format_string % args}", flush=True)

    return Handler


def main() -> int:
    args = parse_args()
    expected_metrics = json.loads(args.expected_metrics.read_text())
    expected_logs = json.loads(args.expected_logs.read_text())
    args.state_directory.mkdir(parents=True, exist_ok=True)
    handler = build_handler(expected_metrics, expected_logs, args.state_directory)
    server = ThreadingHTTPServer((args.bind_address, args.port), handler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
