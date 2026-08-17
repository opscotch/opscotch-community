#!/usr/bin/env python3

import argparse
import json
from pathlib import Path
from typing import Optional


DEPLOYMENT_ID = "workflow-timer-staggered-startup-delay"
WORKFLOW_NAME = "workflow-timer-staggered-startup-delay"
STEP_ID = "staggered-startup-delay-timer"
METRIC_NAME = "workflow-timer-staggered-startup-delay-metric"
PERIOD_MS = 60_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="127.0.0.1")
    parser.add_argument("--receiver-port", type=int, required=True)
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
                            "timer": {
                                "period": PERIOD_MS,
                            }
                        },
                        "resultsProcessor": {
                            "script": f"context.sendMetric('{METRIC_NAME}', 1.0);"
                        },
                    }
                ],
            }
        ]
    }


def bootstrap_record(
    receiver_host: str,
    receiver_port: int,
    stagger_pct: Optional[int],
    phase_name: str,
) -> dict:
    persistence_root = f"/persistence/{DEPLOYMENT_ID}/{phase_name}"
    workflow = {
        "metricOutput": {
            "enabled": True,
            "routingToken": DEPLOYMENT_ID,
            "outputUrl": f"http://{receiver_host}:{receiver_port}/metrics",
            "persistenceRoot": f"{persistence_root}/metrics",
        },
        "errorHandling": {
            "enableLocalLogging": True,
        },
    }
    if stagger_pct is not None:
        workflow["timers"] = {
            "staggerPct": stagger_pct,
        }
    return {
        "deploymentId": DEPLOYMENT_ID,
        "remoteConfiguration": "/fixtures/workflow.json",
        "remoteConfigurationTimeout": 30_000,
        "frequency": 0,
        "persistenceRoot": persistence_root,
        "workflow": workflow,
    }


def main() -> int:
    args = parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)

    (args.output_directory / "workflow.json").write_text(
        json.dumps(workflow(), indent=2) + "\n"
    )
    (args.output_directory / "bootstrap-baseline.json").write_text(
        json.dumps(
            [bootstrap_record(args.receiver_host, args.receiver_port, None, "baseline")],
            indent=2,
        )
        + "\n"
    )
    (args.output_directory / "bootstrap-staggered.json").write_text(
        json.dumps(
            [
                bootstrap_record(
                    args.receiver_host, args.receiver_port, 100, "staggered"
                )
            ],
            indent=2,
        )
        + "\n"
    )
    (args.output_directory / "metadata.json").write_text(
        json.dumps(
            {
                "deploymentId": DEPLOYMENT_ID,
                "metricName": METRIC_NAME,
                "periodMs": PERIOD_MS,
            },
            indent=2,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
