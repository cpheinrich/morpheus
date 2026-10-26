from pathlib import Path
import importlib.util
import hashlib
import io
import json
import types
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('trace_test_fixture', HERE / 'test_ci_trace.py')
t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
raw = (t.SOURCE / 'ci_trace_stage.py').read_text()
cases = [
 ('cap-inclusive', 'value <= TRACE_CAP', 'value < TRACE_CAP', 'test_exact_cap_actual_copy_next_byte_no_copy'),
 ('cap-removed', "core.require(value <= TRACE_CAP, 'CI trace stored-byte bound')", "core.require(True, 'CI trace stored-byte bound')", 'test_exact_cap_actual_copy_next_byte_no_copy'),
 ('repository-purpose', "context['repository'] == 'cpheinrich/morpheus'", 'True', 'test_owner_path_context_and_loader_refusals'),
 ('job-purpose', "context['job'] == 'qa-browser'", 'True', 'test_owner_path_context_and_loader_refusals'),
 ('retention', 'RETENTION_DAYS = 1', 'RETENTION_DAYS = 90', 'test_exact_snapshot_layout_hash_and_detached_source'),
 ('source-rescan', "core.require(select() == rows, 'CI trace selection changed')", "core.require(True, 'CI trace selection changed')", 'test_late_mutation_refuses_and_spent_never_retries'),
 ('final-snapshot-verification', '        core.verify_snapshot(manifest, deadline)', '        pass', 'test_links_and_copy_integrity_and_deadline'),
]
records = []
for name, before, after, test in cases:
 assert raw.count(before) == 1
 source = raw.replace(before, after, 1)
 module = types.ModuleType('mutant_' + name); module.__file__ = str(t.SOURCE / 'ci_trace_stage.py')
 exec(compile(source, module.__file__, 'exec'), module.__dict__); t.c = module
 output = io.StringIO(); result = unittest.TextTestRunner(stream=output, verbosity=2).run(t.Tests(test))
 assert not result.wasSuccessful(), 'survivor:' + name
 records.append({'name': name, 'target': test, 'mutantSHA256': hashlib.sha256(source.encode()).hexdigest(),
                 'killed': True, 'actualOutput': output.getvalue()})
print(json.dumps({'schema': 'CI-trace-focused-mutants/1', 'sourceSHA256': hashlib.sha256(raw.encode()).hexdigest(),
                  'killed': len(records), 'survivors': 0, 'records': records, 'operationalCredit': False}, sort_keys=True))
