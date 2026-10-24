"""Private, unbound prototype: snapshot one of six artifact channels, never upload."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import time
import unicodedata

CAP = 1 << 30
MAX_FILES = 32768
MAX_PATH = 4096
MAX_NAMES = 32 << 20
MAX_DEPTH = 64
MAX_SCANNED = 65536
MAX_SECONDS = 120
CHANNELS = {
    'native-screenshots': (14, False),
    'native-complete-evidence': (30, True),
    'native-failure-evidence': (14, False),
    'qualified-tests': (90, True),
    'upload-acceptance-resource': (90, True),
    'fault-audit': (14, False),
}
QUALIFIED = {'evidence.json', 'tested-sha.txt', 'only-testing.txt',
             'skip-testing.txt', 'execution.json', 'enumeration.json',
             'tests.json', 'summary.json', 'skip-details.json'}


class Refused(Exception):
    pass


def require(value, reason):
    if not value:
        raise Refused(reason)


def bound(raw, count, names):
    require(all(type(n) is int and n >= 0 for n in (raw, count, names)), 'bad accounting')
    require(count <= MAX_FILES and names <= MAX_NAMES, 'census bound')
    value = 2 * raw + 4 * names + 4096 * count + 1048576
    require(value <= CAP, 'stored-byte bound')
    return value


def signature(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def canonical_dir(path):
    p = Path(path)
    require(p.is_absolute() and '\n' not in str(p) and '\r' not in str(p), 'absolute canonical directory')
    require(str(p) == str(p.resolve(strict=True)), 'noncanonical directory')
    for q in [p] + list(p.parents):
        require(stat.S_ISDIR(q.lstat().st_mode), 'linked directory')
    return p


def inside(p, root):
    try:
        p.relative_to(root)
        return p != root
    except ValueError:
        return False


def name_ok(name):
    require(name and not name.startswith('/') and '\\' not in name, 'path spelling')
    parts = name.split('/')
    require(len(parts) <= MAX_DEPTH and all(x not in ('', '.', '..') for x in parts), 'path depth')
    require(not any(ord(c) < 32 or ord(c) == 127 for c in name), 'control in path')
    require(not any(c in name for c in ':*?"<>|'), 'unsupported ZIP path')
    try:
        length = len(name.encode('utf8', 'strict'))
    except UnicodeError:
        raise Refused('non-UTF8 path')
    require(length <= MAX_PATH, 'path byte bound')
    return length


def regular(path):
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'not single-link regular file')
    require(s.st_uid == os.getuid(), 'foreign file owner')
    return s


def tree(root, prefix='', direct=False, suffixes=None, budget=None):
    canonical_dir(root)
    require(root.lstat().st_uid == os.getuid(), 'foreign source root')
    if budget is None:
        budget = {'scanned': 0, 'deadline': time.monotonic() + MAX_SECONDS}
    found = []
    def walk(directory, relative):
        require(len(relative.split('/')) <= MAX_DEPTH, 'directory depth')
        children = []
        with os.scandir(str(directory)) as it:
            for entry in it:
                require(time.monotonic() <= budget['deadline'], 'selection deadline')
                budget['scanned'] += 1
                require(budget['scanned'] <= MAX_SCANNED, 'scan bound')
                children.append(Path(entry.path))
        for p in sorted(children, key=lambda x: x.name):
            if p.name.startswith('.'):
                continue  # Same include-hidden-files:false selection as the pinned uploader.
            s = p.lstat()
            name = '/'.join(x for x in (relative, p.name) if x)
            name_ok(name)
            require(not stat.S_ISLNK(s.st_mode), 'linked entry')
            if stat.S_ISDIR(s.st_mode):
                require(s.st_uid == os.getuid(), 'foreign directory owner')
                if not direct:
                    walk(p, name)
            else:
                regular(p)
                if suffixes is None or p.suffix in suffixes:
                    found.append((p, name, signature(s)))
                    require(len(found) <= MAX_FILES, 'file count')
    walk(root, prefix)
    return found


def selection(context, deadline=None):
    channel = context['channel']
    workspace = canonical_dir(context['workspace'])
    temporary = canonical_dir(context['temporary'])
    roots = context['roots']
    budget = {'scanned': 0, 'deadline': deadline if deadline is not None else time.monotonic() + MAX_SECONDS}
    require(type(roots) is dict, 'roots schema')
    if channel.startswith('native-'):
        require(set(roots) == {'results', 'logs', 'screenshots'}, 'native roots')
        results, logs, screenshots = [canonical_dir(roots[k]) for k in ('results', 'logs', 'screenshots')]
        parent = results.parent
        require(logs.parent == screenshots.parent == parent and
                [results.name, logs.name, screenshots.name] == ['Results', 'Logs', 'Screenshots'], 'native sibling layout')
        require(inside(parent, temporary) and parent.parent == temporary / 'ios-ci' and
                parent.name.startswith('run-' + context['runId'] + '-' + context['runAttempt'] + '.'), 'native run root')
        if channel == 'native-screenshots':
            return tree(screenshots, budget=budget)
        if channel == 'native-complete-evidence':
            return tree(results, 'Results', direct=True, suffixes={'.json', '.txt'}, budget=budget) + tree(logs, 'Logs', budget=budget)
        return tree(results, 'Results', budget=budget) + tree(logs, 'Logs', budget=budget)
    if channel == 'qualified-tests':
        require(set(roots) == {'evidence'}, 'qualified roots')
        root = canonical_dir(roots['evidence'])
        require(root == workspace / 'cd-v2-evidence', 'qualified root')
        selected = tree(root, budget=budget)
        require(QUALIFIED.issubset({name for _, name, _ in selected}), 'incomplete qualified payload')
        return selected
    if channel == 'upload-acceptance-resource':
        require(set(roots) == {'receiptDirectory', 'receiptPath', 'resourcePath'}, 'receipt roots')
        root = canonical_dir(roots['receiptDirectory'])
        require(root.parent == temporary and root.name.startswith('ios-upload-acceptance-'), 'receipt context root')
        result = []
        for key, name in [('receiptPath', 'accepted.json'), ('resourcePath', 'resource.json')]:
            value = roots[key]
            if value:
                p = Path(value)
                require(p == root / name, 'receipt output path')
                result.append((p, name, signature(regular(p))))
        return result
    require(channel == 'fault-audit' and set(roots) == {'audit'}, 'audit roots')
    root = Path(roots['audit'])
    require(root == workspace / 'evo-fault-audits', 'audit root')
    if not root.exists():
        return []
    return [row for row in tree(root, direct=True, budget=budget) if
            re.fullmatch(r'(child-result-|provider-audit-)[A-Za-z0-9._-]+\.json', row[1])]


def inventory(rows):
    require(len(rows) <= MAX_FILES, 'file count')
    seen = set()
    raw = names = 0
    for _, name, sig in rows:
        names += name_ok(name)
        alias = unicodedata.normalize('NFC', name).casefold()
        require(alias not in seen, 'ambiguous name')
        seen.add(alias)
        raw += sig[6]
        bound(raw, len(seen), names)
    return {'rawBytes': raw, 'files': len(rows), 'nameBytes': names,
            'storedUpperBytes': bound(raw, len(rows), names)}


def write_once(path, value):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(value, f, sort_keys=True, indent=2)
        f.write('\n')


def copy_regular(source, destination, expected, expired):
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
    fd = os.open(str(source), flags)
    try:
        require(signature(os.fstat(fd)) == expected, 'input replaced before open')
        target = os.open(str(destination), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        digest = hashlib.sha256()
        copied = 0
        with os.fdopen(target, 'wb') as out:
            while True:
                expired()
                block = os.read(fd, min(65536, expected[6] - copied + 1))
                if not block:
                    break
                copied += len(block)
                require(copied <= expected[6], 'input grew during copy')
                digest.update(block)
                out.write(block)
        require(copied == expected[6], 'input shortened during copy')
        require(signature(os.fstat(fd)) == expected and signature(source.lstat()) == expected, 'input changed during copy')
        destination.chmod(0o400)
        return digest.hexdigest()
    finally:
        os.close(fd)


def verify_snapshot(manifest, deadline=None):
    if deadline is None:
        deadline = time.monotonic() + MAX_SECONDS
    root = Path(manifest['payloadRoot'])
    canonical_dir(root)
    for directory in [root] + [p for p in root.rglob('*') if p.is_dir()]:
        require(directory.lstat().st_uid == os.getuid() and
                stat.S_IMODE(directory.lstat().st_mode) == 0o500, 'snapshot directory mode')
    rows = tree(root, budget={'scanned': 0, 'deadline': deadline})
    require({name for _, name, _ in rows} == {r['name'] for r in manifest['entries']}, 'snapshot selection changed')
    actual = inventory(rows)
    require(actual == manifest['accounting'], 'snapshot accounting changed')
    for row in manifest['entries']:
        p = root / row['name']
        before = regular(p)
        require(signature(before) == tuple(row['signature']), 'snapshot identity changed')
        require(stat.S_IMODE(before.st_mode) == 0o400, 'snapshot write mode')
        h = hashlib.sha256()
        fd = os.open(str(p), os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
        try:
            require(signature(os.fstat(fd)) == tuple(row['signature']), 'snapshot changed before open')
            read = 0
            while True:
                require(time.monotonic() <= deadline, 'verification deadline')
                block = os.read(fd, min(65536, row['bytes'] - read + 1))
                if not block:
                    break
                read += len(block)
                require(read <= row['bytes'], 'snapshot grew')
                h.update(block)
            require(read == row['bytes'] and signature(os.fstat(fd)) == tuple(row['signature']), 'snapshot changed during read')
        finally:
            os.close(fd)
        require(h.hexdigest() == row['sha256'] and signature(p.lstat()) == tuple(row['signature']), 'snapshot bytes changed')
    return True


def stage(context):
    require(set(context) == {'schema', 'channel', 'runId', 'runAttempt', 'effectId', 'workspace', 'temporary', 'roots'}, 'context schema')
    require(context['schema'] == 'artifact-stage-context/1' and context['channel'] in CHANNELS, 'channel')
    require(all(isinstance(context[k], str) and re.fullmatch(r'[1-9][0-9]{0,19}', context[k]) for k in ('runId', 'runAttempt')), 'run identity')
    require(isinstance(context['effectId'], str) and re.fullmatch(r'[A-Za-z0-9_.:-]{0,200}', context['effectId']), 'effect identity')
    temporary = canonical_dir(context['temporary'])
    workspace = canonical_dir(context['workspace'])
    require(workspace != temporary and not inside(workspace, temporary) and
            not inside(temporary, workspace), 'workspace and temp overlap')
    owner = temporary / 'artifact-byte-stage'
    try:
        owner.mkdir(mode=0o700)
    except FileExistsError:
        pass
    canonical_dir(owner)
    s = owner.lstat()
    require(s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700, 'stage parent ownership')
    leaf = owner / (context['runId'] + '-' + context['runAttempt'] + '-' + context['channel'])
    leaf.mkdir(mode=0o700)  # A duplicate attempt refuses, including after any failure.
    started = time.monotonic()
    def expired():
        require(0 <= time.monotonic() - started <= MAX_SECONDS, 'staging deadline')
    write_once(leaf / 'claim.json', {'schema': 'artifact-stage-claim/1', 'context': context,
               'at': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    try:
        deadline = started + MAX_SECONDS
        rows = selection(context, deadline)
        accounting = inventory(rows)
        retention, required = CHANNELS[context['channel']]
        require(rows or not required, 'mandatory artifact empty')
        payload = leaf / 'payload'
        payload.mkdir(mode=0o700)
        entries = []
        for source, name, sig in rows:
            expired()
            dest = payload / name
            dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            sha = copy_regular(source, dest, sig, expired)
            entries.append({'name': name, 'bytes': sig[6], 'sha256': sha,
                            'signature': list(signature(dest.lstat()))})
        require(selection(context, deadline) == rows, 'source selection changed')
        for p in sorted([p for p in payload.rglob('*') if p.is_dir()], key=lambda p: len(p.parts), reverse=True):
            p.chmod(0o500)
        payload.chmod(0o500)
        manifest = {'schema': 'artifact-stage-admission/1', 'status': 'ADMITTED' if rows else 'EMPTY',
                    'channel': context['channel'], 'context': context, 'payloadRoot': str(payload),
                    'accounting': accounting, 'retentionDays': retention, 'entries': entries,
                    'capBytes': CAP, 'archive': True, 'compressionLevel': 0,
                    'writerBoundary': 'source-owned private copied snapshot, not hostile same-UID isolation'}
        verify_snapshot(manifest, deadline)
        expired()
        write_once(leaf / 'admission.json', manifest)
        return manifest
    except Exception as e:
        write_once(leaf / 'refusal.json', {'status': 'REFUSED', 'reason': str(e), 'uploadAttempted': False})
        raise


def context_from_environment(channel, env):
    require(channel in CHANNELS, 'channel')
    if channel.startswith('native-'):
        roots = {k: env.get(k.upper(), '') for k in ('results', 'logs', 'screenshots')}
    elif channel == 'qualified-tests':
        roots = {'evidence': str(Path(env.get('GITHUB_WORKSPACE', '')) / 'cd-v2-evidence')}
    elif channel == 'upload-acceptance-resource':
        roots = {'receiptDirectory': env.get('ARTIFACT_RECEIPT_DIRECTORY', ''),
                 'receiptPath': env.get('ARTIFACT_RECEIPT_PATH', ''),
                 'resourcePath': env.get('ARTIFACT_RESOURCE_PATH', '')}
    else:
        roots = {'audit': str(Path(env.get('GITHUB_WORKSPACE', '')) / 'evo-fault-audits')}
    return {'schema': 'artifact-stage-context/1', 'channel': channel,
            'runId': env.get('GITHUB_RUN_ID', ''), 'runAttempt': env.get('GITHUB_RUN_ATTEMPT', ''),
            'effectId': env.get('MORPHEUS_CD_DISPATCH_EFFECT_ID', env.get('EXECUTION_ID', '')),
            'workspace': env.get('GITHUB_WORKSPACE', ''), 'temporary': env.get('RUNNER_TEMP', ''), 'roots': roots}


def github_outputs(value, env):
    p = Path(env.get('GITHUB_OUTPUT', ''))
    require(p.is_absolute() and str(p) == str(p.resolve(strict=True)) and
            inside(p, canonical_dir(env['RUNNER_TEMP'])), 'output command path')
    before = regular(p)
    require((before.st_mode & 0o022) == 0, 'writable output command file')
    manifest = Path(value['payloadRoot']).parent / 'admission.json'
    outputs = {'payload-root': value['payloadRoot'], 'manifest': str(manifest),
               'manifest-sha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
               'admitted': 'true', 'has-files': 'true' if value['status'] == 'ADMITTED' else 'false',
               'retention-days': str(value['retentionDays'])}
    require(all('\n' not in v and '\r' not in v for v in outputs.values()), 'multiline output')
    fd = os.open(str(p), os.O_WRONLY | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'w') as f:
        require(signature(os.fstat(f.fileno())) == signature(before), 'output command file changed')
        f.write(''.join(k + '=' + v + '\n' for k, v in outputs.items()))
    return outputs


def main():
    # This prototype has no auth/provider factory or upload implementation.
    github = len(sys.argv) == 3 and sys.argv[1] == '--github'
    if github:
        context = context_from_environment(sys.argv[2], os.environ)
    else:
        require(len(sys.argv) == 2, 'one fixture context file or --github CHANNEL required')
        p = Path(sys.argv[1]); regular(p)
        require(p.stat().st_size <= 65536, 'context byte bound')
        context = json.loads(p.read_text())
    value = stage(context)
    if github:
        github_outputs(value, os.environ)
    admission = Path(value['payloadRoot']).parent / 'admission.json'
    print(json.dumps({'status': value['status'], 'payloadRoot': value['payloadRoot'],
          'manifest': str(admission), 'sha256': hashlib.sha256(admission.read_bytes()).hexdigest(),
          'accounting': value['accounting'], 'retentionDays': value['retentionDays']}, sort_keys=True))


if __name__ == '__main__':
    main()
