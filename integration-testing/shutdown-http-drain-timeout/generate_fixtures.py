#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


BLOCK_SECONDS = 20
REQUEST_TIMEOUT_MS = 30_000
TRIGGER_PERIOD_MS = 60_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase-name", required=True)
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--shutdown-timeout-seconds", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow(phase_name: str) -> dict:
    return {
        "workflows": [
            {
                "name": f"shutdown-http-drain-timeout-{phase_name}",
                "steps": [
                    {
                        "stepId": f"blocking-http-{phase_name}",
                        "trigger": {
                            "timer": {
                                "delay": 0,
                                "period": TRIGGER_PERIOD_MS,
                            },
                        },
                        "payloadGenerator": {
                            "script": "context.setBody(null);"
                        },
                        "urlGenerator": {
                            "script": "context.setUrl('target', '/block/20');"
                        },
                        "resultsProcessor": {
                            "script": (
                                f"context.diagnosticLog('shutdown-http-drain-timeout-{phase_name}-complete');"
                                "context.end();"
                            ),
                        },
                        "httpTimeout": REQUEST_TIMEOUT_MS,
                    }
                ],
            }
        ]
    }


def bootstrap(phase_name: str, receiver_port: int, shutdown_timeout_seconds: int) -> dict:
    deployment_id = f"shutdown-http-drain-timeout-{phase_name}"
    return {
        "deploymentId": deployment_id,
        "remoteConfiguration": "/fixtures/workflow.json",
        "remoteConfigurationTimeout": 30_000,
        "frequency": 0,
        "persistenceRoot": f"/persistence/{deployment_id}",
        "allowExternalHostAccess": [
            {
                "id": "target",
                "host": f"http://127.0.0.1:{receiver_port}",
                "allowList": [
                    {
                        "method": "GET",
                        "uriPattern": "/block/20",
                    }
                ],
            }
        ],
        "errorHandling": {
            "enableLocalLogging": True,
        },
        "workflow": {
            "shutdownTimeout": shutdown_timeout_seconds * 1000,
            "errorHandling": {
                "enableLocalLogging": True,
            },
        },
    }


def main() -> int:
    args = parse_args()
    if args.shutdown_timeout_seconds <= 0:
        raise SystemExit("--shutdown-timeout-seconds must be greater than zero")

    args.output_directory.mkdir(parents=True, exist_ok=True)
    (args.output_directory / "workflow.json").write_text(
        json.dumps(workflow(args.phase_name), indent=2) + "\n"
    )
    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(
            [bootstrap(args.phase_name, args.receiver_port, args.shutdown_timeout_seconds)],
            indent=2,
        )
        + "\n"
    )
    (args.output_directory / "metadata.json").write_text(
        json.dumps(
            {
                "phaseName": args.phase_name,
                "shutdownTimeoutSeconds": args.shutdown_timeout_seconds,
                "blockSeconds": BLOCK_SECONDS,
                "requestTimeoutMs": REQUEST_TIMEOUT_MS,
            },
            indent=2,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
