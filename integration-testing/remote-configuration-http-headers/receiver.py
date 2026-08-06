#!/usr/bin/env python3

import argparse
import hashlib
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--workflow-file", type=Path, required=True)
    parser.add_argument("--expected-config-headers", type=Path, required=True)
    parser.add_argument("--expected-metric-name", required=True)
    parser.add_argument("--expected-log-token", required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    return parser.parse_args()


def find_token(value, expected_token: str) -> bool:
    if isinstance(value, str):
        return expected_token in value
    if isinstance(value, list):
        return any(find_token(item, expected_token) for item in value)
    if isinstance(value, dict):
        return any(find_token(item, expected_token) for item in value.values())
    return False


def build_handler(
    workflow_body: bytes,
    expected_config_headers: dict[str, str],
    expected_metric_name: str,
    expected_log_token: str,
    state_directory: Path,
):
    lock = threading.Lock()
    request_count = 0
    received_metrics: list[dict] = []
    received_logs: list[dict] = []

    def write_state() -> None:
        (state_directory / "config-requests.ndjson").touch(exist_ok=True)
        (state_directory / "received-metrics.json").write_text(
            json.dumps(received_metrics, indent=2, sort_keys=True) + "\n"
        )
        (state_directory / "received-logs.json").write_text(
            json.dumps(received_logs, indent=2, sort_keys=True) + "\n"
        )
        if received_metrics and received_logs:
            (state_directory / "complete.txt").write_text("received\n")
        else:
            (state_directory / "complete.txt").unlink(missing_ok=True)

    def record_failure(reason: str) -> None:
        (state_directory / "failure.txt").write_text(reason.rstrip() + "\n")

    def record_config_request(headers: dict[str, str]) -> None:
        nonlocal request_count
        request_count += 1
        entry = {
            "sequence": request_count,
            "timestamp": time.time(),
            "headers": headers,
            "bodyBytes": len(workflow_body),
            "bodyHash": hashlib.sha256(workflow_body).hexdigest(),
        }
        with (state_directory / "config-requests.ndjson").open("a", encoding="utf-8") as journal:
            journal.write(json.dumps(entry, sort_keys=True) + "\n")

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self) -> None:
            if self.path == "/health":
                body = b"ok"
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(body)
                self.close_connection = True
                return

            if self.path != "/workflow.json":
                self.send_error(404)
                return

            observed_headers = {
                "Authorization": self.headers.get("Authorization"),
                "X-Config-Scenario": self.headers.get("X-Config-Scenario"),
                "X-Config-Trace": self.headers.get("X-Config-Trace"),
                "octstream": self.headers.get("octstream"),
            }

            for header_name, expected_value in expected_config_headers.items():
                if observed_headers.get(header_name) != expected_value:
                    with lock:
                        record_failure(
                            f"workflow header mismatch for {header_name}: "
                            f"expected {expected_value!r}, got {observed_headers.get(header_name)!r}"
                        )
                    self.send_error(400)
                    return

            with lock:
                record_config_request(observed_headers)

            body = workflow_body
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True

        def do_POST(self) -> None:
            if self.path not in ("/metrics", "/logs"):
                self.send_error(404)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length)
            try:
                records = [json.loads(line) for line in body.decode("utf-8").splitlines() if line.strip()]
            except json.JSONDecodeError as error:
                with lock:
                    record_failure(f"invalid payload for {self.path}: {error}")
                self.send_error(400)
                return

            with lock:
                if self.path == "/metrics":
                    matched = False
                    for record in records:
                        metric_name = record.get("name")
                        if metric_name == expected_metric_name:
                            if any(existing["name"] == metric_name for existing in received_metrics):
                                record_failure(f"duplicate metric received: {metric_name!r}")
                                self.send_error(409)
                                return
                            received_metrics.append(
                                {
                                    "name": metric_name,
                                    "timestamp": record.get("timestamp"),
                                    "value": record.get("value"),
                                }
                            )
                            matched = True
                else:
                    matched = False
                    for record in records:
                        if find_token(record, expected_log_token):
                            if any(existing["token"] == expected_log_token for existing in received_logs):
                                record_failure(f"duplicate log received: {expected_log_token!r}")
                                self.send_error(409)
                                return
                            received_logs.append(
                                {
                                    "token": expected_log_token,
                                    "timestamp": record.get("timestamp"),
                                    "value": record.get("value"),
                                }
                            )
                            matched = True

                if matched:
                    write_state()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "15")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            self.close_connection = True

        def log_message(self, format_string: str, *args) -> None:
            return

    return Handler


def main() -> int:
    args = parse_args()
    args.state_directory.mkdir(parents=True, exist_ok=True)
    workflow_body = args.workflow_file.read_bytes()
    expected_config_headers = json.loads(args.expected_config_headers.read_text())
    handler = build_handler(
        workflow_body,
        expected_config_headers,
        args.expected_metric_name,
        args.expected_log_token,
        args.state_directory,
    )
    server = ReusableThreadingHTTPServer((args.bind_address, args.port), handler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
