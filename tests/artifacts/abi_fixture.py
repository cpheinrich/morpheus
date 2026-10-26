"""Fixed CI transport fixture. No delivery evidence or arbitrary input roots."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

SOURCE = Path(__file__).resolve().parents[2] / '.github/actions/ios-testflight-upload/artifact-stage/stage.py'
spec = importlib.util.spec_from_file_location('abi_fixture_core', SOURCE)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
CAP = 2 << 20
EXPECTED = {'plain.txt': b'Morpheus artifact ABI fixture\n',
            'nested/unicode-\u00e9.txt': b'Independent BEFORE-known bytes\x00\xff\n'}


def prepare(env):
    core.require(env.get('GITHUB_REPOSITORY') == 'cpheinrich/morpheus' and
                 env.get('GITHUB_JOB') == 'artifact-abi', 'CI ABI owner')
    core.require(all(re.fullmatch(r'[1-9][0-9]{0,19}', env.get(k, ''))
                     for k in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT')), 'CI ABI identity')
    root = core.canonical_dir(env['RUNNER_TEMP']) / 'artifact-abi-fixture'
    root.mkdir(mode=0o700)  # One attempt; a duplicate, partial or failed attempt stays spent.
    original = root / 'input'; original.mkdir(mode=0o700)
    payload = root / 'payload'; payload.mkdir(mode=0o700)
    for name, body in EXPECTED.items():
        source = original / name; source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(body)
    rows = core.tree(original)
    accounting = core.inventory(rows)
    core.require(accounting['storedUpperBytes'] <= CAP, '2 MiB ABI stored-byte cap')
    entries = []
    for source, name, signature in rows:
        dest = payload / name; dest.parent.mkdir(parents=True, exist_ok=True)
        digest = core.copy_regular(source, dest, signature, lambda: None)
        core.require(digest == hashlib.sha256(EXPECTED[name]).hexdigest(), 'ABI copied bytes')
        entries.append({'name': name, 'bytes': len(EXPECTED[name]), 'sha256': digest,
                        'signature': list(core.signature(dest.lstat()))})
    for directory in sorted([p for p in payload.rglob('*') if p.is_dir()], key=lambda p: len(p.parts), reverse=True):
        directory.chmod(0o500)
    payload.chmod(0o500)
    manifest = {'schema': 'artifact-abi-fixture/1', 'status': 'ADMITTED', 'payloadRoot': str(payload),
                'entries': entries, 'accounting': accounting, 'retentionDays': 1, 'capBytes': CAP}
    core.verify_snapshot(manifest)
    core.write_once(root / 'admission.json', manifest)
    core.github_outputs(manifest, env)
    print(json.dumps({'purpose': 'SYNTHETIC_CI_TRANSPORT_FIXTURE_ONLY', 'accounting': accounting}))


def verify(env):
    root = core.canonical_dir(env['RUNNER_TEMP']) / 'artifact-abi-readback'
    core.require({p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()} == set(EXPECTED), 'ABI whole file set')
    for name, body in EXPECTED.items():
        path = root / name
        core.regular(path)
        core.require(path.read_bytes() == body, 'ABI exact downloaded bytes')
    print(json.dumps({'files': len(EXPECTED), 'sha256': {name: hashlib.sha256(body).hexdigest() for name, body in EXPECTED.items()},
                      'deliveryQualification': False}, sort_keys=True))


if __name__ == '__main__':
    core.require(sys.argv[1:] in (['prepare'], ['verify']), 'fixed ABI mode')
    (prepare if sys.argv[1] == 'prepare' else verify)(os.environ)
