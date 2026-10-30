#!/usr/bin/env python3
"""Run the caller's iOS tests, then retry only the failed ones in a freshly erased simulator.

ios-ci.yml's "Run unit and UI tests" step runs this with its environment. Attempt 1 is the
caller's selection, unchanged. If it fails, each later attempt erases the job's own simulator,
runs the caller's pre-test script again, and starts a new xcodebuild with -only-testing for the
tests still failing, so the app is installed clean. A test that passes on such a retry is flaky:
it is reported as a warning and does not fail the job. A test that fails every attempt does.

Retrying inside one xcodebuild session (-retry-tests-on-failure) kept the simulator and the app's
data, so a UI test broken by state an earlier test left behind failed all three iterations
(Evo delivery runs, October 2026).

Attempt 1 keeps Tests.xcresult and tests.log at the root of RESULTS and LOGS; attempt n uses
attempt-n/ under both. test-attempts.json at the root of RESULTS records every attempt.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PASSING = {'Passed', 'Expected Failure'}
DEVICE = re.compile(r'^id=([A-Fa-f0-9-]{36})$')


def lines(name):
    return [line for line in os.environ.get(name, '').splitlines() if line]


def xcodebuild_args(bundle):
    env = os.environ
    destination = env.get('MORPHEUS_IOS_DESTINATION') or env['DESTINATION']
    args = ['-project', env['PROJECT'], '-scheme', env['SCHEME'], '-configuration', env['CONFIGURATION'],
            '-sdk', env['SDK'], '-destination', f"platform={env['PLATFORM']},{destination}",
            '-clonedSourcePackagesDirPath', env['SOURCE_PACKAGES'], '-derivedDataPath', env['DERIVED_DATA'],
            '-resultBundlePath', str(bundle),
            '-onlyUsePackageVersionsFromResolvedFile', '-disableAutomaticPackageResolution']
    return args + (['-testPlan', env['TEST_PLAN']] if env.get('TEST_PLAN') else [])


def first_selection():
    env = os.environ
    args = ['-parallel-testing-enabled', env.get('PARALLEL_TESTING', 'NO')]
    args += [f'-only-testing:{test}' for test in lines('ONLY_TESTING')]
    args += [f'-skip-testing:{test}' for test in lines('SKIP_TESTING')]
    if env.get('MAXIMUM_PARALLEL_TESTING_WORKERS', '0') != '0':
        args += ['-maximum-parallel-testing-workers', env['MAXIMUM_PARALLEL_TESTING_WORKERS']]
    return args


def retry_selection(tests):
    # Serial, on the erased device itself: parallel workers would run on clones made earlier.
    args = ['-parallel-testing-enabled', 'NO']
    # Without this, Xcode 27 spends 600 s collecting diagnostics after each failure.
    # Older Xcode has no such flag, and passing one it does not know fails the invocation.
    if '-collect-test-diagnostics' in subprocess.run(['xcodebuild', '-help'], capture_output=True, text=True).stdout:
        args += ['-collect-test-diagnostics', 'never']
    return args + [f'-only-testing:{test}' for test in tests]


def run(attempt, selection, results, logs):
    """One attempt: the caller's pre-test script, then one xcodebuild, logged to a file and stdout."""
    results.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, RESULTS=str(results), LOGS=str(logs))
    if os.environ.get('PRE_TEST_SCRIPT'):
        prepared = subprocess.run(['bash', f"{env['GITHUB_WORKSPACE']}/{env['PRE_TEST_SCRIPT']}"], env=env)
        if prepared.returncode:
            print(f'::error::The pre-test script failed before attempt {attempt}.', flush=True)
            return prepared.returncode
    command = ['xcodebuild', 'test-without-building', *xcodebuild_args(results / 'Tests.xcresult'), *selection]
    with open(logs / 'tests.log', 'wb') as log:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        for chunk in iter(lambda: process.stdout.read1(65536), b''):
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            log.write(chunk)
        return process.wait()


def read_results(bundle, keep=None):
    """Each test's results by -only-testing identifier, and whether every failure names a test.

    None when the bundle cannot be read: an unknown outcome is never a pass.
    """
    exported = {}
    for kind in ('tests', 'summary'):
        done = subprocess.run(['xcrun', 'xcresulttool', 'get', 'test-results', kind, '--path', str(bundle)],
                              capture_output=True, text=True)
        try:
            exported[kind] = json.loads(done.stdout) if done.returncode == 0 else None
        except ValueError:
            exported[kind] = None
        if not isinstance(exported[kind], dict):
            return None
        if keep:
            (keep / f'{kind}.json').write_text(done.stdout)
    tests = {}

    def visit(node, target):
        kind = node.get('nodeType', '')
        if kind.endswith('test bundle'):
            target = node.get('name')
        if kind != 'Test Case':
            for child in node.get('children', []):
                visit(child, target)
        elif target and node.get('nodeIdentifier') and node.get('result'):
            tests.setdefault(f"{target}/{node['nodeIdentifier']}", []).append(node['result'])
        else:
            tests.setdefault(None, []).append('Unidentified')

    for node in exported['tests'].get('testNodes') or []:
        visit(node, None)
    failed = {test for test, outcomes in tests.items() if any(o not in PASSING | {'Skipped'} for o in outcomes)}
    reported = {f"{f['targetName']}/{f['testIdentifierString']}" if f.get('targetName') and f.get('testIdentifierString') else None
                for f in exported['summary'].get('testFailures', [])}
    # A failure Xcode reports without naming a test (a crashed or unbootstrapped bundle)
    # cannot be rerun selectively, so it must never be retried away.
    attributed = None not in failed and None not in reported and reported <= failed
    return {'tests': tests, 'failed': failed, 'attributed': attributed}


