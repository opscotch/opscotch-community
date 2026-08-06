#!/usr/bin/env python3

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--bind-address", default="127.0.0.1")
    parser.add_argument("--expected-authorization", required=True)
    parser.add_argument("--state-directory", type=Path, required=True)
    return parser.parse_args()


def build_handler(expected_authorization: str, state_directory: Path):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")
                return
            self.send_error(404)

        def do_POST(self) -> None:
            output_name = {
                "/metric/1": "metric-1",
                "/log/1": "log-1",
                "/metric/2": "metric-2",
                "/log/2": "log-2",
            }.get(self.path)
            if output_name is None:
                self.send_error(404)
                return

            actual_authorization = self.headers.get("Authorization")
            if actual_authorization != expected_authorization:
                failure = (
                    f"{output_name} Authorization mismatch: "
                    f"expected {expected_authorization!r}, got {actual_authorization!r}\n"
                )
                (state_directory / "failure.txt").write_text(failure)
                self.send_error(401)
                return

            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length)
            (state_directory / f"{output_name}.body").write_bytes(body)
            (state_directory / f"{output_name}.received").write_text("received\n")

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
    handler = build_handler(args.expected_authorization, args.state_directory)
    server = ThreadingHTTPServer((args.bind_address, args.port), handler)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
