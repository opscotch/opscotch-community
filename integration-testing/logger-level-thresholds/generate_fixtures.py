#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENTS = (
    {
        "id": "logger-levels-bootstrap-wins",
        "label": "bootstrap-wins",
        "bootstrap_levels": {"flow": "OFF", "diagnostic": "WARN"},
        "workflow_levels": {"flow": "DEBUG", "diagnostic": "DEBUG"},
    },
    {
        "id": "logger-levels-workflow-fallback",
        "label": "workflow-fallback",
        "bootstrap_levels": {},
        "workflow_levels": {"flow": "OFF", "diagnostic": "WARN"},
    },
    {
        "id": "logger-levels-control",
        "label": "control",
        "bootstrap_levels": {},
        "workflow_levels": {},
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="receiver")
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def levels(levels: dict[str, str]) -> dict:
    return {"levels": levels} if levels else {}


def workflow(label: str) -> dict:
    return {
        "workflows": [
            {
                "name": f"logger-levels-{label}-runonce",
                "steps": [
                    {
                        "stepId": "emit",
                        "trigger": {"runOnce": True},
                        "resultsProcessor": {
                            "script": (
                                f"context.sendMetric('logger-levels-{label}-complete', 1);"
                                f"context.diagnosticLog('logger-levels-{label}-diagnostic-info');"
                                "context.setBody('ok');"
                            )
                        },
                    }
                ],
            }
        ]
    }


def bootstrap(deployment: dict, host: str, port: int) -> dict:
    deployment_id = deployment["id"]
    return {
        "deploymentId": deployment_id,
        "remoteConfiguration": f"/fixtures/{deployment_id}.workflow.json",
        "remoteConfigurationTimeout": 30_000,
        "frequency": 0,
        "persistenceRoot": f"/persistence/{deployment_id}",
        "errorHandling": {
            "enableLocalLogging": True,
            "logs": {
                "enabled": True,
                "routingToken": deployment_id,
                "outputUrl": f"http://{host}:{port}/logs",
                "persistenceRoot": f"/persistence/{deployment_id}/logs",
                **levels(deployment["bootstrap_levels"]),
            },
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": deployment_id,
                "outputUrl": f"http://{host}:{port}/metrics",
                "persistenceRoot": f"/persistence/{deployment_id}/metrics",
            },
            "errorHandling": {
                "enableLocalLogging": True,
                "logs": {
                    "enabled": True,
                    "routingToken": deployment_id,
                    "outputUrl": f"http://{host}:{port}/logs",
                    "persistenceRoot": f"/persistence/{deployment_id}/workflow-logs",
                    **levels(deployment["workflow_levels"]),
                },
            },
        },
    }


def main() -> int:
    args = parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)
    bootstraps = []
    for deployment in DEPLOYMENTS:
        (args.output_directory / f"{deployment['id']}.workflow.json").write_text(
            json.dumps(workflow(deployment["label"]), indent=2) + "\n"
        )
        bootstraps.append(bootstrap(deployment, args.receiver_host, args.receiver_port))

    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(bootstraps, indent=2) + "\n"
    )
    (args.output_directory / "expected-metrics.json").write_text(
        json.dumps(
            [f"logger-levels-{deployment['label']}-complete" for deployment in DEPLOYMENTS],
            indent=2,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
