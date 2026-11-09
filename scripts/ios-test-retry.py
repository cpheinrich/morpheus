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

A bundle that could not start (its test runner or host app failed to install or launch) has no
test results at all. Xcode reports it as one placeholder Test Case, named like "App encountered an
error" under a "System Failures" suite, which is not a test -only-testing can select: retrying it by
that name runs nothing and exits 0. Such a bundle is retried with the caller's own selection inside
it (the whole bundle only when the caller selected all of it, never wider), and it counts as running
again only when the retry has results for its tests (consumer staging delivery, November 2026).

Attempt 1 keeps Tests.xcresult and tests.log at the root of RESULTS and LOGS; attempt n uses
attempt-n/ under both. test-attempts.json at the root of RESULTS records every attempt. When the
retries recovered every failure, tests.json and summary.json there show it the way Xcode's own
retry did (see combine), so a caller's result validator keeps working unchanged.

A caller that sets simulator-lanes-from-host lets the runner's host decide attempt 1's parallelism:
MORPHEUS_IOS_SIMULATOR_LANES, set by the host in the runner's environment, is 1 (or absent) for
Xcode's parallel testing off, and 2 for Xcode's own parallel testing with at most two workers. Xcode
then clones the prepared job simulator as it needs, and Swift Testing and XCTest parallelize as
they would locally. Anything else fails before a test runs. Retries stay serial on the erased job
simulator whatever the host declares. Attempt 1's preparation and xcodebuild intervals are recorded
on the runner's monotonic clock, so a run's wall time never comes from a result bundle's summary.
"""
import copy
import json
import os
import re
import subprocess
import sys
import time
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


def host_lanes():
    """The parallel lanes the runner's host declares, or None when the caller did not ask for them.

    A host that never declares a count runs one. Only 1 and 2 are known; any other value is a host
    configuration error, raised as ValueError so no test runs on a guess.
    """
    if os.environ.get('SIMULATOR_LANES_FROM_HOST') != 'true':
        return None
    declared = os.environ.get('MORPHEUS_IOS_SIMULATOR_LANES', '').strip()
    if declared in ('', '1'):
        return 1
    if declared == '2':
        return 2
    raise ValueError(f'MORPHEUS_IOS_SIMULATOR_LANES must be 1 or 2, not {declared!r}')


def first_selection(lanes=None):
    env = os.environ
    if lanes == 2:
        # Xcode's own parallel testing, capped at the two simulators the host sized its VM for.
        # A cap, not a count: a small selection may use fewer.
        args = ['-parallel-testing-enabled', 'YES', '-maximum-parallel-testing-workers', '2']
    elif lanes == 1:
        args = ['-parallel-testing-enabled', 'NO']
    else:
        args = ['-parallel-testing-enabled', env.get('PARALLEL_TESTING', 'NO')]
        if env.get('MAXIMUM_PARALLEL_TESTING_WORKERS', '0') != '0':
            args += ['-maximum-parallel-testing-workers', env['MAXIMUM_PARALLEL_TESTING_WORKERS']]
    args += [f'-only-testing:{test}' for test in lines('ONLY_TESTING')]
    args += [f'-skip-testing:{test}' for test in lines('SKIP_TESTING')]
    return args


def bundle_selection(bundle):
    """The caller's -only-testing entries inside a bundle: the bundle itself when the caller selected
    everything, None when the caller selected nothing in it, so it cannot be bounded."""
    only = lines('ONLY_TESTING')
    if not only:
        return [bundle]
    inside = [test for test in only if test == bundle or test.startswith(bundle + '/')]
    return inside or None


def retry_selection(selected):
    # Serial, on the erased device itself: parallel workers would run on clones made earlier.
    args = ['-parallel-testing-enabled', 'NO']
    # Without this, Xcode 27 spends 600 s collecting diagnostics after each failure.
    # Older Xcode has no such flag, and passing one it does not know fails the invocation.
    # xcodebuild prints its usage to stderr.
    usage = subprocess.run(['xcodebuild', '-help'], capture_output=True, text=True)
    if '-collect-test-diagnostics' in usage.stdout + usage.stderr:
        args += ['-collect-test-diagnostics', 'never']
    # The caller's skips still apply: a bundle retry selects a whole bundle or class.
    return (args + [f'-only-testing:{test}' for test in selected]
            + [f'-skip-testing:{test}' for test in lines('SKIP_TESTING')])


CLOCK = (time.monotonic(), round(time.time(), 3))


def stamp():
    """Seconds since this runner started, on the monotonic clock."""
    return round(time.monotonic() - CLOCK[0], 3)


def run(attempt, selection, results, logs, timing=None):
    """One attempt: the caller's pre-test script, then one xcodebuild, logged to a file and stdout.

    Returns the exit status and whether xcodebuild ran: a failed pre-test script reports itself.
    `timing`, when given, gets each phase's [start, end] (preTest, xcodebuild) from stamp().
    """
    timing = {} if timing is None else timing
    results.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, RESULTS=str(results), LOGS=str(logs))
    if os.environ.get('PRE_TEST_SCRIPT'):
        timing['preTest'] = [stamp(), None]
        prepared = subprocess.run(['bash', f"{env['GITHUB_WORKSPACE']}/{env['PRE_TEST_SCRIPT']}"], env=env)
        timing['preTest'][1] = stamp()
        if prepared.returncode:
            print(f'::error::The pre-test script failed before attempt {attempt}.', flush=True)
            return prepared.returncode, False
    command = ['xcodebuild', 'test-without-building', *xcodebuild_args(results / 'Tests.xcresult'), *selection]
    with open(logs / 'tests.log', 'wb') as log:
        timing['xcodebuild'] = [stamp(), None]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        for chunk in iter(lambda: process.stdout.read1(65536), b''):
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            log.write(chunk)
        status = process.wait()
        timing['xcodebuild'][1] = stamp()
        return status, True


def selectable(identifier):
    # A test is Class/method() (XCTest), Suite/test() or a top-level test() (Swift Testing).
    # Xcode's placeholder for a bundle that never started is a bare sentence under "System
    # Failures", so -only-testing would select nothing with it.
    return '/' in identifier or identifier.endswith(')')


def export_results(bundle, keep=None):
    """xcresulttool's tests and summary documents, or None when either cannot be read."""
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
    return exported


