#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="127.0.0.1")
    parser.add_argument("--agent-ports", required=True)
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--workflow", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def output_config(url: str, deployment_id: str, persistence_root: str) -> dict:
    return {
        "enabled": True,
        "routingToken": deployment_id,
        "outputUrl": url,
        "outputAuthorization": "${TEST_OUTPUT_AUTH}",
        "persistenceRoot": persistence_root,
    }


def bootstrap_definition(
    definition_number: int,
    agent_port: int,
    receiver_host: str,
    receiver_port: int,
) -> dict:
    deployment_id = f"encrypted-output-authorization-{definition_number}"
    persistence_root = f"/persistence/{deployment_id}"
    return {
            "deploymentId": deployment_id,
            "remoteConfiguration": (
                f"/config/workflow-{definition_number}.config.json"
            ),
            "remoteConfigurationTimeout": 30000,
            "frequency": 1000,
            "persistenceRoot": persistence_root,
            "errorHandling": {
                "enableLocalLogging": True,
                "metrics": output_config(
                    f"http://{receiver_host}:{receiver_port}/metric/{definition_number}",
                    deployment_id,
                    f"{persistence_root}/metrics",
                ),
                "logs": output_config(
                    f"http://{receiver_host}:{receiver_port}/log/{definition_number}",
                    deployment_id,
                    f"{persistence_root}/logs",
                ),
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
                    "port": agent_port,
                    "bindAddress": "0.0.0.0",
                }
            ],
        }


def main() -> int:
    args = parse_args()
    agent_ports = [int(port) for port in args.agent_ports.split(",")]
    if len(agent_ports) != 2:
        raise ValueError(f"Expected 2 agent ports, got {len(agent_ports)}")

    workflow_contents = args.workflow.read_text()
    for definition_number in range(1, 3):
        workflow_path = (
            args.output.parent / f"workflow-{definition_number}.config.json"
        )
        workflow_path.write_text(workflow_contents)

    bootstrap = [
        bootstrap_definition(
            definition_number,
            agent_port,
            args.receiver_host,
            args.receiver_port,
        )
        for definition_number, agent_port in enumerate(agent_ports, start=1)
    ]
    args.output.write_text(json.dumps(bootstrap, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
