#!/usr/bin/env python3

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--expected-metric-name", required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    return parser.parse_args()


def build_handler(expected_metric_name: str, state_directory: Path):
    received_metrics: list[dict] = []
    lock = threading.Lock()

    def write_state() -> None:
        (state_directory / "received-metrics.json").write_text(
            json.dumps(received_metrics, indent=2, sort_keys=True) + "\n"
        )
        if received_metrics:
            (state_directory / "metric.received").write_text("received\n")
        else:
            (state_directory / "metric.received").unlink(missing_ok=True)

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
                    for name in (
                        "failure.txt",
                        "metric.received",
                        "received-metrics.json",
                    ):
                        (state_directory / name).unlink(missing_ok=True)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"reset")
                return

            if self.path != "/metrics":
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
                    f"Invalid metrics payload: {error}\n{body}\n"
                )
                self.send_error(400)
                return

            with lock:
                for record in records:
                    metric_name = record.get("name")
                    if metric_name != expected_metric_name:
                        (state_directory / "failure.txt").write_text(
                            "Unexpected metric name: "
                            f"expected {expected_metric_name!r}, got {metric_name!r}\n"
                            f"{body}\n"
                        )
                        self.send_error(400)
                        return
                    try:
                        timestamp = int(float(record["timestamp"]))
                    except (KeyError, TypeError, ValueError):
                        (state_directory / "failure.txt").write_text(
                            f"Metric payload missing usable timestamp\n{body}\n"
                        )
                        self.send_error(400)
                        return
                    received_metrics.append(
                        {
                            "name": metric_name,
                            "timestamp": timestamp,
                            "value": record.get("value"),
                        }
                    )
                write_state()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

        def log_message(self, format_string: str, *args) -> None:
            print(f"{self.address_string()} {format_string % args}", flush=True)

    return Handler


def main() -> int:
    args = parse_args()
    args.state_directory.mkdir(parents=True, exist_ok=True)
    handler = build_handler(args.expected_metric_name, args.state_directory)
    server = ReusableThreadingHTTPServer((args.bind_address, args.port), handler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
