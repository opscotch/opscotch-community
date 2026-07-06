#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


DEPLOYMENT_ID = "worker-pool-saturation-01"
WORKFLOW_NAME = "worker-pool-saturation"
DEFAULT_STAGE_COUNT = 20
DEFAULT_STAGE_SPACING_MS = 60_000
DEFAULT_TIMER_PERIOD_MS = 1_000
DEFAULT_WORK_DELAY_MS = 10_000
REQUEST_TIMEOUT_MS = 20_000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--collector-port", type=int, required=True)
    parser.add_argument("--target-port", type=int, required=True)
    parser.add_argument("--stage-count", type=int, default=DEFAULT_STAGE_COUNT)
    parser.add_argument("--stage-spacing-ms", type=int, default=DEFAULT_STAGE_SPACING_MS)
    parser.add_argument("--timer-period-ms", type=int, default=DEFAULT_TIMER_PERIOD_MS)
    parser.add_argument("--work-delay-ms", type=int, default=DEFAULT_WORK_DELAY_MS)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow(stage_count: int, stage_spacing_ms: int, timer_period_ms: int, work_delay_ms: int) -> dict:
    steps = []
    for stage_number in range(1, stage_count + 1):
        suffix = f"{stage_number:02d}"
        trigger_delay_ms = (stage_number - 1) * stage_spacing_ms
        steps.append(
            {
                "stepId": f"burst-{suffix}",
                "trigger": {
                    "runOnce": False,
                    "timer": {
                        "delay": trigger_delay_ms,
                        "period": timer_period_ms,
                    },
                },
                "httpTimeout": REQUEST_TIMEOUT_MS,
                "urlGenerator": {
                    "script": (
                        "context.setUrl('target', "
                        f"'/work?delayMs={work_delay_ms}&deployment={DEPLOYMENT_ID}&stage={suffix}&token=burst-{suffix}');"
                    )
                },
                "resultsProcessor": {
                    "script": (
                        f"context.sendMetric('worker-pool-saturation-metric-{suffix}', 1.0);"
                        f"context.diagnosticLog('worker-pool-saturation-log-{suffix}');"
                    )
                },
            }
        )

    return {
        "workflows": [
            {
                "name": WORKFLOW_NAME,
                "steps": steps,
            }
        ]
    }


def bootstrap(collector_port: int, target_port: int) -> dict:
    persistence_root = f"/persistence/{DEPLOYMENT_ID}"
    return {
        "deploymentId": DEPLOYMENT_ID,
        "remoteConfiguration": "/fixtures/workflow.json",
        "remoteConfigurationTimeout": REQUEST_TIMEOUT_MS,
        "frequency": 1000,
        "persistenceRoot": persistence_root,
        "allowExternalHostAccess": [
            {
                "id": "target",
                "host": f"http://127.0.0.1:{target_port}",
                "allowList": [
                    {
                        "method": "GET",
                        "uriPattern": "/work.*",
                    }
                ],
            }
        ],
        "errorHandling": {
            "enableLocalLogging": True,
            "logs": {
                "enabled": True,
                "routingToken": DEPLOYMENT_ID,
                "outputUrl": f"http://127.0.0.1:{collector_port}/logs",
                "persistenceRoot": f"{persistence_root}/logs",
            },
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": DEPLOYMENT_ID,
                "outputUrl": f"http://127.0.0.1:{collector_port}/metrics",
                "persistenceRoot": f"{persistence_root}/metrics",
            },
            "errorHandling": {
                "enableLocalLogging": True,
            },
        },
    }


def main() -> int:
    args = parse_args()
    if args.stage_count <= 0:
        raise SystemExit("--stage-count must be greater than zero")
    if args.stage_spacing_ms < 0:
        raise SystemExit("--stage-spacing-ms must not be negative")
    if args.timer_period_ms <= 0:
        raise SystemExit("--timer-period-ms must be greater than zero")
    if args.work_delay_ms < 0:
        raise SystemExit("--work-delay-ms must not be negative")

    args.output_directory.mkdir(parents=True, exist_ok=True)

    (args.output_directory / "workflow.json").write_text(
        json.dumps(
            workflow(
                args.stage_count,
                args.stage_spacing_ms,
                args.timer_period_ms,
                args.work_delay_ms,
            ),
            indent=2,
        )
        + "\n"
    )
    (args.output_directory / "bootstrap.json").write_text(
        json.dumps([bootstrap(args.collector_port, args.target_port)], indent=2) + "\n"
    )
    (args.output_directory / "metadata.json").write_text(
        json.dumps(
            {
                "deploymentId": DEPLOYMENT_ID,
                "stageCount": args.stage_count,
                "stageSpacingMs": args.stage_spacing_ms,
                "timerPeriodMs": args.timer_period_ms,
                "workDelayMs": args.work_delay_ms,
                "requestTimeoutMs": REQUEST_TIMEOUT_MS,
                "targetPort": args.target_port,
                "collectorPort": args.collector_port,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