def tree_outcomes(tree):
    """Results by selectable test id (None for an unidentified case), and bundles with a failure
    that names no selectable test."""
    tests, broken = {}, set()

    def visit(node, target):
        kind = node.get('nodeType', '')
        if kind.endswith('test bundle'):
            target = node.get('name')
        if kind != 'Test Case':
            for child in node.get('children', []):
                visit(child, target)
        elif target and node.get('nodeIdentifier') and node.get('result'):
            if selectable(node['nodeIdentifier']):
                tests.setdefault(f"{target}/{node['nodeIdentifier']}", []).append(node['result'])
            elif node['result'] not in PASSING | {'Skipped'}:
                broken.add(target)
        else:
            tests.setdefault(None, []).append('Unidentified')

    for node in tree.get('testNodes') or []:
        visit(node, None)
    return tests, broken


def summary_failures(summary):
    reported, reported_broken = set(), set()
    for f in summary.get('testFailures', []):
        target, name = f.get('targetName'), f.get('testIdentifierString')
        if not (target and name):
            reported.add(None)
        elif selectable(name):
            reported.add(f'{target}/{name}')
        else:
            reported_broken.add(target)
    return reported, reported_broken


def read_results(bundle, keep=None):
    """Each test's results by -only-testing identifier, the bundles that could not start, and
    whether every failure names one of them.

    None when the bundle cannot be read: an unknown outcome is never a pass.
    """
    exported = export_results(bundle, keep)
    if exported is None:
        return None
    tests, broken = tree_outcomes(exported['tests'])
    failed = {test for test, outcomes in tests.items() if any(o not in PASSING | {'Skipped'} for o in outcomes)}
    reported, reported_broken = summary_failures(exported['summary'])
    # A failure Xcode reports without naming a test or a bundle in the tree (a crash, say) cannot
    # be rerun selectively, so it must never be retried away.
    attributed = None not in failed and None not in reported and reported <= failed and reported_broken <= broken
    return {'tests': tests, 'failed': failed, 'broken': broken, 'attributed': attributed,
            'tree': exported['tests'], 'summary': exported['summary']}


