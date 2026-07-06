#!/usr/bin/env python3

import argparse
import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--expected-metrics", type=int, required=True)
    parser.add_argument("--expected-logs", type=int, required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    return parser.parse_args()


def parse_records(path: str, body: str) -> list[dict]:
    try:
        return [json.loads(line) for line in body.splitlines() if line.strip()]
    except json.JSONDecodeError as error:
        raise ValueError(f"invalid {path} payload: {error}") from error


def build_handler(expected_metrics: int, expected_logs: int, state_directory: Path):
    metrics: list[dict] = []
    logs: list[dict] = []
    agent_metrics: list[dict] = []
    lock = threading.Lock()

    def remove_state_files() -> None:
        for name in (
            "complete.txt",
            "counts.json",
            "failure.txt",
            "received-agent-metrics.json",
            "received-logs.json",
            "received-metrics.json",
            "requests.ndjson",
        ):
            (state_directory / name).unlink(missing_ok=True)

    def write_state() -> None:
        (state_directory / "counts.json").write_text(
            json.dumps(
                {
                    "metrics": len(metrics),
                    "logs": len(logs),
                    "agentMetrics": len(agent_metrics),
                    "expectedMetrics": expected_metrics,
                    "expectedLogs": expected_logs,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        )
        (state_directory / "received-metrics.json").write_text(
            json.dumps(metrics, indent=2, sort_keys=True) + "\n"
        )
        (state_directory / "received-logs.json").write_text(
            json.dumps(logs, indent=2, sort_keys=True) + "\n"
        )
        (state_directory / "received-agent-metrics.json").write_text(
            json.dumps(agent_metrics, indent=2, sort_keys=True) + "\n"
        )
        if expected_metrics > 0 and expected_logs > 0 and len(metrics) >= expected_metrics and len(logs) >= expected_logs:
            (state_directory / "complete.txt").write_text("received\n")
        if agent_metrics:
            (state_directory / "pressure.txt").write_text("received\n")
        else:
            (state_directory / "pressure.txt").unlink(missing_ok=True)

    def append_request(path: str, body: bytes, record_count: int) -> None:
        entry = {
            "channel": path.removeprefix("/"),
            "bodyBytes": len(body),
            "bodyHash": hashlib.sha256(body).hexdigest(),
            "recordCount": record_count,
        }
        with (state_directory / "requests.ndjson").open("a", encoding="utf-8") as journal:
            journal.write(json.dumps(entry, sort_keys=True) + "\n")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
                return
            self.send_error(404)

        def do_POST(self) -> None:
            nonlocal metrics, logs, agent_metrics

            if self.path == "/reset":
                with lock:
                    metrics = []
                    logs = []
                    agent_metrics = []
                    remove_state_files()
                    write_state()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"reset")
                return

            if self.path not in ("/metrics", "/logs", "/agent-metrics"):
                self.send_error(404)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            body = raw_body.decode("utf-8")
            try:
                records = parse_records(self.path, body)
            except ValueError as error:
                (state_directory / "failure.txt").write_text(f"{error}\n{body}\n")
                self.send_error(400)
                return

            with lock:
                append_request(self.path, raw_body, len(records))
                if self.path == "/metrics":
                    metrics.extend(records)
                elif self.path == "/logs":
                    logs.extend(records)
                else:
                    agent_metrics.extend(records)
                write_state()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')

        def log_message(self, format_string: str, *args) -> None:
            return

    return Handler


def main() -> int:
    args = parse_args()
    args.state_directory.mkdir(parents=True, exist_ok=True)
    handler = build_handler(args.expected_metrics, args.expected_logs, args.state_directory)
    server = ReusableThreadingHTTPServer(("127.0.0.1", args.port), handler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
