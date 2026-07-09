#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENTS = (
    {"deployment_id": "bootstrap-priority-01", "startup_priority": 1, "label": "priority-01"},
    {"deployment_id": "bootstrap-priority-05", "startup_priority": 5, "label": "priority-05"},
    {"deployment_id": "bootstrap-priority-10", "startup_priority": 10, "label": "priority-10"},
)

TIMER_PERIOD_MS = 600_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow(label: str) -> dict:
    def run_once_step(step_id: str) -> dict:
        return {
            "stepId": step_id,
            "trigger": {
                "runOnce": True,
            },
            "data": {
                "phase": "runonce",
            },
            "resultsProcessor": {
                "script": (
                    "const label = context.getData('label');"
                    "context.sendMetric(label + '-metric-runonce', 1.0);"
                    "context.diagnosticLog(label + '-log-runonce');"
                ),
            },
        }

    def timer_step(step_id: str) -> dict:
        return {
            "stepId": step_id,
            "trigger": {
                "timer": {
                    "delay": 1000,
                    "period": TIMER_PERIOD_MS,
                },
            },
            "data": {
                "phase": "timer",
            },
            "resultsProcessor": {
                "script": (
                    "const label = context.getData('label');"
                    "context.sendMetric(label + '-metric-timer', 1.0);"
                    "context.diagnosticLog(label + '-log-timer');"
                ),
            },
        }

    return {
        "data": {
            "label": label,
        },
        "workflows": [
            {
                "name": f"{label}-startup-order",
                "steps": [
                    run_once_step(f"{label}-runonce"),
                    timer_step(f"{label}-timer"),
                ],
            }
        ],
    }


def bootstrap_record(deployment: dict, receiver_port: int) -> dict:
    deployment_id = deployment["deployment_id"]
    return {
        "enabled": True,
        "deploymentId": deployment_id,
        "startupPriority": deployment["startup_priority"],
        "remoteConfiguration": f"/fixtures/{deployment_id}.workflow.json",
        "remoteConfigurationTimeout": 30_000,
        "frequency": 0,
        "persistenceRoot": f"/persistence/{deployment_id}",
        "data": {
            "label": deployment["label"],
        },
        "errorHandling": {
            "enableLocalLogging": True,
            "logs": {
                "enabled": True,
                "routingToken": deployment_id,
                "outputUrl": f"http://127.0.0.1:{receiver_port}/logs",
                "persistenceRoot": f"/persistence/{deployment_id}/logs",
            },
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": deployment_id,
                "outputUrl": f"http://127.0.0.1:{receiver_port}/metrics",
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

    expected_metrics = []
    expected_logs = []
    bootstraps = []
    for deployment in DEPLOYMENTS:
        label = deployment["label"]
        (args.output_directory / f"{deployment['deployment_id']}.workflow.json").write_text(
            json.dumps(workflow(label), indent=2) + "\n"
        )
        bootstraps.append(bootstrap_record(deployment, args.receiver_port))

    for deployment in DEPLOYMENTS:
        label = deployment["label"]
        expected_metrics.append(f"{label}-metric-runonce")
        expected_logs.append(f"{label}-log-runonce")

    for deployment in DEPLOYMENTS:
        label = deployment["label"]
        expected_metrics.append(f"{label}-metric-timer")
        expected_logs.append(f"{label}-log-timer")

    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(bootstraps, indent=2) + "\n"
    )
    (args.output_directory / "expected-metrics.json").write_text(
        json.dumps(expected_metrics, indent=2) + "\n"
    )
    (args.output_directory / "expected-logs.json").write_text(
        json.dumps(expected_logs, indent=2) + "\n"
    )
    (args.output_directory / "expected-startup-order.json").write_text(
        json.dumps([deployment["deployment_id"] for deployment in DEPLOYMENTS], indent=2) + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