def cases(node):
    if node.get('nodeType') == 'Test Case':
        return [node]
    return [case for child in node.get('children', []) for case in cases(child)]


def tally(node):
    """Test Case counts by the summary field each result is counted in once every failure passed."""
    found = [case.get('result') for case in cases(node)]
    skipped, expected = found.count('Skipped'), found.count('Expected Failure')
    return {'passedTests': len(found) - skipped - expected, 'skippedTests': skipped,
            'expectedFailures': expected, 'totalTestCount': len(found)}


def combine(first, history, grafts):
    """Attempt 1's exports with each recovered test's retries as its Repetition children, and each
    bundle that could not start replaced by its node from the retry that ran it.

    This is the shape -retry-tests-on-failure gave tests.json and summary.json: the test passed,
    and its repetitions show the failure first. A bundle had no results in attempt 1, so the retry's
    are its only ones. Only called once every failure has recovered.
    """
    tree, summary = copy.deepcopy(first['tree']), copy.deepcopy(first['summary'])
    added = {'passedTests': 0, 'skippedTests': 0, 'expectedFailures': 0, 'totalTestCount': 0}

    def visit(node, target):
        if node.get('nodeType', '').endswith('test bundle'):
            target = node.get('name')
            if target in grafts:
                # Attempt 1's cases here (the placeholder, and any skipped beside it) leave the
                # counts by their own category; the retry's cases join them by theirs.
                old = tally(node)
                node.clear()
                node.update(copy.deepcopy(grafts[target]))
                for key, value in tally(node).items():
                    added[key] += value - old[key]
        test = f"{target}/{node.get('nodeIdentifier')}"
        if node.get('nodeType') == 'Test Case':
            if test in history:
                node['children'] = [{'nodeType': 'Repetition', 'name': 'Repetition 1', 'result': node['result'],
                                     'children': node.get('children', [])}]
                node['children'] += [{'nodeType': 'Repetition', 'name': f'Repetition {n}', 'result': result}
                                     for n, result in enumerate(history[test], 2)]
                node['result'] = 'Passed'
            return
        if node.get('result') == 'Failed':
            node['result'] = 'Passed'
        for child in node.get('children', []):
            visit(child, target)

    for node in tree.get('testNodes') or []:
        visit(node, None)
    # Retries run on the job's one device, so its configuration gains what the grafts add.
    for counts in [summary, *summary.get('devicesAndConfigurations', [])]:
        counts['passedTests'] = counts.get('passedTests', 0) + counts.get('failedTests', 0)
        counts['failedTests'] = 0
        for key, value in added.items():
            if key in counts or key == 'passedTests':
                counts[key] = counts.get(key, 0) + value
    summary.update(result='Passed', testFailures=[], retries='test-attempts.json')
    return tree, summary


def bundle_nodes(node_or_tree):
    nodes = node_or_tree.get('testNodes') or node_or_tree.get('children') or []
    return [found for node in nodes for found in
            ([node] if node.get('nodeType', '').endswith('test bundle') else bundle_nodes(node))]


def erase(device):
    subprocess.run(['xcrun', 'simctl', 'shutdown', device], capture_output=True)  # Already shut down is fine.
    erased = subprocess.run(['xcrun', 'simctl', 'erase', device], capture_output=True, text=True)
    if erased.returncode:
        print(f'::error::Could not erase simulator {device}, so the failed tests were not retried in a used one.',
              erased.stderr, sep='\n', flush=True)
    return erased.returncode == 0


def attempt_limit():
    attempts = max(int(os.environ.get('TEST_ITERATIONS') or 0), 1)  # Validated before the build.
    device = DEVICE.match(os.environ.get('MORPHEUS_IOS_DESTINATION', ''))
    if attempts > 1 and not device:
        print('::notice::Retries need the job-owned iOS simulator, so this run has one attempt.', flush=True)
        attempts = 1
    return attempts, device


