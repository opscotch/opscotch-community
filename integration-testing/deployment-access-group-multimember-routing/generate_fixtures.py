#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


CALLER_DEPLOYMENT_ID = "caller"
REMOTE_A_DEPLOYMENT_ID = "remote-a"
REMOTE_B_DEPLOYMENT_ID = "remote-b"
ACCESS_GROUP_ID = "bridge"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-host", default="127.0.0.1")
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--caller-port", type=int, required=True)
    parser.add_argument("--remote-a-port", type=int, required=True)
    parser.add_argument("--remote-b-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def caller_workflow() -> dict:
    return {
        "workflows": [
            {
                "name": "caller-workflow",
                "steps": [
                    {
                        "stepId": "call-target",
                        "trigger": {
                            "runOnce": True,
                        },
                        "resultsProcessor": {
                            "script": "context.sendToStep('bridge', 'deliver', 'go');",
                        },
                    }
                ],
            }
        ]
    }


def target_workflow(target_name: str) -> dict:
    return {
        "workflows": [
            {
                "name": f"{target_name}-workflow",
                "steps": [
                    {
                        "stepId": "deliver",
                        "trigger": {
                            "deploymentAccess": {
                                "ids": [ACCESS_GROUP_ID],
                            }
                        },
                        "resultsProcessor": {
                            "script": "context.sendMetric('selected-target', 1.0);",
                        },
                    }
                ],
            }
        ]
    }


def bootstrap(
    deployment_id: str,
    port: int,
    workflow_file: str,
    metric_output_path: str | None,
    access_mode: str,
    deployment_ids: list[str] | None,
) -> dict:
    record = {
        "deploymentId": deployment_id,
        "remoteConfiguration": f"/config/{workflow_file}",
        "remoteConfigurationTimeout": 30_000,
        "frequency": 0,
        "persistenceRoot": f"/persistence/{deployment_id}",
        "allowHttpServerAccess": [
            {
                "id": f"{deployment_id}-http",
                "port": port,
            }
        ],
        "allowDeploymentAccess": [
            {
                "id": ACCESS_GROUP_ID,
                "access": access_mode,
            }
        ],
        "workflow": {
            "errorHandling": {
                "enableLocalLogging": True,
            },
        },
    }
    if deployment_ids is not None:
        record["allowDeploymentAccess"][0]["deploymentIds"] = deployment_ids
    elif access_mode == "receive":
        record["allowDeploymentAccess"][0]["anyDeployment"] = True
    elif access_mode == "call":
        record["allowDeploymentAccess"][0]["startupWaitTimeoutMs"] = 20_000
    if metric_output_path is not None:
        record["workflow"]["metricOutput"] = {
            "enabled": True,
            "routingToken": deployment_id,
            "outputUrl": metric_output_path,
            "persistenceRoot": f"/persistence/{deployment_id}/metrics",
        }
    return record


def main() -> int:
    args = parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)

    (args.output_directory / "caller.workflow.json").write_text(
        json.dumps(caller_workflow(), indent=2) + "\n"
    )
    (args.output_directory / "target.workflow.json").write_text(
        json.dumps(target_workflow("target"), indent=2) + "\n"
    )

    bootstraps = [
        bootstrap(
            CALLER_DEPLOYMENT_ID,
            args.caller_port,
            "caller.workflow.json",
            None,
            "call",
            [REMOTE_A_DEPLOYMENT_ID, REMOTE_B_DEPLOYMENT_ID],
        ),
        bootstrap(
            REMOTE_A_DEPLOYMENT_ID,
            args.remote_a_port,
            "target.workflow.json",
            f"http://{args.receiver_host}:{args.receiver_port}/metrics/remote-a",
            "receive",
            [CALLER_DEPLOYMENT_ID],
        ),
        bootstrap(
            REMOTE_B_DEPLOYMENT_ID,
            args.remote_b_port,
            "target.workflow.json",
            f"http://{args.receiver_host}:{args.receiver_port}/metrics/remote-b",
            "receive",
            [CALLER_DEPLOYMENT_ID],
        ),
    ]
    (args.output_directory / "bootstrap.json").write_text(
        json.dumps(bootstraps, indent=2) + "\n"
    )
    (args.output_directory / "expected-paths.json").write_text(
        json.dumps(["/metrics/remote-a"], indent=2) + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
