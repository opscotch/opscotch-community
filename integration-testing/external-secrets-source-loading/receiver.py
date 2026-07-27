#!/usr/bin/env python3

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--fixtures-directory", type=Path, required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    parser.add_argument("--expected-paths", type=Path, required=True)
    return parser.parse_args()


def build_handler(fixtures_directory: Path, state_directory: Path, expected_paths: set[str]):
    lock = threading.Lock()
    received_paths: list[str] = []
    seen_paths: set[str] = set()

    def write_state() -> None:
        (state_directory / "received-paths.json").write_text(
            json.dumps(received_paths, indent=2) + "\n"
        )
        if seen_paths == expected_paths:
            (state_directory / "complete.txt").write_text("received\n")
        else:
            (state_directory / "complete.txt").unlink(missing_ok=True)

    def fail(reason: str) -> None:
        (state_directory / "failure.txt").write_text(reason.rstrip() + "\n")

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

            if self.path == "/plain.properties":
                body = read_fixture("plain.properties")
            elif self.path == "/hostrecord.properties":
                if self.headers.get("X-Source-Case") != "hostrecord":
                    with lock:
                        fail(
                            "hostrecord source missing required X-Source-Case header"
                        )
                    self.send_error(400)
                    return
                body = read_fixture("hostrecord.properties")
            else:
                self.send_error(404)
                return

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
                records = [json.loads(line) for line in raw_body.decode("utf-8").splitlines() if line.strip()]
            except json.JSONDecodeError as error:
                with lock:
                    fail(f"invalid metric payload: {error}")
                self.send_error(400)
                return

            with lock:
                if self.path not in expected_paths:
                    fail(f"unexpected metrics path: {self.path}")
                    self.send_error(400)
                    return
                if self.path in seen_paths:
                    fail(f"duplicate metrics path: {self.path}")
                    self.send_error(409)
                    return
                if not records:
                    fail(f"empty metric payload for {self.path}")
                    self.send_error(400)
                    return
                seen_paths.add(self.path)
                received_paths.append(self.path)
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
    expected_paths = set(json.loads(args.expected_paths.read_text()))
    handler = build_handler(args.fixtures_directory, args.state_directory, expected_paths)
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
