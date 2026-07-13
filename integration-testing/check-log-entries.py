#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


TIMESTAMP_PREFIX = re.compile(
    r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}[+-]\d{4}\s+"
)
DEV_FORMAT_PREFIX = re.compile(
    r"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}[+-]\d{4}\s+"
    r"[A-Z]+\s+"
    r"\[[^\]]+\]\s+"
    r"\([^)]*\)"
    r"(?:\s+(.*))?$"
)


@dataclass(frozen=True)
class Rule:
    name: str
    pattern: re.Pattern[str]


@dataclass(frozen=True)
class LogBlock:
    start_line: int
    end_line: int
    lines: list[str]

    @property
    def text(self) -> str:
        return "\n".join(self.lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Check a log file against known regex rules and report unknown log blocks."
        )
    )
    parser.add_argument(
        "--log",
        required=True,
        help="Path to the log file to check, or '-' for stdin.",
    )
    parser.add_argument(
        "--rules",
        required=True,
        help=(
            "Path to a JSON rules file. The file may contain either a top-level "
            "array of regex strings or an object with linePatterns and "
            "blockPatterns arrays. linePatterns must be a JSON array of regex "
            "strings."
        ),
    )
    return parser.parse_args()


def read_text(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    return Path(path).read_text(errors="replace")


def to_rule(entry: object, kind: str, index: int) -> Rule:
    if isinstance(entry, str):
        name = f"{kind}-{index + 1}"
        pattern = entry
    elif isinstance(entry, dict):
        if "pattern" not in entry:
            raise ValueError(f"{kind} rule {index + 1} is missing 'pattern'")
        pattern = entry["pattern"]
        if not isinstance(pattern, str):
            raise ValueError(f"{kind} rule {index + 1} has a non-string pattern")
        name = entry.get("name") or f"{kind}-{index + 1}"
    else:
        raise ValueError(f"{kind} rule {index + 1} must be a string or object")

    try:
        compiled = re.compile(pattern, re.MULTILINE)
    except re.error as error:
        raise ValueError(f"Invalid regex in {kind} rule {index + 1}: {error}") from error

    return Rule(name=name, pattern=compiled)


def to_line_rule(entry: object, index: int) -> Rule:
    if not isinstance(entry, str):
        raise ValueError(f"line pattern {index + 1} must be a string")
    try:
        compiled = re.compile(entry, re.MULTILINE)
    except re.error as error:
        raise ValueError(f"Invalid regex in line pattern {index + 1}: {error}") from error
    return Rule(name=f"line-{index + 1}", pattern=compiled)


def load_rules(path: str) -> tuple[list[Rule], list[Rule]]:
    raw = json.loads(read_text(path))
    if isinstance(raw, list):
        return [to_line_rule(entry, index) for index, entry in enumerate(raw)], []

    if not isinstance(raw, dict):
        raise ValueError("Rules file must be a JSON array or object")

    line_entries = raw.get("linePatterns")
    block_entries = raw.get("blockPatterns")

    if line_entries is None and block_entries is None and "patterns" in raw:
        line_entries = raw["patterns"]

    if line_entries is None:
        line_entries = []
    if block_entries is None:
        block_entries = []

    if not isinstance(line_entries, list):
        raise ValueError("'linePatterns' must be a JSON array when present")
    if not isinstance(block_entries, list):
        raise ValueError("'blockPatterns' must be a JSON array when present")

    line_rules = [to_line_rule(entry, index) for index, entry in enumerate(line_entries)]
    block_rules = [to_rule(entry, "block", index) for index, entry in enumerate(block_entries)]
    return line_rules, block_rules


def split_into_blocks(text: str) -> list[LogBlock]:
    lines = text.splitlines()
    if not lines:
        return []

    blocks: list[LogBlock] = []
    current_lines = [lines[0]]
    start_line = 1

    for line_number, line in enumerate(lines[1:], start=2):
        if TIMESTAMP_PREFIX.match(line):
            blocks.append(LogBlock(start_line=start_line, end_line=line_number - 1, lines=current_lines))
            current_lines = [line]
            start_line = line_number
        else:
            current_lines.append(line)

    blocks.append(LogBlock(start_line=start_line, end_line=len(lines), lines=current_lines))
    return blocks


def normalize_dev_message(line: str) -> str | None:
    match = DEV_FORMAT_PREFIX.match(line)
    if match is None:
        return None
    message = match.group(1)
    return "" if message is None else message


def render_unknown_line(line: str) -> str:
    message = normalize_dev_message(line)
    return line if message is None else message


def first_matching_rule(rules: Iterable[Rule], text: str) -> Rule | None:
    for rule in rules:
        if rule.pattern.search(text):
            return rule
    return None


def main() -> int:
    args = parse_args()

    try:
        line_rules, block_rules = load_rules(args.rules)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Failed to load rules: {error}", file=sys.stderr)
        return 2

    try:
        log_text = read_text(args.log)
    except OSError as error:
        print(f"Failed to read log: {error}", file=sys.stderr)
        return 2

    blocks = split_into_blocks(log_text)
    unknown_messages: list[tuple[int, str]] = []
    matched_block_count = 0
    matched_line_count = 0
    checked_line_count = 0

    for block in blocks:
        block_match = first_matching_rule(block_rules, block.text) if block_rules else None
        if block_match is not None:
            matched_block_count += 1
            continue

        for offset, line in enumerate(block.lines):
            if not line.strip():
                continue
            normalized_message = normalize_dev_message(line)
            line_target = normalized_message if normalized_message is not None else line
            if normalized_message is not None and not line_target.strip():
                continue
            checked_line_count += 1
            line_match = first_matching_rule(line_rules, line_target) if line_rules else None
            if line_match is not None:
                matched_line_count += 1
                continue
            unknown_messages.append((block.start_line + offset, render_unknown_line(line)))

    if unknown_messages:
        unknown_messages.sort(key=lambda item: (item[1], item[0]))
        print(
            f"Unknown log content found: {len(unknown_messages)} line(s)",
            file=sys.stderr,
        )
        for _, message in unknown_messages:
            if message.strip():
                print(message, file=sys.stderr)
        return 1

    print(
        "All log content matched known rules "
        f"({len(blocks)} block(s), {matched_block_count} block-matched, "
        f"{matched_line_count}/{checked_line_count} line-matched)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
