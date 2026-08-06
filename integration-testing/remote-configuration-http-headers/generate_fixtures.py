#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENT_ID = "remote-configuration-http-headers"
WORKFLOW_NAME = "remote-configuration-http-headers"
STEP_ID = "emit-headers"
METRIC_NAME = "remote-configuration-http-headers-metric"
LOG_TOKEN = "remote-configuration-http-headers-log"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="127.0.0.1")
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--agent-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow(agent_port: int) -> dict:
    return {
        "workflows": [
            {
                "name": WORKFLOW_NAME,
                "steps": [
                    {
                        "stepId": STEP_ID,
                        "type": "scripted",
                        "trigger": {
                            "http": {
                                "server": "api",
                                "method": "GET",
                                "path": "/emit",
                            }
                        },
                        "resultsProcessor": {
                            "script": (
                                f"context.sendMetric('{METRIC_NAME}', 1.0);"
                                f"context.diagnosticLog('{LOG_TOKEN}');"
                                "context.setBody('ok');"
                            )
                        },
                    }
                ],
            }
        ]
    }


def bootstrap(receiver_host: str, receiver_port: int, agent_port: int) -> dict:
    persistence_root = f"/persistence/{DEPLOYMENT_ID}"
    return {
        "deploymentId": DEPLOYMENT_ID,
        "remoteConfiguration": f"http://{receiver_host}:{receiver_port}/workflow.json",
        "remoteConfigurationTimeout": 999,
        "frequency": 1_000,
        "persistenceRoot": persistence_root,
        "remoteConfigurationAuth": "Bearer remote-configuration-http-headers-auth",
        "remoteConfigurationHeaders": {
            "X-Config-Scenario": DEPLOYMENT_ID,
            "X-Config-Trace": "trace-447",
        },
        "allowHttpServerAccess": [
            {
                "id": "api",
                "port": agent_port,
                "bindAddress": "0.0.0.0",
            }
        ],
        "errorHandling": {
            "enableLocalLogging": True,
            "logs": {
                "enabled": True,
                "routingToken": DEPLOYMENT_ID,
                "outputUrl": f"http://{receiver_host}:{receiver_port}/logs",
                "persistenceRoot": f"{persistence_root}/logs",
            },
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": DEPLOYMENT_ID,
                "outputUrl": f"http://{receiver_host}:{receiver_port}/metrics",
                "persistenceRoot": f"{persistence_root}/metrics",
            },
            "errorHandling": {
                "enableLocalLogging": True,
            },
        },
    }


def main() -> int:
    args = parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)

    (args.output_directory / "workflow.json").write_text(
        json.dumps(workflow(args.agent_port), indent=2) + "\n"
    )
    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(
            [bootstrap(args.receiver_host, args.receiver_port, args.agent_port)], indent=2
        )
        + "\n"
    )
    (args.output_directory / "expected-config-headers.json").write_text(
        json.dumps(
            {
                "Authorization": "Bearer remote-configuration-http-headers-auth",
                "X-Config-Scenario": DEPLOYMENT_ID,
                "X-Config-Trace": "trace-447",
                "octstream": "true",
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    (args.output_directory / "metadata.json").write_text(
        json.dumps(
            {
                "deploymentId": DEPLOYMENT_ID,
                "expectedMetric": METRIC_NAME,
                "expectedLog": LOG_TOKEN,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
