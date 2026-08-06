#!/usr/bin/env python3

import argparse
import hashlib
import json
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--port-file", type=Path)
    parser.add_argument("--state-directory", type=Path, required=True)
    return parser.parse_args()


def build_handler(
    state_directory: Path,
):
    lock = threading.Lock()
    request_count = 0

    def write_state() -> None:
        (state_directory / "requests.ndjson").touch(exist_ok=True)

    def record_request(path: str, status: int, body: bytes = b"") -> None:
        nonlocal request_count
        request_count += 1
        entry = {
            "sequence": request_count,
            "timestamp": time.time(),
            "path": path,
            "status": status,
            "bodyBytes": len(body),
            "bodyHash": hashlib.sha256(body).hexdigest(),
        }
        with (state_directory / "requests.ndjson").open("a", encoding="utf-8") as journal:
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

            with lock:
                record_request(self.path, 404)

            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True

        def do_POST(self) -> None:
            if self.path != "/reset":
                self.send_error(404)
                return

            with lock:
                nonlocal request_count
                request_count = 0
                (state_directory / "requests.ndjson").unlink(missing_ok=True)
                (state_directory / "complete.txt").unlink(missing_ok=True)
                (state_directory / "failure.txt").unlink(missing_ok=True)

            body = b"reset"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True

        def log_message(self, format_string: str, *args) -> None:
            return

    return Handler


def main() -> int:
    args = parse_args()
    args.state_directory.mkdir(parents=True, exist_ok=True)
    handler = build_handler(args.state_directory)
    server = ReusableThreadingHTTPServer((args.bind_address, args.port), handler)
    if args.port_file is not None:
        args.port_file.write_text(f"{server.server_address[1]}\n")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
