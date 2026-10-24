"""Unbound CI-only proposal: snapshot fixed browser traces, never upload."""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

HERE = Path(__file__).resolve().parent
CORE = HERE / 'stage.py'
CORE_SHA256 = '55817c49421cad82df7f25a0541d382fc1676f88c5b092886912568a0f9b7adb'
TRACE_CAP = 64 << 20
RETENTION_DAYS = 1


def load_core():
    before = CORE.lstat()
    if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or
            before.st_uid != os.getuid() or CORE.resolve(strict=True) != CORE or
            hashlib.sha256(CORE.read_bytes()).hexdigest() != CORE_SHA256):
        raise ValueError('fixed core identity')
    spec = importlib.util.spec_from_file_location('fixed_ci_trace_core', CORE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if module.signature(CORE.lstat()) != module.signature(before):
        raise ValueError('fixed core changed while loading')
    return module


core = load_core()


def trace_bound(raw, count, names):
    value = core.bound(raw, count, names)
    core.require(value <= TRACE_CAP, 'CI trace stored-byte bound')
    return value


def context_from_environment(env):
    core.require(not env.get('MORPHEUS_CD_DISPATCH_EFFECT_ID'), 'CI trace is not delivery evidence')
    return {'repository': env.get('GITHUB_REPOSITORY', ''), 'job': env.get('GITHUB_JOB', ''),
            'runId': env.get('GITHUB_RUN_ID', ''), 'runAttempt': env.get('GITHUB_RUN_ATTEMPT', ''),
            'workspace': env.get('GITHUB_WORKSPACE', ''), 'temporary': env.get('RUNNER_TEMP', '')}


def stage(context):
    core.require(set(context) == {'repository', 'job', 'runId', 'runAttempt', 'workspace', 'temporary'}, 'CI context schema')
    core.require(context['repository'] == 'cpheinrich/morpheus' and context['job'] == 'qa-browser', 'CI-only owner')
    core.require(all(isinstance(context[k], str) and re.fullmatch(r'[1-9][0-9]{0,19}', context[k])
                     for k in ('runId', 'runAttempt')), 'CI run identity')
    workspace = core.canonical_dir(context['workspace'])
    temporary = core.canonical_dir(context['temporary'])
    core.require(workspace != temporary and not core.inside(workspace, temporary) and
                 not core.inside(temporary, workspace), 'CI workspace and temp overlap')
    owner = temporary / 'artifact-byte-stage'
    try:
        owner.mkdir(mode=0o700)
    except FileExistsError:
        pass
    core.canonical_dir(owner)
    info = owner.lstat()
    core.require(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, 'CI stage parent')
    leaf = owner / (context['runId'] + '-' + context['runAttempt'] + '-ci-browser-traces')
    leaf.mkdir(mode=0o700)
    started = time.monotonic()
    deadline = started + core.MAX_SECONDS
    def expired():
        core.require(0 <= time.monotonic() - started <= core.MAX_SECONDS, 'CI staging deadline')
    core.write_once(leaf / 'claim.json', {'schema': 'ci-trace-claim/1', 'context': context,
                    'at': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    try:
        original = workspace / 'test-results'
        def select():
            expired()
            if not original.exists() and not original.is_symlink():
                return []
            return core.tree(original, budget={'scanned': 0, 'deadline': deadline})
        rows = select()
        accounting = core.inventory(rows)
        core.require(trace_bound(accounting['rawBytes'], accounting['files'], accounting['nameBytes']) ==
                     accounting['storedUpperBytes'], 'CI accounting')
        payload = leaf / 'payload'
        payload.mkdir(mode=0o700)
        entries = []
        for source, name, sig in rows:
            expired()
            dest = payload / name
            dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            digest = core.copy_regular(source, dest, sig, expired)
            entries.append({'name': name, 'bytes': sig[6], 'sha256': digest,
                            'signature': list(core.signature(dest.lstat()))})
        core.require(select() == rows, 'CI trace selection changed')
        for p in sorted([p for p in payload.rglob('*') if p.is_dir()], key=lambda p: len(p.parts), reverse=True):
            p.chmod(0o500)
        payload.chmod(0o500)
        manifest = {'schema': 'ci-trace-admission/1', 'status': 'ADMITTED' if rows else 'EMPTY',
                    'channel': 'ci-browser-traces', 'context': context, 'payloadRoot': str(payload),
                    'accounting': accounting, 'retentionDays': RETENTION_DAYS, 'entries': entries,
                    'capBytes': TRACE_CAP, 'archive': True, 'compressionLevel': 0,
                    'writerBoundary': 'After returned qa_tests step; detached private diagnostic snapshot, never test qualification'}
        core.verify_snapshot(manifest, deadline)
        trace_bound(accounting['rawBytes'], accounting['files'], accounting['nameBytes'])
        expired()
        core.write_once(leaf / 'admission.json', manifest)
        return manifest
    except Exception as error:
        core.write_once(leaf / 'refusal.json', {'status': 'REFUSED', 'reason': str(error), 'uploadAttempted': False})
        raise


def main():
    core.require(sys.argv[1:] == ['--github'], 'only fixed --github CI entry')
    result = stage(context_from_environment(os.environ))
    core.github_outputs(result, os.environ)
    print(json.dumps({'status': result['status'], 'payloadRoot': result['payloadRoot'],
                      'capBytes': result['capBytes'], 'retentionDays': result['retentionDays'],
                      'accounting': result['accounting']}, sort_keys=True))


if __name__ == '__main__':
    main()
