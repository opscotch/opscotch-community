#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENT_COUNT = 20
ITEM_COUNT = 20


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="127.0.0.1")
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--agent-ports", required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow(deployment_number: int) -> dict:
    script = (
        f"for (let item = 1; item <= {ITEM_COUNT}; item++) {{"
        " const suffix = String(item).padStart(3, '0');"
        f" context.sendMetric('bootstrap-{deployment_number}-restart-metric-' + suffix, item);"
        "}"
        "context.setBody('ok');"
    )
    return {
        "workflows": [
            {
                "name": f"restart-durability-{deployment_number}",
                "steps": [
                    {
                        "stepId": f"health-{deployment_number}",
                        "trigger": {
                            "http": {
                                "server": "api",
                                "path": "/health",
                                "method": "GET",
                            }
                        },
                        "resultsProcessor": {"script": "context.setBody('ok');"},
                    },
                    {
                        "stepId": f"restart-{deployment_number}",
                        "trigger": {
                            "http": {
                                "server": "api",
                                "path": "/emit-restart",
                                "method": "POST",
                            }
                        },
                        "resultsProcessor": {"script": script},
                    },
                ],
            }
        ]
    }


def bootstrap_definition(
    deployment_number: int,
    agent_port: int,
    receiver_host: str,
    receiver_port: int,
) -> dict:
    deployment_id = f"restart-durability-{deployment_number}"
    return {
        "deploymentId": deployment_id,
        "remoteConfiguration": (
            f"/fixtures/workflow-{deployment_number}.config.json"
        ),
        "remoteConfigurationTimeout": 30000,
        "frequency": 1000,
        "persistenceRoot": f"/persistence/{deployment_id}",
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": deployment_id,
                "outputUrl": f"http://{receiver_host}:{receiver_port}/metrics",
                "persistenceRoot": f"/persistence/{deployment_id}/metrics",
            },
            "errorHandling": {"enableLocalLogging": True},
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
    agent_ports = [int(port) for port in args.agent_ports.split(",")]
    if len(agent_ports) != DEPLOYMENT_COUNT:
        raise ValueError(
            f"Expected {DEPLOYMENT_COUNT} agent ports, got {len(agent_ports)}"
        )

    args.output_directory.mkdir(parents=True, exist_ok=True)
    definitions = []
    expected_metrics = []
    for deployment_number, agent_port in enumerate(agent_ports, start=1):
        (args.output_directory / f"workflow-{deployment_number}.config.json").write_text(
            json.dumps(workflow(deployment_number), indent=2) + "\n"
        )
        definitions.append(
            bootstrap_definition(
                deployment_number,
                agent_port,
                args.receiver_host,
                args.receiver_port,
            )
        )
        expected_metrics.extend(
            f"bootstrap-{deployment_number}-restart-metric-{item:03d}"
            for item in range(1, ITEM_COUNT + 1)
        )

    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(definitions, indent=2) + "\n"
    )
    (args.output_directory / "expected-restart-metrics.json").write_text(
        json.dumps(expected_metrics, indent=2) + "\n"
    )
    (args.output_directory / "expected-restart-logs.json").write_text("[]\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
