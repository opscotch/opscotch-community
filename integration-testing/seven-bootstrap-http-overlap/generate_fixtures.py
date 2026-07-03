#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deployment-count", type=int, required=True)
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument("--time-scale", type=float, default=0.1)
    parser.add_argument("--slow-collectors-per-timeout", type=int, default=2)
    return parser.parse_args()


def scaled(milliseconds: int, scale: float, minimum: int = 1) -> int:
    return max(minimum, round(milliseconds * scale))


def timer(delay: int, period: int, scale: float) -> dict:
    return {
        "timer": {
            "delay": scaled(delay, scale),
            "period": scaled(period, scale),
        }
    }


def workflow(
    deployment_number: int,
    scale: float,
    slow_collectors_per_timeout: int,
) -> dict:
    prefix = f"overlap-{deployment_number}"

    def http_step(name: str, path: str, timeout: int, delay: int) -> dict:
        return {
            "stepId": f"{prefix}-{name}",
            "trigger": timer(delay, 10_000, scale),
            "httpTimeout": scaled(timeout, scale),
            "urlGenerator": {
                "script": f"context.setUrl('target', '{path}');"
            },
            "resultsProcessor": {
                "script": (
                    f"context.sendMetric('{prefix}-{name}', 1.0);"
                )
            },
        }

    collectors = [
        http_step("fast", f"/upstream/fast/{prefix}", 60_000, 200),
    ]
    for collector_number in range(1, slow_collectors_per_timeout + 1):
        collectors.extend(
            [
                http_step(
                    f"slow-60-{collector_number}",
                    f"/upstream/slow-60/{prefix}/{collector_number}",
                    60_000,
                    300 + collector_number,
                ),
                http_step(
                    f"slow-120-{collector_number}",
                    f"/upstream/slow-120/{prefix}/{collector_number}",
                    120_000,
                    400 + collector_number,
                ),
            ]
        )

    return {
        "workflows": [
            {
                "name": f"{prefix}-heartbeat",
                "steps": [
                    {
                        "stepId": f"{prefix}-heartbeat",
                        "trigger": timer(100, 10_000, scale),
                        "resultsProcessor": {
                            "script": (
                                f"context.sendMetric('{prefix}-heartbeat', 1.0);"
                            )
                        },
                    }
                ],
            },
            {
                "name": f"{prefix}-collectors",
                "steps": collectors,
            },
        ]
    }


def bootstrap(
    deployment_number: int,
    deployment_count: int,
    receiver_port: int,
    scale: float,
) -> dict:
    deployment_id = f"overlap-{deployment_number}"
    return {
        "deploymentId": deployment_id,
        "remoteConfiguration": f"/fixtures/workflow-{deployment_number}.json",
        "remoteConfigurationTimeout": scaled(30_000, scale),
        "frequency": scaled(10_000, scale),
        "persistenceRoot": f"/persistence/{deployment_id}",
        "allowExternalHostAccess": [
            {
                "id": "target",
                "host": f"http://127.0.0.1:{receiver_port}",
                "httpTimeout": scaled(60_000, scale),
                "allowList": [
                    {
                        "method": "GET",
                        "uriPattern": "/upstream/.*",
                    }
                ],
            }
        ],
        "errorHandling": {
            "enableLocalLogging": True,
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": f"phase-{deployment_count}",
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
    if args.time_scale <= 0:
        raise SystemExit("--time-scale must be greater than zero")
    if args.slow_collectors_per_timeout <= 0:
        raise SystemExit("--slow-collectors-per-timeout must be greater than zero")

    args.output_directory.mkdir(parents=True, exist_ok=True)
    definitions = []
    for number in range(1, args.deployment_count + 1):
        (args.output_directory / f"workflow-{number}.json").write_text(
            json.dumps(
                workflow(
                    number,
                    args.time_scale,
                    args.slow_collectors_per_timeout,
                ),
                indent=2,
            )
            + "\n"
        )
        definitions.append(
            bootstrap(
                number,
                args.deployment_count,
                args.receiver_port,
                args.time_scale,
            )
        )

    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(definitions, indent=2) + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
