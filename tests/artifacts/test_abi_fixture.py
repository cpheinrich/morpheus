"""Exercise fixed ABI preparation/readback and refusal without an artifact service."""
import importlib.util
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('fixture_source', HERE / 'abi_fixture.py')
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)


class Tests(unittest.TestCase):
    def setUp(self):
        self.base = Path(tempfile.mkdtemp()).resolve()
        self.out = self.base / 'output'; self.out.touch(mode=0o600)
        self.env = {'RUNNER_TEMP': str(self.base), 'GITHUB_OUTPUT': str(self.out),
                    'GITHUB_REPOSITORY': 'cpheinrich/morpheus', 'GITHUB_JOB': 'artifact-abi',
                    'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '1'}
        self.addCleanup(self.cleanup)
    def cleanup(self):
        for directory, _, _ in os.walk(str(self.base)): os.chmod(directory, 0o700)
        shutil.rmtree(str(self.base))
    def test_full_independent_readback_and_once_only(self):
        self.assertEqual(f.CAP, 2097152)
        f.prepare(self.env)
        import json
        manifest = json.loads((self.base / 'artifact-abi-fixture/admission.json').read_text())
        self.assertEqual(manifest['accounting'], {'rawBytes':63,'files':2,'nameBytes':30,'storedUpperBytes':1057014})
        self.assertEqual(manifest['retentionDays'], 1)
        self.assertIn('admitted=true\n', self.out.read_text())
        payload = self.base / 'artifact-abi-fixture/payload'
        self.assertEqual({p.relative_to(payload).as_posix() for p in payload.rglob('*') if p.is_file()}, set(f.EXPECTED))
        shutil.copytree(payload, self.base / 'artifact-abi-readback')
        f.verify(self.env)
        with self.assertRaises(FileExistsError): f.prepare(self.env)
        extra = self.base / 'artifact-abi-readback/extra'; extra.chmod(0o600) if extra.exists() else None
        (self.base / 'artifact-abi-readback').chmod(0o700); extra.write_bytes(b'extra')
        with self.assertRaises(f.core.Refused): f.verify(self.env)
    def test_over_cap_before_copy_and_no_outputs(self):
        with patch.object(f, 'CAP', 1), patch.object(f.core, 'copy_regular', side_effect=AssertionError('must not copy')):
            with self.assertRaisesRegex(f.core.Refused, '2 MiB'): f.prepare(self.env)
        self.assertEqual(self.out.read_bytes(), b'')
        self.assertFalse((self.base / 'artifact-abi-fixture/admission.json').exists())
    def test_wrong_owner_and_identity_no_leaf(self):
        for key, value in [('GITHUB_JOB','qa-browser'),('GITHUB_REPOSITORY','foreign/repo'),('GITHUB_RUN_ID','0'),('GITHUB_RUN_ATTEMPT','')]:
            with self.assertRaises(f.core.Refused): f.prepare(dict(self.env, **{key:value}))
        self.assertFalse((self.base / 'artifact-abi-fixture').exists())
    def test_whole_byte_and_link_tamper(self):
        root = self.base / 'artifact-abi-readback'; root.mkdir()
        for name, body in f.EXPECTED.items():
            p = root/name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(body)
        changed = root/'plain.txt'; changed.write_bytes(b'wrong')
        with self.assertRaises(f.core.Refused): f.verify(self.env)
        changed.unlink(); changed.symlink_to(root/'nested/unicode-\u00e9.txt')
        with self.assertRaises(f.core.Refused): f.verify(self.env)


if __name__ == '__main__': unittest.main(verbosity=2)
