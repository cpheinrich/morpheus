import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
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
spec = importlib.util.spec_from_file_location('private_artifact_stage', SOURCE / 'stage.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
CASES = []


def fixture(base):
    workspace = base / 'workspace'
    temporary = base / 'temporary'
    workspace.mkdir(); temporary.mkdir()
    run = temporary / 'ios-ci/run-123-1.fixture'
    for name in ['Results', 'Logs', 'Screenshots']:
        (run / name).mkdir(parents=True)
    for name in ['tests.json', 'summary.json', 'tested-sha.txt', 'only-testing.txt']:
        (run / 'Results' / name).write_text('original-' + name)
    (run / 'Results/Tests.xcresult').mkdir()
    (run / 'Results/Tests.xcresult/data').write_bytes(b'XCRESULT')
    (run / 'Logs/tests.log').write_text('complete log\n')
    (run / 'Screenshots/screenshot.png').write_bytes(b'PNG')
    evidence = workspace / 'cd-v2-evidence'; evidence.mkdir()
    for name in s.QUALIFIED:
        (evidence / name).write_text('qualified-' + name)
    receipt = temporary / 'ios-upload-acceptance-fixture'; receipt.mkdir()
    for name in ['accepted.json', 'resource.json']:
        (receipt / name).write_text('receipt-' + name)
    audit = workspace / 'evo-fault-audits'; audit.mkdir()
    for name in ['child-result-fixture.json', 'provider-audit-fixture.json']:
        (audit / name).write_text('audit-' + name)
    native = dict(results=str(run / 'Results'), logs=str(run / 'Logs'), screenshots=str(run / 'Screenshots'))
    roots = {
        'native-screenshots': native, 'native-complete-evidence': native,
        'native-failure-evidence': native,
        'qualified-tests': {'evidence': str(evidence)},
        'upload-acceptance-resource': {'receiptDirectory': str(receipt),
            'receiptPath': str(receipt / 'accepted.json'), 'resourcePath': str(receipt / 'resource.json')},
        'fault-audit': {'audit': str(audit)},
    }
    return {channel: dict(schema='artifact-stage-context/1', channel=channel,
            runId='123', runAttempt='1', effectId='FIXTURE_ONLY',
            workspace=str(workspace), temporary=str(temporary), roots=copy.deepcopy(roots[channel]))
            for channel in s.CHANNELS}


class Tests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='case-', dir=str(FIXTURES)))
        self.contexts = fixture(self.root)
        self.c = self.contexts['native-screenshots']
    def record(self, label):
        CASES.append(label)
    def refuse(self, context, label):
        with self.assertRaises((s.Refused, OSError, ValueError)):
            s.stage(context)
        self.record(label)
        leaf = Path(context['temporary']) / 'artifact-byte-stage' / ('123-1-' + context['channel'])
        self.assertFalse((leaf / 'admission.json').exists())
        if leaf.exists():
            value = json.loads((leaf / 'refusal.json').read_text())
            self.assertEqual(value['status'], 'REFUSED')
            self.assertEqual(value['uploadAttempted'], False)
    def test_all_six_exact_layout_contents_retention_and_roundtrip_inputs(self):
        manifests = []
        expected = {
            'native-screenshots': {'screenshot.png'},
            'native-complete-evidence': {'Results/tests.json', 'Results/summary.json', 'Results/tested-sha.txt', 'Results/only-testing.txt', 'Logs/tests.log'},
            'native-failure-evidence': {'Results/tests.json', 'Results/summary.json', 'Results/tested-sha.txt', 'Results/only-testing.txt', 'Results/Tests.xcresult/data', 'Logs/tests.log'},
            'qualified-tests': s.QUALIFIED,
            'upload-acceptance-resource': {'accepted.json', 'resource.json'},
            'fault-audit': {'child-result-fixture.json', 'provider-audit-fixture.json'},
        }
        for channel, context in self.contexts.items():
            m = s.stage(context)
            self.assertEqual(m['status'], 'ADMITTED')
            self.assertEqual(m['retentionDays'], s.CHANNELS[channel][0])
            self.assertEqual({r['name'] for r in m['entries']}, expected[channel])
            self.assertEqual(s.verify_snapshot(m), True)
            self.assertEqual(m['archive'], True); self.assertEqual(m['compressionLevel'], 0)
            self.assertLessEqual(m['accounting']['storedUpperBytes'], s.CAP)
            manifests.append(m); self.record('six/' + channel)
        path = FIXTURES / ('six-manifests-' + str(os.getpid()) + '.json')
        path.write_text(json.dumps(manifests))
    def test_exact_cap_and_one_byte_accounting_boundaries(self):
        p = len('big.bin'.encode())
        raw = (s.CAP - 4*p - 4096 - 1048576)//2
        self.assertEqual(s.bound(raw, 1, p), 1073741824)
        with self.assertRaises(s.Refused): s.bound(raw+1, 1, p)
        value = s.bound(5, 1, 3)
        with patch.object(s, 'CAP', value): self.assertEqual(s.bound(5, 1, 3), value)
        with patch.object(s, 'CAP', value-1):
            with self.assertRaises(s.Refused): s.bound(5, 1, 3)
        for x in [True, -1, 0.5, '1']:
            with self.assertRaises(s.Refused): s.bound(x, 1, 1)
        self.record('exact1073741824/next-rawbyte/one-stored-boundbyte/typed-accounting')
    def test_count_name_depth_and_scan_boundaries(self):
        self.assertEqual(s.name_ok('a'*4096),4096)
        for name in ['a'*4097, '/x', 'x/../a', 'x\\a', 'a\nb', 'bad:zip', '/'.join(['d']*65)]:
            with self.assertRaises(s.Refused): s.name_ok(name)
            self.record('name-refuse/' + str(len(name)))
        with self.assertRaises(s.Refused): s.bound(0,32769,0)
        with self.assertRaises(s.Refused): s.bound(0,1,(32<<20)+1)
        with patch.object(s,'MAX_SCANNED',0): self.refuse(self.c,'scan0/refuse-before-copy')
    def test_optional_empty_and_mandatory_missing_not_success(self):
        source = Path(self.c['roots']['screenshots'])/'screenshot.png'; source.unlink()
        m=s.stage(self.c); self.assertEqual(m['status'],'EMPTY');self.assertEqual(m['entries'],[])
        self.assertEqual(list(Path(m['payloadRoot']).iterdir()),[])
        self.record('empty-optional-no-upload-payload')
        q=self.contexts['qualified-tests'];(Path(q['roots']['evidence'])/'summary.json').unlink()
        self.refuse(q,'missing-qualified-payload')
    def test_sparse_over_cap_refuses_before_copy(self):
        p=Path(self.c['roots']['screenshots'])/'oversized.bin'
        with p.open('wb') as f: f.truncate(s.CAP)
        with patch.object(s,'copy_regular',side_effect=AssertionError('must not copy over cap')):
            self.refuse(self.c,'sparse-cap-refuse-before-copy')
    def test_symlink_hardlink_fifo_and_linked_parent(self):
        root=Path(self.c['roots']['screenshots']);source=root/'screenshot.png'
        source.unlink();source.symlink_to(Path(self.c['roots']['results'])/'tests.json')
        self.refuse(self.c,'symlink-file')
        for kind in ['hardlink','fifo','directory-link']:
            base=Path(tempfile.mkdtemp(prefix='object-',dir=str(FIXTURES)));c=fixture(base)['native-screenshots'];r=Path(c['roots']['screenshots']);p=r/'bad'
            if kind=='hardlink':os.link(r/'screenshot.png',p)
            elif kind=='fifo':os.mkfifo(p)
            else:p.symlink_to(Path(c['roots']['results']),target_is_directory=True)
            self.refuse(c,kind)
        base=Path(tempfile.mkdtemp(prefix='parent-',dir=str(FIXTURES)));c=fixture(base)['native-screenshots'];old=Path(c['roots']['screenshots']);moved=old.with_name('actual');old.rename(moved);old.symlink_to(moved,target_is_directory=True)
        self.refuse(c,'linked-selected-root')
    def test_same_size_mutation_and_growth_during_opened_copy(self):
        for mode in ['same-size','grow','shorten','replace']:
            base=Path(tempfile.mkdtemp(prefix='race-',dir=str(FIXTURES)));c=fixture(base)['native-screenshots'];p=Path(c['roots']['screenshots'])/'screenshot.png'
            native=s.os.read;changed=[]
            def read(fd,n):
                block=native(fd,n)
                if not changed:
                    changed.append(True)
                    if mode=='same-size':p.write_bytes(b'BAD')
                    elif mode=='grow':p.write_bytes(b'GROWTH')
                    elif mode=='shorten':p.write_bytes(b'')
                    else:p.unlink();p.write_bytes(b'NEW')
                return block
            with patch.object(s.os,'read',side_effect=read):self.refuse(c,'opened-copy/'+mode)
    def test_new_late_source_file_and_bad_alias(self):
        native=s.copy_regular;done=[]
        def cp(*args):
            value=native(*args)
            if not done:done.append(True);(Path(self.c['roots']['screenshots'])/'late.png').write_bytes(b'LATE')
            return value
        with patch.object(s,'copy_regular',side_effect=cp):self.refuse(self.c,'new-source-file-after-first-copy')
        base=Path(tempfile.mkdtemp(prefix='alias-',dir=str(FIXTURES)));c=fixture(base)['native-screenshots'];r=Path(c['roots']['screenshots']);(r/'A').write_bytes(b'a');(r/'a').write_bytes(b'b')
        # The actual macOS default volume is case insensitive: use independent census rows.
        sig=list(s.signature((r/'A').stat()));sig[6]=1
        with self.assertRaises(s.Refused):s.inventory([(r/'A','A',tuple(sig)),(r/'a','a',tuple(sig))])
        self.record('case-fold-alias-pure-census')
    def test_snapshot_detached_from_later_original_writer_and_tamper_refused(self):
        p=Path(self.c['roots']['screenshots'])/'screenshot.png';m=s.stage(self.c)
        before=Path(m['payloadRoot'])/'screenshot.png';sha=hashlib.sha256(before.read_bytes()).hexdigest()
        p.write_bytes(b'original kept growing'*1000)
        self.assertEqual(s.verify_snapshot(m),True);self.assertEqual(before.read_bytes(),b'PNG');self.assertEqual(m['entries'][0]['sha256'],sha)
        before.chmod(0o600);before.write_bytes(b'BAD')
        with self.assertRaises(s.Refused):s.verify_snapshot(m)
        self.record('source-writer-cannot-grow-private-snapshot/stage-tamper-refuses')
    def test_duplicate_and_failed_attempt_are_never_restarted(self):
        m=s.stage(self.c);p=Path(m['payloadRoot']).parent/'admission.json';raw=p.read_bytes()
        with self.assertRaises(FileExistsError):s.stage(self.c)
        self.assertEqual(p.read_bytes(),raw);self.record('duplicate-admitted-unchanged')
        q=self.contexts['qualified-tests'];(Path(q['roots']['evidence'])/'summary.json').unlink();self.refuse(q,'first-refusal-spent')
        with self.assertRaises(FileExistsError):s.stage(q)
        self.record('refused-never-retried')
    def test_context_root_metadata_and_deadline_mutants(self):
        for key,value in [('runId',True),('runAttempt','0'),('effectId','bad\n'),('schema','other'),('channel','arbitrary')]:
            c=copy.deepcopy(self.c);c[key]=value
            with self.assertRaises((s.Refused,TypeError)):s.stage(c)
            self.record('context/'+key)
        c=copy.deepcopy(self.c);c['roots']['screenshots']=str(Path(c['workspace'])/'cd-v2-evidence');self.refuse(c,'wrong-closed-root')
        base=Path(tempfile.mkdtemp(prefix='time-',dir=str(FIXTURES)));c=fixture(base)['native-screenshots']
        with patch.object(s,'MAX_SECONDS',-1):self.refuse(c,'expired-before-selection')
    def test_hidden_files_excluded_and_atomic_refusal_result(self):
        r=Path(self.c['roots']['screenshots']);(r/'.hidden').write_bytes(b'HIDDEN')
        m=s.stage(self.c);self.assertEqual([x['name'] for x in m['entries']],['screenshot.png'])
        self.assertEqual(stat.S_IMODE(Path(m['payloadRoot']).stat().st_mode),0o500)
        self.assertEqual(stat.S_IMODE((Path(m['payloadRoot'])/'screenshot.png').stat().st_mode),0o400)
        self.record('hidden-unchanged-selection/frozen-modes')
    def test_github_public_context_and_small_command_outputs(self):
        env={'GITHUB_WORKSPACE':self.c['workspace'],'RUNNER_TEMP':self.c['temporary'],
             'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1','MORPHEUS_CD_DISPATCH_EFFECT_ID':'FIXTURE_ONLY',
             'RESULTS':self.c['roots']['results'],'LOGS':self.c['roots']['logs'],
             'SCREENSHOTS':self.c['roots']['screenshots']}
        self.assertEqual(s.context_from_environment('native-screenshots',env),self.c)
        output=Path(self.c['temporary'])/'set-output';output.write_text('');output.chmod(0o600);env['GITHUB_OUTPUT']=str(output)
        m=s.stage(self.c);values=s.github_outputs(m,env)
        self.assertEqual(values['has-files'],'true');self.assertEqual(values['admitted'],'true')
        self.assertEqual(output.read_text(),''.join(k+'='+v+'\n' for k,v in values.items()))
        self.assertLess(len(output.read_bytes()),8192)
        output.chmod(0o666)
        with self.assertRaises(s.Refused):s.github_outputs(m,env)
        self.record('GHA-public-context/closed-owned-small-output/no-env-dump')
    def test_no_temp_workspace_overlap_and_snapshot_directory_change(self):
        c=copy.deepcopy(self.c);c['workspace']=c['temporary']
        with self.assertRaises(s.Refused):s.stage(c)
        m=s.stage(self.c);Path(m['payloadRoot']).chmod(0o700)
        with self.assertRaises(s.Refused):s.verify_snapshot(m)
        self.record('temp-workspace-overlap/directory-write-bit-refused')
    def test_foreign_owner_and_independent_snapshot_hash(self):
        p=Path(self.c['roots']['screenshots'])/'screenshot.png'
        uid=os.getuid()
        with patch.object(s.os,'getuid',return_value=uid+1):
            with self.assertRaises(s.Refused):s.regular(p)
        m=s.stage(self.c);bad=copy.deepcopy(m);bad['entries'][0]['sha256']='0'*64
        with self.assertRaises(s.Refused):s.verify_snapshot(bad)
        self.record('foreign-file-owner/independent-declared-hash')
    def test_final_staged_hash_catches_corrupt_copy_before_admission(self):
        native=s.copy_regular
        def corrupt(source,destination,*args):
            digest=native(source,destination,*args)
            destination.chmod(0o600);destination.write_bytes(b'BAD');destination.chmod(0o400)
            return digest
        with patch.object(s,'copy_regular',side_effect=corrupt):self.refuse(self.c,'corrupt-copy-before-admission/no-uploader')
    def test_copy_fd_post_identity_independent_of_final_rescan(self):
        source=Path(self.c['roots']['screenshots'])/'screenshot.png';destination=self.root/'copied'
        before=s.signature(source.lstat());native=s.os.read;changed=[]
        def read(fd,n):
            block=native(fd,n)
            if not changed:changed.append(True);source.write_bytes(b'BAD')
            return block
        with patch.object(s.os,'read',side_effect=read):
            with self.assertRaises(s.Refused):s.copy_regular(source,destination,before,lambda:None)
        self.record('fd-post-identity-direct/independent-of-rescan-defense')


if __name__=='__main__':
    (FIXTURES).mkdir(mode=0o700,exist_ok=True)
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests))
    print(json.dumps({'schema':'private-artifact-stage-focused-tests/1','python':sys.version,
          'tests':result.testsRun,'cases':len(CASES),'caseMap':CASES,'failures':len(result.failures),
          'errors':len(result.errors),'sourceSHA256':hashlib.sha256((SOURCE/'stage.py').read_bytes()).hexdigest(),
          'providerCalls':0,'networkCalls':0,'operationalCredit':False},sort_keys=True))
    raise SystemExit(0 if result.wasSuccessful() else 1)
