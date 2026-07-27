#!/usr/bin/env python3

import argparse
import base64
import json
from pathlib import Path


DEPLOYMENTS = (
    {
        "deployment_id": "external-secrets-file",
        "bootstrap_file": "bootstrap-file.json",
        "secret_source_file": "file-source.txt",
        "expected_path": "/metrics/file",
        "path_token": "${FILE_TOKEN}",
    },
    {
        "deployment_id": "external-secrets-url",
        "bootstrap_file": "bootstrap-url.json",
        "secret_source_file": "url-source.txt",
        "expected_path": "/metrics/url",
        "path_token": "${URL_TOKEN}",
    },
    {
        "deployment_id": "external-secrets-hostrecord",
        "bootstrap_file": "bootstrap-hostrecord.json",
        "secret_source_file": "hostrecord-source.txt",
        "expected_path": "/metrics/hostrecord",
        "path_token": "${HOST_TOKEN}",
    },
    {
        "deployment_id": "external-secrets-combined",
        "bootstrap_file": "bootstrap-combined.json",
        "secret_source_file": "combined-source.txt",
        "expected_path": "/metrics/file/url/hostrecord",
        "path_token": "${FILE_TOKEN}/${URL_TOKEN}/${HOST_TOKEN}",
    },
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receiver-port", type=int, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def workflow() -> dict:
    return {
        "workflows": [
            {
                "name": "external-secrets-source-loading",
                "steps": [
                    {
                        "stepId": "emit-secret-token",
                        "trigger": {
                            "runOnce": True,
                        },
                        "resultsProcessor": {
                            "script": "context.sendMetric('external-secrets-source-loading', 1.0);",
                        },
                    }
                ],
            }
        ]
    }


def bootstrap_record(deployment_id: str, receiver_port: int, path_token: str) -> dict:
    persistence_root = f"/persistence/{deployment_id}"
    return {
        "enabled": True,
        "deploymentId": deployment_id,
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
                "routingToken": deployment_id,
                "outputUrl": f"http://127.0.0.1:{receiver_port}/metrics/{path_token}",
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

    expected_paths = []
    for deployment in DEPLOYMENTS:
        (args.output_directory / deployment["bootstrap_file"]).write_text(
            json.dumps(
                [bootstrap_record(
                    deployment["deployment_id"],
                    args.receiver_port,
                    deployment["path_token"],
                )],
                indent=2,
            )
            + "\n"
        )
        expected_paths.append(deployment["expected_path"])

    (args.output_directory / "file.properties").write_text("FILE_TOKEN=file\n")
    (args.output_directory / "plain.properties").write_text("URL_TOKEN=url\n")
    (args.output_directory / "hostrecord.properties").write_text(
        "HOST_TOKEN=hostrecord\n"
    )

    hostrecord = {
        "id": "external-secrets-hostrecord",
        "host": f"http://127.0.0.1:{args.receiver_port}/hostrecord.properties",
        "headers": {
            "X-Source-Case": "hostrecord",
        },
    }
    encoded_hostrecord = base64.b64encode(
        json.dumps(hostrecord, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")

    (args.output_directory / "file-source.txt").write_text(
        "file:/fixtures/file.properties\n"
    )
    (args.output_directory / "url-source.txt").write_text(
        f"http://127.0.0.1:{args.receiver_port}/plain.properties\n"
    )
    (args.output_directory / "hostrecord-source.txt").write_text(
        f"hostrecord:{encoded_hostrecord}\n"
    )
    (args.output_directory / "combined-source.txt").write_text(
        "file:/fixtures/file.properties;"
        f"http://127.0.0.1:{args.receiver_port}/plain.properties;"
        f"hostrecord:{encoded_hostrecord}\n"
    )
    (args.output_directory / "expected-paths.json").write_text(
        json.dumps(expected_paths, indent=2) + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
