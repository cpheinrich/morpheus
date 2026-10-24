import copy
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / '.github/actions/ios-testflight-upload/artifact-stage'
import atexit
import shutil
FIXTURES = Path(tempfile.mkdtemp(prefix='morpheus-artifact-tests-')).resolve()
def cleanup():
    for directory, _, _ in os.walk(str(FIXTURES)):
        os.chmod(directory, 0o700)
    shutil.rmtree(str(FIXTURES))
atexit.register(cleanup)
spec = importlib.util.spec_from_file_location('private_ci_trace', SOURCE / 'ci_trace_stage.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
CASES = []
CUSTODY = []


class Tests(unittest.TestCase):
    def setUp(self):
        self.base = Path(tempfile.mkdtemp(prefix='trace-', dir=FIXTURES))
        self.w = self.base / 'workspace'; self.t = self.base / 'temporary'
        self.w.mkdir(); self.t.mkdir()
        self.r = self.w / 'test-results'; self.r.mkdir()
        (self.r / 'case').mkdir(); (self.r / 'case/trace.zip').write_bytes(b'BEFORE-INDEPENDENT-TRACE')
        (self.r / 'report.txt').write_text('complete diagnostic')
        self.ctx = {'repository': 'cpheinrich/morpheus', 'job': 'qa-browser', 'runId': '101',
                    'runAttempt': '1', 'workspace': str(self.w), 'temporary': str(self.t)}
    def record(self, name): CASES.append(name)
    def refuse(self, ctx, name):
        with self.assertRaises((c.core.Refused, OSError, ValueError)): c.stage(ctx)
        leaf = self.t / 'artifact-byte-stage/101-1-ci-browser-traces'
        self.assertFalse((leaf / 'admission.json').exists())
        if leaf.exists():
            self.assertEqual(json.loads((leaf / 'refusal.json').read_text())['uploadAttempted'], False)
        self.record(name)
    def test_exact_snapshot_layout_hash_and_detached_source(self):
        expected = {'case/trace.zip': hashlib.sha256(b'BEFORE-INDEPENDENT-TRACE').hexdigest(),
                    'report.txt': hashlib.sha256(b'complete diagnostic').hexdigest()}
        m = c.stage(self.ctx)
        self.assertEqual({r['name']: r['sha256'] for r in m['entries']}, expected)
        self.assertEqual((m['capBytes'], m['retentionDays']), (67108864, 1))
        self.assertEqual(m['status'], 'ADMITTED'); self.assertTrue(c.core.verify_snapshot(m))
        (self.r / 'case/trace.zip').write_bytes(b'LATE ORIGINAL WRITER' * 100)
        self.assertTrue(c.core.verify_snapshot(m)); self.assertEqual(Path(m['payloadRoot']).joinpath('case/trace.zip').read_bytes(), b'BEFORE-INDEPENDENT-TRACE')
        with self.assertRaises(FileExistsError): c.stage(self.ctx)
        self.record('fixed-layout-independent-hashes/original-late-write-detached/EXCL')
    def test_exact_cap_actual_copy_next_byte_no_copy(self):
        for f in self.r.rglob('*'):
            if f.is_file(): f.unlink()
        raw = (67108864 - 4 * len('big.bin') - 4096 - 1048576) // 2
        self.assertEqual(c.trace_bound(raw, 1, 7), 67108864)
        with self.assertRaises(c.core.Refused): c.trace_bound(raw + 1, 1, 7)
        with (self.r / 'big.bin').open('wb') as f: f.truncate(raw)
        m = c.stage(self.ctx); self.assertEqual(m['accounting']['storedUpperBytes'], 67108864)
        self.assertEqual(m['entries'][0]['bytes'], raw)
        self.ctx['runAttempt'] = '2'
        with (self.r / 'big.bin').open('ab') as f: f.write(b'x')
        with patch.object(c.core, 'copy_regular', side_effect=AssertionError('overcap copied')):
            with self.assertRaises(c.core.Refused): c.stage(self.ctx)
        self.assertFalse((self.t / 'artifact-byte-stage/101-2-ci-browser-traces/admission.json').exists())
        self.record('actual64MiB-envelope/next-raw-byte-before-copy')
    def test_owner_path_context_and_loader_refusals(self):
        self.assertEqual(c.CORE_SHA256, hashlib.sha256((SOURCE / 'stage.py').read_bytes()).hexdigest())
        for key, value in [('repository', 'other/repo'), ('job', 'test'), ('runId', '0'), ('runAttempt', True)]:
            v = copy.deepcopy(self.ctx); v[key] = value
            self.refuse(v, 'context/' + key)
        v = copy.deepcopy(self.ctx); v['extra'] = 'no'; self.refuse(v, 'context/extra')
        with patch.object(c, 'CORE_SHA256', '0' * 64):
            with self.assertRaisesRegex(ValueError, 'fixed core identity'): c.load_core()
        with self.assertRaises(c.core.Refused): c.context_from_environment({'MORPHEUS_CD_DISPATCH_EFFECT_ID': 'delivery'})
        self.record('fixed-core-hash/no-delivery-role')
    def test_empty_missing_root_and_links(self):
        for f in self.r.rglob('*'):
            if f.is_file(): f.unlink()
        m = c.stage(self.ctx); self.assertEqual(m['status'], 'EMPTY'); self.assertEqual(m['entries'], [])
        self.ctx['runAttempt'] = '2'; (self.r / 'case').rmdir(); self.r.rmdir()
        m = c.stage(self.ctx); self.assertEqual(m['status'], 'EMPTY')
        self.ctx['runAttempt'] = '3'; self.r.symlink_to(self.w, target_is_directory=True)
        with self.assertRaises(c.core.Refused): c.stage(self.ctx)
        self.record('optionalempty/missing-no-upload/symlink-root-refusal')
    def test_late_mutation_refuses_and_spent_never_retries(self):
        native = c.core.copy_regular; changed = []
        def late(source, dest, expected, expired):
            value = native(source, dest, expected, expired)
            if not changed:
                changed.append(True); (self.r / 'late.txt').write_text('new writer')
            return value
        with patch.object(c.core, 'copy_regular', side_effect=late): self.refuse(self.ctx, 'late-source-census')
        with self.assertRaises(FileExistsError): c.stage(self.ctx)
        self.record('refusal-leaf-spent/no-retry')
    def test_links_and_copy_integrity_and_deadline(self):
        (self.r / 'linked').symlink_to(self.r / 'report.txt')
        self.refuse(self.ctx, 'symlink-file')
        (self.r / 'linked').unlink(); self.ctx['runAttempt'] = '2'
        os.link(self.r / 'report.txt', self.r / 'hardlink')
        with self.assertRaises(c.core.Refused): c.stage(self.ctx)
        self.record('hardlink')
        (self.r / 'hardlink').unlink(); self.ctx['runAttempt'] = '3'
        native = c.core.copy_regular
        def corrupt(source, dest, expected, expired):
            value = native(source, dest, expected, expired)
            dest.chmod(0o600); dest.write_bytes(b'BAD'); dest.chmod(0o400)
            return value
        with patch.object(c.core, 'copy_regular', side_effect=corrupt):
            with self.assertRaises(c.core.Refused): c.stage(self.ctx)
        self.record('corrupted-snapshot/no-admission')
        self.ctx['runAttempt'] = '4'
        with patch.object(c.time, 'monotonic', side_effect=[0, 121]):
            with self.assertRaises(c.core.Refused): c.stage(self.ctx)
        self.record('expired-before-selection')
    def test_actual_cli_exact_argv_parent_env_and_output(self):
        out = self.t / 'github-output'; out.write_text(''); out.chmod(0o600)
        env = {'PATH': '/usr/bin:/bin', 'GITHUB_REPOSITORY': 'cpheinrich/morpheus', 'GITHUB_JOB': 'qa-browser',
               'GITHUB_RUN_ID': '101', 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_WORKSPACE': str(self.w),
               'RUNNER_TEMP': str(self.t), 'GITHUB_OUTPUT': str(out)}
        for args, expected in [(['--github'], 0), (['--github', '--extra'], 1), (['--path', str(self.r)], 1)]:
            argv = [sys.executable, '-I', '-S', '-B', str(SOURCE / 'ci_trace_stage.py')] + args
            start = datetime.datetime.now(datetime.timezone.utc).isoformat()
            p = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            stdout, stderr = p.communicate(timeout=4)
            self.assertEqual(p.returncode == 0, expected == 0)
            if expected == 0:
                value = json.loads(stdout); self.assertEqual(value['capBytes'], 67108864)
                self.assertIn('retention-days=1\n', out.read_text()); self.assertEqual(stderr, b'')
            CUSTODY.append({'argv': argv, 'pid': p.pid, 'ppid': os.getpid(), 'uid': os.getuid(),
                            'start': start, 'end': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            'status': p.returncode, 'stdinBytes': 0, 'stdout': stdout.decode(),
                            'stderr': stderr.decode(), 'stdoutEOF': True, 'stderrEOF': True,
                            'directWaitedReaped': True, 'birthSnapshot': None, 'fixtureOnly': True})
        self.record('3-real-local-fixture-CLI/closed-argv/fullEOF/reap')


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Tests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(json.dumps({'schema': 'private-CI-trace-focused-tests/1', 'python': sys.version,
                      'tests': result.testsRun, 'cases': CASES, 'custody': CUSTODY,
                      'failures': len(result.failures), 'errors': len(result.errors),
                      'sourceSHA256': hashlib.sha256((SOURCE / 'ci_trace_stage.py').read_bytes()).hexdigest(),
                      'coreSHA256': c.CORE_SHA256, 'providerOrHostCalls': 0, 'operationalCredit': False}, sort_keys=True))
    raise SystemExit(not result.wasSuccessful())
