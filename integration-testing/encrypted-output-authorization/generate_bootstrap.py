#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-port", type=int, required=True)
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def output_config(url: str) -> dict:
    return {
        "enabled": True,
        "routingToken": "encrypted-output-authorization",
        "outputUrl": url,
        "outputAuthorization": "${TEST_OUTPUT_AUTH}",
        "persistenceRoot": "/persistence",
    }


def main() -> int:
    args = parse_args()
    receiver = f"http://127.0.0.1:{args.receiver_port}"
    bootstrap = [
        {
            "deploymentId": "encrypted-output-authorization",
            "remoteConfiguration": "/scenario/workflow.config.json",
            "remoteConfigurationTimeout": 30000,
            "frequency": 1000,
            "persistenceRoot": "/persistence",
            "errorHandling": {
                "enableLocalLogging": True,
                "metrics": output_config(f"{receiver}/metric"),
                "logs": output_config(f"{receiver}/log"),
            },
            "workflow": {
                "metricOutput": {
                    "enabled": False,
                },
                "errorHandling": {
                    "enableLocalLogging": True,
                },
            },
            "allowHttpServerAccess": [
                {
                    "id": "api",
                    "port": args.agent_port,
                    "bindAddress": "0.0.0.0",
                }
            ],
        }
    ]
    args.output.write_text(json.dumps(bootstrap, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
