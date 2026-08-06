#!/usr/bin/env python3

import socket
import sys


def main() -> int:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    sockets: list[socket.socket] = []
    try:
        for _ in range(count):
            listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            listener.bind(("127.0.0.1", 0))
            sockets.append(listener)
        print(" ".join(str(listener.getsockname()[1]) for listener in sockets))
        return 0
    finally:
        for listener in sockets:
            listener.close()


if __name__ == "__main__":
    raise SystemExit(main())
