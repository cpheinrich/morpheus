"""Focused mutants, private in-memory modules only, never edit canonical source."""
from pathlib import Path
import hashlib
import importlib.util
import io
import json
import sys
import types
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('private_stage_tests',HERE/'test_stage.py')
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)

raw=(t.SOURCE/'stage.py').read_text()
mutants=[
 ('cap-boundary-inclusive',"value <= CAP, 'stored-byte bound'","value < CAP, 'stored-byte bound'",'test_exact_cap_and_one_byte_accounting_boundaries'),
 ('no-raw-factor2','value = 2 * raw + 4 * names','value = raw + 4 * names','test_exact_cap_and_one_byte_accounting_boundaries'),
 ('allow-hardlinks','stat.S_ISREG(s.st_mode) and s.st_nlink == 1','stat.S_ISREG(s.st_mode)','test_symlink_hardlink_fifo_and_linked_parent'),
 ('drop-source-rescan',"require(selection(context, deadline) == rows, 'source selection changed')","require(True, 'source selection changed')",'test_new_late_source_file_and_bad_alias'),
 ('drop-copy-post-identity',"require(signature(os.fstat(fd)) == expected and signature(source.lstat()) == expected, 'input changed during copy')","require(True, 'input changed during copy')",'test_copy_fd_post_identity_independent_of_final_rescan'),
 ('drop-name-byte-limit',"require(length <= MAX_PATH, 'path byte bound')","require(True, 'path byte bound')",'test_count_name_depth_and_scan_boundaries'),
 ('drop-owner',"require(s.st_uid == os.getuid(), 'foreign file owner')","require(True, 'foreign file owner')",'test_foreign_owner_and_independent_snapshot_hash'),
 ('drop-hash',"h.hexdigest() == row['sha256'] and signature(p.lstat())","True and signature(p.lstat())",'test_foreign_owner_and_independent_snapshot_hash'),
 ('drop-final-snapshot-verify','        verify_snapshot(manifest, deadline)','        pass  # mutant removes final proof','test_final_staged_hash_catches_corrupt_copy_before_admission'),
 ('legacy-receipt-leaf', "context['channel'] + invocation)", "context['channel'])", 'test_two_receipt_invocations_same_run_admit_exact_bytes_and_stay_spent'),
 ('dangling-audit-as-empty', 'if not root.exists() and not root.is_symlink():', 'if not root.exists():', 'test_dangling_audit_root_refuses_without_outputs_and_genuine_absence_is_empty'),
]
records=[]
for label,before,after,method in mutants:
 assert raw.count(before)==1,label
 changed=raw.replace(before,after,1);m=types.ModuleType('private_mutant_'+label);m.__file__=str(t.SOURCE/'stage.py')
 exec(compile(changed,m.__file__,'exec'),m.__dict__);t.s=m
 output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=2).run(t.Tests(method))
 killed=not result.wasSuccessful();assert killed,'surviving substantive mutant: '+label
 records.append({'name':label,'target':method,'mutantSHA256':hashlib.sha256(changed.encode()).hexdigest(),
                 'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'killed':killed,'actualOutput':output.getvalue()})
print(json.dumps({'schema':'private-artifact-stager-focused-mutants/1','python':sys.version,'sourceSHA256':hashlib.sha256(raw.encode()).hexdigest(),'mutants':records,'killed':len(records),'survivors':0,'network':0,'operationalCredit':False},sort_keys=True))
