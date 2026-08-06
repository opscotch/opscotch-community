#!/usr/bin/env python3

import argparse
import socket


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("count", type=int)
    return parser.parse_args()


def reserve_port() -> int:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def main() -> int:
    args = parse_args()
    ports = [str(reserve_port()) for _ in range(args.count)]
    print(" ".join(ports))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
