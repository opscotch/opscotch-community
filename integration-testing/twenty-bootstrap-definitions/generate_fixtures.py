#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENT_COUNT = 20
ITEMS_PER_DEPLOYMENT = 100
TIMER_PERIOD_MS = 600_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="127.0.0.1")
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow(deployment_number: int) -> dict:
    heartbeat_script = (
        f"context.sendMetric('bootstrap-{deployment_number}-metric-001', 1.0);"
        f"context.diagnosticLog('bootstrap-{deployment_number}-log-001');"
    )
    collection_script = (
        "for (let item = 2; item <= 100; item++) {"
        " const suffix = String(item).padStart(3, '0');"
        f" context.sendMetric('bootstrap-{deployment_number}-metric-' + suffix, item);"
        f" context.diagnosticLog('bootstrap-{deployment_number}-log-' + suffix);"
        "}"
    )
    return {
        "workflows": [
            {
                "name": f"heartbeat-{deployment_number}",
                "steps": [
                    {
                        "stepId": f"heartbeat-{deployment_number}",
                        "trigger": {
                            "timer": {
                                "delay": 100,
                                "period": TIMER_PERIOD_MS,
                            }
                        },
                        "resultsProcessor": {
                            "script": heartbeat_script
                        },
                    }
                ],
            },
            {
                "name": f"collection-{deployment_number}",
                "steps": [
                    {
                        "stepId": f"collection-{deployment_number}",
                        "trigger": {
                            "timer": {
                                "delay": 200,
                                "period": TIMER_PERIOD_MS,
                            }
                        },
                        "resultsProcessor": {
                            "script": collection_script
                        },
                    }
                ],
            },
        ]
    }


def bootstrap_definition(
    deployment_number: int, receiver_host: str, receiver_port: int
) -> dict:
    deployment_id = f"twenty-bootstrap-{deployment_number}"
    return {
        "deploymentId": deployment_id,
        "remoteConfiguration": f"/fixtures/workflow-{deployment_number}.config.json",
        "remoteConfigurationTimeout": 30000,
        "frequency": 1000,
        "persistenceRoot": f"/persistence/{deployment_id}",
        "errorHandling": {
            "enableLocalLogging": True,
            "logs": {
                "enabled": True,
                "routingToken": deployment_id,
                "outputUrl": f"http://{receiver_host}:{receiver_port}/logs",
                "persistenceRoot": f"/persistence/{deployment_id}/logs",
            },
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": deployment_id,
                "outputUrl": f"http://{receiver_host}:{receiver_port}/metrics",
                "persistenceRoot": f"/persistence/{deployment_id}/metrics",
            },
            "errorHandling": {
                "enableLocalLogging": True,
            },
        },
    }


def main() -> int:
    args = parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)

    definitions = []
    expected_metrics = []
    expected_logs = []
    for deployment_number in range(1, DEPLOYMENT_COUNT + 1):
        workflow_path = args.output_directory / f"workflow-{deployment_number}.config.json"
        workflow_path.write_text(
            json.dumps(workflow(deployment_number), indent=2) + "\n"
        )
        definitions.append(
            bootstrap_definition(
                deployment_number, args.receiver_host, args.receiver_port
            )
        )
        for item in range(1, ITEMS_PER_DEPLOYMENT + 1):
            expected_metrics.append(
                f"bootstrap-{deployment_number}-metric-{item:03d}"
            )
            expected_logs.append(
                f"bootstrap-{deployment_number}-log-{item:03d}"
            )

    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(definitions, indent=2) + "\n"
    )
    (args.output_directory / "expected-metrics.json").write_text(
        json.dumps(expected_metrics, indent=2) + "\n"
    )
    (args.output_directory / "expected-logs.json").write_text(
        json.dumps(expected_logs, indent=2) + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
