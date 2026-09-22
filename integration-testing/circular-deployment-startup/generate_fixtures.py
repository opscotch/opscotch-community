#!/usr/bin/env python3

import argparse
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def deployment(deployment_id: str, target_id: str) -> dict:
    return {
        "deploymentId": deployment_id,
        "remoteConfiguration": f"/fixtures/{deployment_id}.workflow.json",
        "remoteConfigurationTimeout": 10_000,
        "frequency": 600_000,
        "allowDeploymentAccess": [
            {
                "id": f"{target_id}-callers",
                "deploymentIds": [target_id],
                "access": "call",
            }
        ],
    }


def workflow(deployment_id: str) -> dict:
    return {
        "workflows": [
            {
                "name": deployment_id,
                "steps": [
                    {
                        "stepId": "ready",
                        "trigger": {"timer": {"delay": 60_000, "period": 600_000}},
                        "resultsProcessor": {"script": ""},
                    }
                ],
            }
        ]
    }


def main() -> int:
    args = parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)
    (args.output_directory / "bootstrap.json").write_text(
        json.dumps([deployment("alpha", "beta"), deployment("beta", "alpha")], indent=2)
        + "\n"
    )
    for deployment_id in ("alpha", "beta"):
        (args.output_directory / f"{deployment_id}.workflow.json").write_text(
            json.dumps(workflow(deployment_id), indent=2) + "\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