def erase(device):
    subprocess.run(['xcrun', 'simctl', 'shutdown', device], capture_output=True)  # Already shut down is fine.
    erased = subprocess.run(['xcrun', 'simctl', 'erase', device], capture_output=True, text=True)
    if erased.returncode:
        print(f'::error::Could not erase simulator {device}, so the failed tests were not retried in a used one.',
              erased.stderr, sep='\n', flush=True)
    return erased.returncode == 0


def main():
    results, logs = Path(os.environ['RESULTS']), Path(os.environ['LOGS'])
    attempts = os.environ.get('TEST_ITERATIONS', '0')
    if not attempts.isdigit():
        print(f'::error::test-iterations must be a whole number of attempts, not {attempts!r}.', flush=True)
        return 2
    attempts = max(int(attempts), 1)
    device = DEVICE.match(os.environ.get('MORPHEUS_IOS_DESTINATION', ''))
    if attempts > 1 and not device:
        print('::notice::Retries need the job-owned iOS simulator, so this run has one attempt.', flush=True)
        attempts = 1

    record = {'schemaVersion': 1, 'maxAttempts': attempts, 'attempts': []}
    status = run(1, first_selection(), results, logs)
    first = read_results(results / 'Tests.xcresult') if status else None
    failing = sorted(first['failed']) if first and first['attributed'] else []
    record['attempts'].append({'attempt': 1, 'resultBundle': 'Tests.xcresult', 'selection': 'caller',
                               'exitCode': status, 'failed': failing})
    unexplained = status != 0 and not failing
    if unexplained:
        print('::error::xcodebuild failed without a failure that names a test, so nothing was retried.', flush=True)

    passed_on = {}
    for attempt in range(2, attempts + 1):
        if not failing or unexplained:
            break
        directory = f'attempt-{attempt}'
        entry = {'attempt': attempt, 'resultBundle': f'{directory}/Tests.xcresult', 'selection': failing}
        record['attempts'].append(entry)
        if not erase(device.group(1)):
            entry['simulator'] = 'erase failed'
            break
        entry['simulator'] = 'erased'
        status = entry['exitCode'] = run(attempt, retry_selection(failing), results / directory, logs / directory)
        outcome = read_results(results / directory / 'Tests.xcresult', keep=results / directory)
        for test in failing:
            if outcome and all(o in PASSING for o in outcome['tests'].get(test, ['Missing'])):
                passed_on[test] = attempt
        failing = entry['failed'] = [test for test in failing if test not in passed_on]
        if status and (not outcome or not outcome['attributed'] or not failing):
            print(f'::error::Attempt {attempt} failed without a failure that names a retried test.', flush=True)
            unexplained = True

    # Only a test seen passing counts: one missing from a retry's results is still failing.
    passed = not failing and not unexplained
    record['result'] = 'passed' if passed else 'failed'
    record['flaky'] = [{'id': test, 'passedOnAttempt': attempt} for test, attempt in sorted(passed_on.items())]
    record['failed'] = [] if passed else failing
    (results / 'test-attempts.json').write_text(json.dumps(record, indent=2) + '\n')
    report(record)
    return 0 if passed else (status or 1)


def escape(text):
    return text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def report(record):
    flaky, failed, retried = record['flaky'], record['failed'], len(record['attempts']) > 1
    for test in flaky:
        print(f"::warning title=Flaky iOS test::{escape(test['id'])} failed attempt 1, then passed on a clean "
              f"retry (attempt {test['passedOnAttempt']} of {record['maxAttempts']}).", flush=True)
    for test in failed if retried else []:
        print(f"::error title=Failing iOS test::{escape(test)} failed all {len(record['attempts'])} attempts.", flush=True)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write(f"flaky-tests={json.dumps([t['id'] for t in flaky], separators=(',', ':'))}\n")
    if os.environ.get('GITHUB_STEP_SUMMARY') and retried:
        rows = ['### iOS test retries', '',
                f"Failed tests were retried in a freshly erased simulator, up to {record['maxAttempts']} attempts in total.", '']
        if flaky:
            rows += ['**Flaky:** failed, then passed on a clean retry. A warning, not a failure.', '']
            rows += [f"- `{t['id']}` passed on attempt {t['passedOnAttempt']}" for t in flaky] + ['']
        if failed:
            rows += ['**Failed every attempt:** these fail the job.', ''] + [f'- `{t}`' for t in failed] + ['']
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('\n'.join(rows) + '\n')


if __name__ == '__main__':
    sys.exit(main())
