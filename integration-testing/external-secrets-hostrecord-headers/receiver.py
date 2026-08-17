#!/usr/bin/env python3

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


SECRET_PATH = "/secret.properties"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--fixtures-directory", type=Path, required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    parser.add_argument("--expected-secret-headers", type=Path, required=True)
    parser.add_argument("--expected-metric-name", type=Path, required=True)
    parser.add_argument("--expected-metric-path", type=Path, required=True)
    return parser.parse_args()


def build_handler(
    fixtures_directory: Path,
    state_directory: Path,
    expected_secret_headers: dict[str, str],
    expected_metric_name: str,
    expected_metric_path: str,
):
    lock = threading.Lock()
    secret_requests: list[dict[str, object]] = []
    metric_requests: list[dict[str, object]] = []
    failure_reason: str | None = None

    def write_state() -> None:
        (state_directory / "received-secret-requests.json").write_text(
            json.dumps(secret_requests, indent=2) + "\n"
        )
        (state_directory / "received-metric-requests.json").write_text(
            json.dumps(metric_requests, indent=2) + "\n"
        )
        if secret_requests and metric_requests:
            (state_directory / "complete.txt").write_text("received\n")
        else:
            (state_directory / "complete.txt").unlink(missing_ok=True)

    def fail(reason: str) -> None:
        nonlocal failure_reason
        if failure_reason is None:
            failure_reason = reason.rstrip()
            (state_directory / "failure.txt").write_text(failure_reason + "\n")
            (state_directory / "complete.txt").unlink(missing_ok=True)

    def read_fixture(name: str) -> bytes:
        return (fixtures_directory / name).read_bytes()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self) -> None:
            if self.path == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", "2")
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(b"ok")
                self.close_connection = True
                return

            if self.path != SECRET_PATH:
                self.send_error(404)
                return

            observed_headers = {
                name: self.headers.get(name) for name in expected_secret_headers
            }
            for header_name, expected_value in expected_secret_headers.items():
                actual_value = observed_headers.get(header_name)
                if actual_value != expected_value:
                    with lock:
                        fail(
                            "secret fetch missing required header "
                            f"{header_name!r}: expected {expected_value!r}, got {actual_value!r}"
                        )
                    self.send_error(400)
                    return

            with lock:
                if not secret_requests:
                    secret_requests.append(
                        {
                            "path": self.path,
                            "headers": observed_headers,
                        }
                    )
                elif secret_requests[0]["headers"] != observed_headers:
                    fail("secret fetch headers changed between requests")
                    self.send_error(409)
                    return
                write_state()

            body = read_fixture("secret.properties")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True

        def do_POST(self) -> None:
            if not self.path.startswith("/metrics/"):
                self.send_error(404)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            try:
                records = [
                    json.loads(line)
                    for line in raw_body.decode("utf-8").splitlines()
                    if line.strip()
                ]
            except json.JSONDecodeError as error:
                with lock:
                    fail(f"invalid metric payload: {error}")
                self.send_error(400)
                return

            with lock:
                if self.path != expected_metric_path:
                    fail(
                        f"unexpected metrics path: {self.path}, "
                        f"expected {expected_metric_path}"
                    )
                    self.send_error(400)
                    return
                if not records:
                    fail(f"empty metric payload for {self.path}")
                    self.send_error(400)
                    return

                metric_names = [record.get("name") for record in records]
                if metric_names != [expected_metric_name]:
                    fail(f"unexpected metric names: {metric_names}")
                    self.send_error(400)
                    return

                if not metric_requests:
                    metric_requests.append(
                        {
                            "path": self.path,
                            "names": metric_names,
                            "count": len(records),
                        }
                    )
                elif metric_requests[0]["names"] != metric_names:
                    fail("metric payload changed between requests")
                    self.send_error(409)
                    return
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
    expected_secret_headers = json.loads(args.expected_secret_headers.read_text())
    expected_metric_name = args.expected_metric_name.read_text().strip()
    expected_metric_path = args.expected_metric_path.read_text().strip()
    handler = build_handler(
        args.fixtures_directory,
        args.state_directory,
        expected_secret_headers,
        expected_metric_name,
        expected_metric_path,
    )
    ThreadingHTTPServer((args.bind_address, args.port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
