#!/usr/bin/env python3

import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    parser.add_argument("--block-seconds", type=float, default=20.0)
    return parser.parse_args()


def build_handler(state_directory: Path, block_seconds: float):
    lock = threading.Lock()
    state = {
        "activeRequests": 0,
        "completedRequests": 0,
        "canceledRequests": 0,
        "maximumActiveRequests": 0,
        "lastPath": "",
    }

    def write_state() -> None:
        (state_directory / "state.json").write_text(
            json.dumps(state, indent=2, sort_keys=True) + "\n"
        )

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

            if self.path != "/block/20":
                self.send_error(404)
                return

            with lock:
                state["activeRequests"] += 1
                state["maximumActiveRequests"] = max(
                    state["maximumActiveRequests"], state["activeRequests"]
                )
                state["lastPath"] = self.path
                write_state()

            completed = False
            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()

                chunk_count = max(1, int(round(block_seconds)))
                for _ in range(chunk_count):
                    time.sleep(1)
                    self.wfile.write(b"1\r\n1\r\n")
                    self.wfile.flush()

                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
                completed = True
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                completed = False
            finally:
                with lock:
                    state["activeRequests"] -= 1
                    if completed:
                        state["completedRequests"] += 1
                    else:
                        state["canceledRequests"] += 1
                    write_state()

        def do_POST(self) -> None:
            if self.path == "/reset":
                with lock:
                    state.update(
                        {
                            "activeRequests": 0,
                            "completedRequests": 0,
                            "canceledRequests": 0,
                            "maximumActiveRequests": 0,
                            "lastPath": "",
                        }
                    )
                    write_state()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", "5")
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(b"reset")
                self.close_connection = True
                return
            self.send_error(404)

        def log_message(self, format_string: str, *args) -> None:
            return

    return Handler


def main() -> int:
    args = parse_args()
    args.state_directory.mkdir(parents=True, exist_ok=True)
    handler = build_handler(args.state_directory, args.block_seconds)
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
