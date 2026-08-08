#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENT_ID = "remote-configuration-http-404-failure"
WORKFLOW_NAME = "remote-configuration-http-404-failure"
STEP_ID = "emit-404-token"
METRIC_NAME = "remote-configuration-http-404-failure-metric"
LOG_TOKEN = "remote-configuration-http-404-failure-log"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-port", type=int, required=True)
    parser.add_argument("--server-host", default="127.0.0.1")
    parser.add_argument("--agent-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow() -> dict:
    return {
        "workflows": [
            {
                "name": WORKFLOW_NAME,
                "steps": [
                    {
                        "stepId": STEP_ID,
                        "trigger": {
                            "runOnce": True,
                        },
                        "resultsProcessor": {
                            "script": (
                                f"context.sendMetric('{METRIC_NAME}', 1.0);"
                                f"context.diagnosticLog('{LOG_TOKEN}');"
                            ),
                        },
                    }
                ],
            }
        ]
    }


def bootstrap(server_host: str, server_port: int, agent_port: int) -> dict:
    receiver = f"http://{server_host}:{server_port}"
    return {
        "deploymentId": DEPLOYMENT_ID,
        "remoteConfiguration": f"{receiver}/workflow.json",
        "remoteConfigurationTimeout": 999,
        "frequency": 1000,
        "persistenceRoot": f"/persistence/{DEPLOYMENT_ID}",
        "errorHandling": {
            "enableLocalLogging": True,
            "logs": {
                "enabled": True,
                "routingToken": DEPLOYMENT_ID,
                "outputUrl": f"{receiver}/logs",
                "persistenceRoot": f"/persistence/{DEPLOYMENT_ID}/logs",
            },
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": DEPLOYMENT_ID,
                "outputUrl": f"{receiver}/metrics",
                "persistenceRoot": f"/persistence/{DEPLOYMENT_ID}/metrics",
            },
            "errorHandling": {
                "enableLocalLogging": True,
            },
        },
        "allowHttpServerAccess": [
            {
                "id": "api",
                "port": agent_port,
                "bindAddress": "0.0.0.0",
            }
        ],
    }


def main() -> int:
    args = parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)

    (args.output_directory / "workflow.json").write_text(
        json.dumps(workflow(), indent=2) + "\n"
    )
    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(
            [bootstrap(args.server_host, args.server_port, args.agent_port)], indent=2
        )
        + "\n"
    )
    (args.output_directory / "metadata.json").write_text(
        json.dumps(
            {
                "deploymentId": DEPLOYMENT_ID,
                "metricName": METRIC_NAME,
                "logToken": LOG_TOKEN,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
