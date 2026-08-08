#!/usr/bin/env python3

import argparse
import base64
import json
from pathlib import Path


DEPLOYMENT_ID = "external-secrets-hostrecord-headers"
WORKFLOW_NAME = "external-secrets-hostrecord-headers"
STEP_ID = "emit-secret-header-metric"
METRIC_NAME = "external-secrets-hostrecord-headers-metric"
SECRET_METRIC_PATH = "external-secrets-hostrecord-headers"


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
                            "runOnce": True,
                        },
                        "resultsProcessor": {
                            "script": (
                                f"context.sendMetric('{METRIC_NAME}', 1.0);"
                            ),
                        },
                    }
                ],
            }
        ]
    }


def bootstrap_record(receiver_host: str, receiver_port: int) -> dict:
    persistence_root = f"/persistence/{DEPLOYMENT_ID}"
    return {
        "enabled": True,
        "deploymentId": DEPLOYMENT_ID,
        "remoteConfiguration": "/fixtures/workflow.json",
        "remoteConfigurationTimeout": 30_000,
        "frequency": 0,
        "persistenceRoot": persistence_root,
        "errorHandling": {
            "enableLocalLogging": True,
        },
        "workflow": {
            "metricOutput": {
                "enabled": True,
                "routingToken": DEPLOYMENT_ID,
                "outputUrl": (
                    f"http://{receiver_host}:{receiver_port}/metrics/${{SECRET_METRIC_PATH}}"
                ),
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
        json.dumps(workflow(), indent=2) + "\n"
    )
    (args.output_directory / "bootstrap.json").write_text(
        json.dumps([bootstrap_record(args.receiver_host, args.receiver_port)], indent=2)
        + "\n"
    )
    (args.output_directory / "secret.properties").write_text(
        f"SECRET_METRIC_PATH={SECRET_METRIC_PATH}\n"
    )

    expected_secret_headers = {
        "X-Secret-Scenario": DEPLOYMENT_ID,
        "X-Secret-Trace": "hostrecord-secret-header-mechanism",
    }
    (args.output_directory / "expected-secret-headers.json").write_text(
        json.dumps(expected_secret_headers, indent=2) + "\n"
    )
    (args.output_directory / "expected-metric-name.txt").write_text(
        f"{METRIC_NAME}\n"
    )
    (args.output_directory / "expected-metric-path.txt").write_text(
        f"/metrics/{SECRET_METRIC_PATH}\n"
    )

    hostrecord = {
        "id": DEPLOYMENT_ID,
        "host": f"http://{args.receiver_host}:{args.receiver_port}/secret.properties",
        "headers": expected_secret_headers,
    }
    encoded_hostrecord = base64.b64encode(
        json.dumps(hostrecord, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    (args.output_directory / "hostrecord-source.txt").write_text(
        f"hostrecord:{encoded_hostrecord}\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
