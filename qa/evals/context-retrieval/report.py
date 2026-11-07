"""Verify and aggregate a complete development or holdout run from saved responses."""
from collections import defaultdict
from functools import cache
from hashlib import sha256
import json
import math
from pathlib import Path
import random
import statistics
import sys

import tiktoken


def require(condition, message):
    if not condition:
        raise ValueError(message)


@cache
def source_lines(path):
    text = path.read_bytes().decode("utf8")
    if text.endswith("\n"):
        text = text[:-1]
    return text.removesuffix("\r").replace("\r\n", "\n").split("\n")


def rerender(response, root, case):
    parts = []
    spans = response["snippets"]
    for index, span in enumerate(spans):
        path, first, last = span["path"], span["first"], span["last"]
        require(path not in case["exclude"] and not Path(path).is_absolute()
                and ".." not in Path(path).parts, "Invalid citation path")
        lines = source_lines(root / path)
        require(1 <= first <= last <= len(lines), "Invalid citation range")
        require(sum(other["path"] == path for other in spans) <= 2, "Per-file cap exceeded")
        require(not any(other["path"] == path and other["first"] <= last
                        and first <= other["last"] for other in spans[:index]), "Overlapping citations")
        parts.append(f"{path}:{first}-{last}\n" + "\n".join(lines[first - 1:last]) + "\n\n")
    return "".join(parts)


def recompute(row, case, directory, encode):
    require(all(row[key] == case[key] for key in ("project", "kind", "group")), "Case metadata drift")
    require(math.isfinite(row["totalQueryMs"]) and 0 <= row["searchMs"] <= row["totalQueryMs"],
            "Invalid timer")
    response = json.loads(row["response"])
    root = directory / case["project"] / "rg"
    require(response["output"] == rerender(response, root, case), "Response differs from source")
    tokens = len(encode(response["output"]))
    require(tokens == response["returnedTokens"] and tokens <= row["budget"], "Token mismatch")
    targets = case["targets"]
    hits = [(span, target) for span in response["snippets"] for target in targets
            if span["path"] == target["path"]]
    evidence = any(span["first"] <= target["first"] and span["last"] >= target["last"]
                   for span, target in hits)
    require(evidence == row["evidence"] and bool(hits) == row["file"], "Score mismatch")
    require(not row.get("error") or not response["snippets"], "Error returned evidence")
    return {**row, "tokens": tokens}


def interval(differences, seed=1007):
    randomizer = random.Random(seed)
    n = len(differences)
    samples = sorted(statistics.fmean(randomizer.choices(differences, k=n)) for _ in range(2000))
    return [samples[49], samples[1949]]


def summarize(selected, baseline):
    grouped = defaultdict(list)
    for row in selected:
        grouped[row["group"]].append(row)
    evidence = [statistics.fmean(row["evidence"] for row in group) for group in grouped.values()]
    file = [statistics.fmean(row["file"] for row in group) for group in grouped.values()]
    deltas = [statistics.fmean(row["evidence"] - baseline[row["case"]]["evidence"] for row in group)
              for group in grouped.values()]
    return {
        "cases": len(selected), "groups": len(grouped),
        "evidenceHits": sum(row["evidence"] for row in selected),
        "fileHits": sum(row["file"] for row in selected),
        "groupWeightedEvidenceRecall": statistics.fmean(evidence),
        "groupWeightedFileRecall": statistics.fmean(file),
        "pairedEvidenceDelta": statistics.fmean(deltas),
        "pairedBootstrap95": interval(deltas),
        "errors": sum(bool(row.get("error")) for row in selected),
        "medianReturnedTokens": statistics.median(row["tokens"] for row in selected),
        **timing(selected),
    }


def timing(selected):
    warm = [row["totalQueryMs"] for row in selected if not row["firstQuery"]]
    return {
        "totalQueryMs": sum(row["totalQueryMs"] for row in selected),
        "firstQueryMs": [row["totalQueryMs"] for row in selected if row["firstQuery"]],
        "warmMedianMs": statistics.median(warm) if warm else None,
        "warmP95Ms": sorted(warm)[math.ceil(.95 * len(warm)) - 1] if warm else None,
    }


def report(frame, directory):
    run = json.loads((directory / "run.json").read_text())
    require(run["split"] in {"pilot", "dev", "holdout"}, "Invalid split")
    require(sha256((frame / "frame.json").read_bytes()).hexdigest() == run["frame"], "Wrong frame")
    split = "dev" if run["split"] == "pilot" else run["split"]
    fixture = frame / (split + ".json")
    frozen = json.loads((frame / "frame.json").read_text())
    require(sha256(fixture.read_bytes()).hexdigest() == frozen["fixtures"][split], "Fixture drift")
    cases = {case["id"]: case for case in json.loads(fixture.read_text())}
    if run["split"] == "pilot":
        cases = {case_id: cases[case_id] for case_id in run["caseIds"]}
    expected = {(case_id, method, budget) for case_id in cases for method in run["methods"]
                for budget in run["budgets"]}
    rows = []
    encode = tiktoken.get_encoding("o200k_base").encode_ordinary
    for line in (directory / "responses.jsonl").open():
        row = json.loads(line)
        key = row["case"], row["method"], row["budget"]
        require(key in expected, "Unexpected or duplicate row")
        expected.remove(key)
        rows.append(recompute(row, cases[row["case"]], directory, encode))
    require(not expected, f"Incomplete run. Missing {len(expected)} cells")
    baseline = {(row["budget"], row["case"]): row for row in rows if row["method"] == "ripgrep"}
    slices = defaultdict(list)
    for row in rows:
        scopes = ["all", row["project"], "kind/" + row["kind"], row["project"] + "/" + row["kind"]]
        if row["kind"] != "literal-id":
            scopes.append("descriptive")
        for name in scopes:
            slices[(name, row["method"], row["budget"])].append(row)
    summaries = [
        dict(scope=name, method=method, budget=budget, **summarize(
            selected, {row["case"]: baseline[(budget, row["case"])] for row in selected}))
        for (name, method, budget), selected in sorted(slices.items())
    ]
    with (directory / "verified-report.json").open("x") as output:
        json.dump({"verifiedRows": len(rows), "summary": summaries}, output, indent=2)
    print(f"Verified {len(rows)} unique paired cells")


if __name__ == "__main__":
    report(*map(Path, sys.argv[1:]))
