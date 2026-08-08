#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENT_COUNT = 20
ONLINE_ITEMS = 25
BUFFERED_ITEMS = 100
PHASE_ITEMS = {
    "online": ONLINE_ITEMS,
    "connection": 20,
    "status-400": 5,
    "status-401": 5,
    "status-404": 5,
    "status-500": 5,
    "status-302": 5,
    "timeout": 5,
}
BATCH_ITEMS = 2500


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="127.0.0.1")
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--agent-ports", required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def emit_script(deployment_number: int, phase: str, item_count: int) -> str:
    return (
        f"for (let item = 1; item <= {item_count}; item++) {{"
        " const suffix = String(item).padStart(3, '0');"
        f" context.sendMetric('bootstrap-{deployment_number}-{phase}-metric-' + suffix, item);"
        f" context.diagnosticLog('bootstrap-{deployment_number}-{phase}-log-' + suffix);"
        "}"
        "context.setBody('ok');"
    )


def trigger_step(
    deployment_number: int,
    phase: str,
    item_count: int,
) -> dict:
    return {
        "stepId": f"{phase}-{deployment_number}",
        "trigger": {
            "http": {
                "server": "api",
                "path": f"/emit-{phase}",
                "method": "POST",
            }
        },
        "resultsProcessor": {
            "script": emit_script(deployment_number, phase, item_count)
        },
    }


def workflow(deployment_number: int) -> dict:
    steps = [
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
        }
    ]
    steps.extend(
        trigger_step(deployment_number, phase, item_count)
        for phase, item_count in PHASE_ITEMS.items()
    )
    if deployment_number == 1:
        steps.append(trigger_step(deployment_number, "batch", BATCH_ITEMS))

    return {
        "workflows": [
            {
                "name": f"buffer-recovery-{deployment_number}",
                "steps": steps,
            }
        ]
    }


def bootstrap_definition(
    deployment_number: int,
    agent_port: int,
    receiver_host: str,
    receiver_port: int,
) -> dict:
    deployment_id = f"buffer-recovery-{deployment_number}"
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
        "allowHttpServerAccess": [
            {
                "id": "api",
                "port": agent_port,
                "bindAddress": "0.0.0.0",
            }
        ],
    }


def expected_tokens(
    phase: str,
    kind: str,
    item_count: int,
    deployment_count: int = DEPLOYMENT_COUNT,
) -> list[str]:
    return [
        f"bootstrap-{deployment_number}-{phase}-{kind}-{item:03d}"
        for deployment_number in range(1, deployment_count + 1)
        for item in range(1, item_count + 1)
    ]


def main() -> int:
    args = parse_args()
    agent_ports = [int(port) for port in args.agent_ports.split(",")]
    if len(agent_ports) != DEPLOYMENT_COUNT:
        raise ValueError(
            f"Expected {DEPLOYMENT_COUNT} agent ports, got {len(agent_ports)}"
        )

    args.output_directory.mkdir(parents=True, exist_ok=True)
    definitions = []
    for deployment_number, agent_port in enumerate(agent_ports, start=1):
        workflow_path = (
            args.output_directory / f"workflow-{deployment_number}.config.json"
        )
        workflow_path.write_text(
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

    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(definitions, indent=2) + "\n"
    )
    expected_phases = dict(PHASE_ITEMS)
    expected_phases["batch"] = BATCH_ITEMS
    for phase, item_count in expected_phases.items():
        deployment_count = 1 if phase == "batch" else DEPLOYMENT_COUNT
        (args.output_directory / f"expected-{phase}-metrics.json").write_text(
            json.dumps(
                expected_tokens(
                    phase,
                    "metric",
                    item_count,
                    deployment_count,
                ),
                indent=2,
            )
            + "\n"
        )
        (args.output_directory / f"expected-{phase}-logs.json").write_text(
            json.dumps(
                expected_tokens(
                    phase,
                    "log",
                    item_count,
                    deployment_count,
                ),
                indent=2,
            )
            + "\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