class Retries:
    """Failing tests and unstarted bundles across attempts, and what each retry recovered."""

    def __init__(self, record, results, logs, device):
        self.record, self.results, self.logs, self.device = record, results, logs, device
        self.passed_on, self.history, self.started, self.grafts = {}, {}, {}, {}

    def first_attempt(self, lanes):
        timing = {}
        self.status, self.tested = run(1, first_selection(lanes), self.results, self.logs, timing)
        self.first = read_results(self.results / 'Tests.xcresult') if self.status else None
        attributed = self.first and self.first['attributed']
        self.failing = sorted(self.first['failed']) if attributed else []
        self.broken = sorted(self.first['broken']) if attributed else []
        self.record['attempts'].append({'attempt': 1, 'resultBundle': 'Tests.xcresult', 'selection': 'caller',
                                        'exitCode': self.status, 'failed': self.failing, 'failedBundles': self.broken,
                                        'timing': timing})
        self.unexplained = self.status != 0 and not self.failing and not self.broken
        if self.unexplained and self.tested:
            print('::error::xcodebuild failed without a failure that names a test, so nothing was retried.', flush=True)
        unbounded = [bundle for bundle in self.broken if bundle_selection(bundle) is None]
        if unbounded:
            print(f"::error::{', '.join(unbounded)} could not start, and the caller selected no tests in it to retry.",
                  flush=True)
            self.unexplained = True

    def selection(self):
        # A bundle's selection already covers its own tests.
        selected = [test for test in self.failing if test.split('/')[0] not in self.broken]
        selected += [test for bundle in self.broken for test in bundle_selection(bundle)]
        return selected

    def note_passes(self, attempt, outcome):
        for test in self.failing:
            if outcome and all(o in PASSING for o in outcome['tests'].get(test, ['Missing'])):
                self.passed_on[test] = attempt
            self.history.setdefault(test, []).append('Passed' if test in self.passed_on else 'Failed')
        self.failing = [test for test in self.failing if test not in self.passed_on]

    def note_started(self, attempt, outcome):
        for bundle in self.broken:
            ran = [test for test in (outcome['tests'] if outcome else {}) if test and test.startswith(bundle + '/')]
            # A retry that ran none of the bundle's tests has not started it, whatever it exits.
            if ran and bundle not in outcome['broken']:
                self.started[bundle] = attempt
                self.grafts[bundle] = next(node for node in bundle_nodes(outcome['tree']) if node.get('name') == bundle)
                # Its tests ran for the first time here: a failure among them is retried like any.
                self.failing = sorted(set(self.failing) | {test for test in ran if test in outcome['failed']})
        self.broken = [bundle for bundle in self.broken if bundle not in self.started]

    def retry(self, attempt):
        """One clean retry; False when the simulator could not be erased, which ends retrying."""
        directory = f'attempt-{attempt}'
        selected = self.selection()
        entry = {'attempt': attempt, 'resultBundle': f'{directory}/Tests.xcresult', 'selection': selected}
        if self.broken:
            entry['bundles'] = self.broken
        self.record['attempts'].append(entry)
        if not erase(self.device.group(1)):
            entry['simulator'] = 'erase failed'
            return False
        entry['simulator'] = 'erased'
        self.status, self.tested = run(attempt, retry_selection(selected), self.results / directory, self.logs / directory)
        entry['exitCode'] = self.status
        outcome = read_results(self.results / directory / 'Tests.xcresult', keep=self.results / directory)
        self.note_passes(attempt, outcome)
        self.note_started(attempt, outcome)
        entry['failed'], entry['failedBundles'] = self.failing, self.broken
        if self.status and (not outcome or not outcome['attributed'] or not (self.failing or self.broken)):
            if self.tested:
                print(f'::error::Attempt {attempt} failed without a failure that names a retried test.', flush=True)
            self.unexplained = True
        return True

    def finish(self):
        """Record the outcome; True when every failure passed on a retry."""
        record = self.record
        # Only a test seen passing counts: one missing from a retry's results is still failing.
        passed = not self.failing and not self.broken and not self.unexplained
        record['result'] = 'passed' if passed else 'failed'
        record['flaky'] = [{'id': test, 'passedOnAttempt': attempt} for test, attempt in sorted(self.passed_on.items())]
        record['recoveredBundles'] = [{'bundle': bundle, 'ranOnAttempt': attempt} for bundle, attempt in sorted(self.started.items())]
        record['failed'] = [] if passed else self.failing
        record['failedBundles'] = [] if passed else self.broken
        if passed and (self.passed_on or self.started):
            for name, exported in zip(('tests', 'summary'), combine(self.first, self.history, self.grafts)):
                (self.results / f'{name}.json').write_text(json.dumps(exported, indent=2) + '\n')
        (self.results / 'test-attempts.json').write_text(json.dumps(record, indent=2) + '\n')
        return passed


