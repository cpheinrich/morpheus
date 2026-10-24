#!/usr/bin/env python3
"""Offline acceptance, after every relevant model process has terminated."""
import argparse
import fnmatch
import hashlib
import json
from pathlib import Path

from campaign import INSTRUCTIONS, load_plan, write_json
from grading import LocalSandboxRPC, freeze_source, grade_hidden


def read_private(path):
    path = Path(path)
    if not path.exists():
        return None
    path.chmod(0o600)
    return json.loads(path.read_text())


def inspect_integrity(case, workspace, instructions=INSTRUCTIONS):
    expected = {**case["commonContext"], **case["startFiles"], "AGENTS.md": instructions}
    violations = []
    for path in workspace.rglob("*"):
        name = path.relative_to(workspace).as_posix()
        if path.is_symlink():
            violations.append("symlink: " + name)
            continue
        if path.is_dir() or name.startswith("__pycache__/"):
            continue
        allowed = name in ("solution.py", "REPORT.md") or ("/" not in name and fnmatch.fnmatch(name, "test_*.py"))
        if not allowed and (name not in expected or path.read_bytes() != expected[name].encode()):
            violations.append("unexpected or changed immutable file: " + name)
    for name in expected:
        if not (workspace / name).is_file():
            violations.append("missing file: " + name)
    report = workspace / "REPORT.md"
    text = report.read_text() if report.is_file() and not report.is_symlink() else ""
    return {"integrityPassed": not violations, "violations": sorted(violations),
            "reportPresent": len(text) >= 80 and "python" in text.lower() and
                             ("limitation" in text.lower() or "unchecked" in text.lower())}


def score(root, curation, split):
    plan = load_plan(root, verify_collector=False)
    for name, expected in plan.get("scorerSha256", {}).items():
        if hashlib.sha256((Path(__file__).parent / name).read_bytes()).hexdigest() != expected:
            raise ValueError("frozen scorer changed: " + name)
    raw = (curation / "corpus.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != plan["corpusSha256"]:
        raise ValueError("corpus differs from frozen collection input")
    corpus = json.loads(raw)
    cases = {case["id"]: case for case in corpus["cases"]}
    rows = []
    for row in plan["schedule"]:
        if row["split"] != split:
            continue
        record = dict(row)
        for suffix in ("", "-continuation"):
            identity = row["id"] + suffix
            episode = root / "episodes" / identity
            workspace = root / "workspaces" / identity
            if not episode.exists():
                continue
            workspace.chmod(0o700)
            try:
                result = read_private(episode / "result.json")
                error = read_private(episode / "error.json")
                integrity = inspect_integrity(cases[row["case"]], workspace, plan["instructions"])
                if result:
                    for name, expected in result["artifactSha256"].items():
                        path = workspace / name
                        if path.is_symlink() or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                            raise ValueError("artifact changed after collection: " + identity + "/" + name)
                sha = freeze_source(workspace / "solution.py", workspace)
                rpc = LocalSandboxRPC(workspace / "solution.py", workspace, sha)
                grade = grade_hidden(curation / cases[row["case"]]["hiddenTests"]["path"], rpc)
                attempt = {"behavioralPassed": grade["passed"], **integrity,
                           "repairPassed": grade["passed"] and integrity["integrityPassed"],
                           "handoffMaterialPresent": grade["passed"] and integrity["integrityPassed"] and integrity["reportPresent"] and result is not None,
                           "collectorError": error, "metadata": result,
                           "hiddenTestsRun": grade["tests_run"], "sourceSha256": sha}
                write_json(root / "scores" / (identity + ".json"), {**attempt, "privateHiddenReport": grade["report"]})
                record["initial" if not suffix else "continuation"] = attempt
            finally:
                workspace.chmod(0)
        record["final"] = record.get("continuation", record.get("initial"))
        rows.append(record)
    write_json(root / ("scores-" + split + ".json"), rows)
    return rows


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("root", type=Path)
    p.add_argument("curation", type=Path)
    p.add_argument("--split", choices=["dev", "locked"], required=True)
    p.add_argument("--models-terminal", action="store_true")
    args = p.parse_args()
    if not args.models_terminal:
        p.error("--models-terminal requires operator proof; never reveal hidden grading before collection ends")
    rows = score(args.root, args.curation, args.split)
    print(json.dumps([{k: r[k] for k in ("id", "arm")} | {"repairPassed": r["final"]["repairPassed"] if r["final"] else None,
                      "handoffMaterialPresent": r["final"]["handoffMaterialPresent"] if r["final"] else None} for r in rows]))
