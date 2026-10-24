"""Rebuild descriptive tables from frozen scores and provider trace caches.

Missing usage is unknown, never zero. Handoff presence is not report verification.
"""
import argparse
import json
from pathlib import Path


def read_private(path):
    path = Path(path)
    if not path.is_file():
        return None
    previous = path.stat().st_mode & 0o777
    path.chmod(0o600)
    try:
        return json.loads(path.read_text())
    finally:
        path.chmod(previous)


def summarize(root):
    root = Path(root)
    rows = read_private(root / "scores-locked.json")
    arms = {}
    cases = {}
    for row in rows:
        # Repeats describe noise, not additional independent successes.
        arm = row["arm"] + ("-repeat" if row["repeat"] else "")
        values = arms.setdefault(arm, dict(scheduled=0, accepted=0, handoffs=0, missingResults=0,
                         seconds=0, unknownElapsed=0, inputTokens=0, outputTokens=0, calls=0, unknownUsage=0))
        values["scheduled"] += 1
        final = row.get("final")
        values["missingResults"] += int(final is None or bool(final.get("artifactMissing")))
        values["accepted"] += int(bool(final and final["repairPassed"]))
        values["handoffs"] += int(bool(final and final["handoffMaterialPresent"]))
        if not row["repeat"]:
            cases.setdefault(row["case"], {})[row["arm"]] = bool(final and final["repairPassed"])
        for suffix, score_key in [("", "initial"), ("-continuation", "continuation")]:
            attempt = row.get(score_key)
            episode = root / "episodes" / (row["id"] + suffix)
            if attempt is None and suffix and not episode.exists():
                continue
            elapsed = ((attempt or {}).get("metadata") or {}).get("elapsedSeconds")
            values["unknownElapsed"] += int(elapsed is None)
            values["seconds"] += elapsed or 0
            traces = [episode / "trace.json"]
            manager = episode / "manager" / "trace.json"
            if (not suffix and row["arm"] in ("P", "F")) or manager.is_file():
                traces.append(manager)
            for trace_path in traces:
                trace = read_private(trace_path)
                if trace is None:
                    receipt = read_private(trace_path.parent / "receipt.json")
                    if not receipt or receipt.get("termination") != "not-started":
                        values["unknownUsage"] += 1
                    continue
                values["calls"] += 1
                usage = trace.get("usage", [])
                if not usage:
                    values["unknownUsage"] += 1
                for usage_row in usage:
                    if not all(type(usage_row.get(k)) is int for k in ["input_tokens", "output_tokens"]):
                        values["unknownUsage"] += 1
                        continue
                    values["inputTokens"] += usage_row["input_tokens"]
                    values["outputTokens"] += usage_row["output_tokens"]
    paired = {"bothPass": 0, "bothFail": 0, "FOnly": 0, "AOnly": 0}
    for values in cases.values():
        if "A" in values and "F" in values:
            paired[("bothPass" if values["A"] else "FOnly") if values["F"] else
                   ("AOnly" if values["A"] else "bothFail")] += 1
    return {"arms": arms, "paired": paired,
            "costComparisonComplete": all(v["unknownUsage"] == 0 for v in arms.values()),
            "limits": "Descriptive screening on six incident-inspired cases; unknown usage is excluded from token sums, not priced at zero."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    print(json.dumps(summarize(args.root), indent=2, sort_keys=True))