def main():
    results, logs = Path(os.environ['RESULTS']), Path(os.environ['LOGS'])
    attempts, device = attempt_limit()

    try:
        lanes = host_lanes()
    except ValueError as error:
        print(f'::error::{error}. Fix the runner host\'s configuration; no test ran.', flush=True)
        return 1

    record = {'schemaVersion': 1, 'maxAttempts': attempts, 'attempts': [],
              'clock': {'unit': 'seconds since the runner started, monotonic', 'startedEpoch': CLOCK[1]}}
    if lanes is not None:
        record['simulatorLanes'] = lanes
        print(f'::notice::The runner host declares {lanes} simulator lane(s): attempt 1 runs with Xcode\'s '
              f'parallel testing {"on, at most 2 workers" if lanes == 2 else "off"}.', flush=True)
    retries = Retries(record, results, logs, device)
    retries.first_attempt(lanes)
    for attempt in range(2, attempts + 1):
        if not (retries.failing or retries.broken) or retries.unexplained:
            break
        if not retries.retry(attempt):
            break
    passed = retries.finish()
    report(record)
    return 0 if passed else (retries.status or 1)


def escape(text):
    return text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def annotate(record):
    flaky, failed, retried = record['flaky'], record['failed'], len(record['attempts']) > 1
    for test in flaky:
        print(f"::warning title=Flaky iOS test::{escape(test['id'])} failed, then passed on a clean "
              f"retry (attempt {test['passedOnAttempt']} of {record['maxAttempts']}).", flush=True)
    for bundle in record['recoveredBundles']:
        print(f"::warning title=iOS test bundle did not start::{escape(bundle['bundle'])} could not start on attempt 1, "
              f"then ran on a clean retry (attempt {bundle['ranOnAttempt']} of {record['maxAttempts']}).", flush=True)
    for test in failed if retried else []:
        print(f"::error title=Failing iOS test::{escape(test)} failed all {len(record['attempts'])} attempts.", flush=True)
    for bundle in record['failedBundles']:
        print(f"::error title=iOS test bundle did not start::{escape(bundle)} ran none of its tests in "
              f"{len(record['attempts'])} attempt(s): its test runner or host app could not start.", flush=True)


def summary_rows(record):
    flaky, failed = record['flaky'], record['failed']
    recovered, stuck = record['recoveredBundles'], record['failedBundles']
    rows = ['### iOS test retries', '',
            f"Failed tests were retried in a freshly erased simulator, up to {record['maxAttempts']} attempts in total.", '']
    if flaky:
        rows += ['**Flaky:** failed, then passed on a clean retry. A warning, not a failure.', '']
        rows += [f"- `{t['id']}` passed on attempt {t['passedOnAttempt']}" for t in flaky] + ['']
    if recovered:
        rows += ['**Could not start, then ran on a clean retry:** a warning, not a failure.', '']
        rows += [f"- `{b['bundle']}` ran on attempt {b['ranOnAttempt']}" for b in recovered] + ['']
    if failed:
        rows += ['**Failed every attempt:** these fail the job.', ''] + [f'- `{t}`' for t in failed] + ['']
    if stuck:
        rows += ['**Could not start in any attempt:** these fail the job.', ''] + [f'- `{b}`' for b in stuck] + ['']
    return rows


def report(record):
    annotate(record)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write(f"flaky-tests={json.dumps([t['id'] for t in record['flaky']], separators=(',', ':'))}\n")
    if os.environ.get('GITHUB_STEP_SUMMARY') and len(record['attempts']) > 1:
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('\n'.join(summary_rows(record)) + '\n')


if __name__ == '__main__':
    sys.exit(main())
