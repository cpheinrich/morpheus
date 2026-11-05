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

A caller that sets simulator-lanes-from-host lets the runner decide how many simulators attempt 1
uses: MORPHEUS_IOS_SIMULATOR_LANES, set by the host in the runner's environment, is 1 (or absent)
for one serial simulator and 2 for two explicit lanes (run_lanes). Anything else fails before a
test runs. Xcode's own parallel testing is not used for this: it keeps a hosted unit bundle on one
clone, so unit tests would never use the second simulator. Retries stay serial on the erased job
simulator whatever the lane count.
"""
import copy
import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

PASSING = {'Passed', 'Expected Failure'}
DEVICE = re.compile(r'^id=([A-Fa-f0-9-]{36})$')


def lines(name):
    return [line for line in os.environ.get(name, '').splitlines() if line]


def xcodebuild_args(bundle, destination=None):
    env = os.environ
    destination = destination or env.get('MORPHEUS_IOS_DESTINATION') or env['DESTINATION']
    args = ['-project', env['PROJECT'], '-scheme', env['SCHEME'], '-configuration', env['CONFIGURATION'],
            '-sdk', env['SDK'], '-destination', f"platform={env['PLATFORM']},{destination}",
            '-clonedSourcePackagesDirPath', env['SOURCE_PACKAGES'], '-derivedDataPath', env['DERIVED_DATA'],
            *(['-resultBundlePath', str(bundle)] if bundle else []),
            '-onlyUsePackageVersionsFromResolvedFile', '-disableAutomaticPackageResolution']
    return args + (['-testPlan', env['TEST_PLAN']] if env.get('TEST_PLAN') else [])


def host_lanes():
    """The simulator lanes the runner's host declares, or None when the caller did not ask for them.

    A host that never declares a count runs one lane. Only 1 and 2 are known; any other value is a
    host configuration error, raised as ValueError so no test runs on a guess.
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
    if lanes is not None:
        # Host lanes are always serial inside each simulator: two lanes are two explicit
        # simulators, never Xcode's hidden clones.
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


def run(attempt, selection, results, logs, bundle=None, destination=None, lane=None, echo=True, shared=None,
        timing=None):
    """One attempt: the caller's pre-test script, then one xcodebuild, logged to a file and stdout.

    Returns the exit status and whether xcodebuild ran: a failed pre-test script reports itself.
    A lane runs on its own simulator and passes MORPHEUS_IOS_LANE to the pre-test script, so a
    caller can do once-per-run work (a quarantine run, a scope check) on lane 1 only. `shared` adds
    what the lanes hand the pre-test script: MORPHEUS_IOS_LANE_SELECTION, the file naming this
    lane's tests, so it prepares only what they need, and MORPHEUS_IOS_ENUMERATION, Xcode's
    enumeration of the caller's whole selection, so it need not enumerate again. `timing`, when
    given, gets each phase's [start, end] in epoch seconds from this process's own clock (preTest,
    xcodebuild), so lanes can be compared on one timeline without trusting a merged bundle's times.
    """
    timing = {} if timing is None else timing
    stamp = lambda: round(time.time(), 3)
    results.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    bundle = bundle or results / 'Tests.xcresult'
    env = dict(os.environ, RESULTS=str(results), LOGS=str(logs))
    if destination:
        env['MORPHEUS_IOS_DESTINATION'] = destination
    if lane:
        env['MORPHEUS_IOS_LANE'] = str(lane)
    env.update(shared or {})
    if os.environ.get('PRE_TEST_SCRIPT'):
        timing['preTest'] = [stamp(), None]
        # A lane's pre-test output goes to its own log, not interleaved with the other lane's.
        with open(logs / 'pre-test.log', 'wb') if not echo else open(os.devnull, 'wb') as quiet:
            prepared = subprocess.run(['bash', f"{env['GITHUB_WORKSPACE']}/{env['PRE_TEST_SCRIPT']}"], env=env,
                                      stdout=None if echo else quiet, stderr=None if echo else subprocess.STDOUT)
        timing['preTest'][1] = stamp()
        if prepared.returncode:
            where = f' on lane {lane}' if lane else ''
            print(f'::error::The pre-test script failed before attempt {attempt}{where}.', flush=True)
            return prepared.returncode, False
    bundle.parent.mkdir(parents=True, exist_ok=True)
    command = ['xcodebuild', 'test-without-building', *xcodebuild_args(bundle, destination), *selection]
    with open(logs / 'tests.log', 'wb') as log:
        timing['xcodebuild'] = [stamp(), None]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        for chunk in iter(lambda: process.stdout.read1(65536), b''):
            if echo:
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
            log.write(chunk)
        status = process.wait()
        timing['xcodebuild'][1] = stamp()
        return status, True


def enumerated(destination, path):
    """The caller's selection as Xcode enumerates it: every enabled test, by -only-testing identifier."""
    command = ['xcodebuild', 'test-without-building', *xcodebuild_args(None, destination),
               *first_selection(1)[2:], '-enumerate-tests', '-test-enumeration-style', 'flat',
               '-test-enumeration-format', 'json', '-test-enumeration-output-path', str(path)]
    done = subprocess.run(command, capture_output=True, text=True)
    if done.returncode:
        raise RuntimeError(f'Enumerating the selection failed: {done.stdout[-2000:]}{done.stderr[-2000:]}')
    data = json.loads(path.read_text())
    if data.get('errors'):
        raise RuntimeError(f"Enumerating the selection reported errors: {data['errors']}")
    tests = [t['identifier'] for value in data.get('values', []) for t in value.get('enabledTests', [])]
    tests = [t for t in tests if t.count('/') >= 1 and selectable(t.split('/', 1)[1])]
    if not tests:
        raise RuntimeError('Enumerating the selection found no tests.')
    return tests


def group_of(test):
    """A whole XCTest class or top-level Swift Testing suite (Target/Class), or a top-level test."""
    parts = test.split('/')
    return '/'.join(parts[:2]) if len(parts) >= 3 else test


def durations():
    """The caller's measured seconds per whole group (lane-durations), or {} to balance by count.

    The file is {"groups": {"Target/Class": {"seconds": s, "tests": n}}}: a group's seconds over
    its tests, from an earlier run. Anything malformed is a ValueError, so no lane runs on a guess.
    """
    path = os.environ.get('LANE_DURATIONS')
    if not path:
        return {}
    groups = json.loads((Path(os.environ['GITHUB_WORKSPACE']) / path).read_text()).get('groups')
    def number(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0
    if not isinstance(groups, dict) or not all(
            isinstance(entry, dict) and number(entry.get('seconds')) and number(entry.get('tests'))
            and entry['tests'] > 0 for entry in groups.values()):
        raise ValueError(f'lane-durations {path} must map each group to non-negative seconds over its tests')
    return {group: entry['seconds'] / entry['tests'] for group, entry in groups.items()}


def partition(tests, lanes=2, per_test=None):
    """Whole groups into `lanes` disjoint selections that together are exactly `tests`.

    Each target is balanced on its own, heaviest group first onto the lane with the least of that
    target's load, so every lane gets a share of every target (unit and UI alike). A group weighs
    its selected tests times its measured seconds per test when the caller gave them (per_test),
    a group without a measure the mean of the measured ones, and with no measures at all one per
    test. Selections name tests, never groups, so a caller's narrower filter is never widened.
    """
    per_test = per_test or {}
    groups = {}
    for test in tests:
        groups.setdefault(group_of(test), []).append(test)
    default = sum(per_test.values()) / len(per_test) if per_test else 1
    weight = {group: len(members) * per_test.get(group, default) for group, members in groups.items()}
    selections = [[] for _ in range(lanes)]
    total = [0] * lanes
    for target in sorted({g.split('/')[0] for g in groups}):
        load = [0] * lanes
        for group in sorted((g for g in groups if g.split('/')[0] == target), key=lambda g: (-weight[g], g)):
            # Least of this target's load first; on a tie, least load overall, so a target of
            # one class does not land beside another target's one class on the same lane.
            lane = min(range(lanes), key=lambda n: (load[n], total[n], n))
            selections[lane] += groups[group]
            load[lane] += weight[group]
            total[lane] += weight[group]
    flat = [t for selection in selections for t in selection]
    if sorted(flat) != sorted(tests) or len(set(flat)) != len(flat):
        raise RuntimeError('Lane selections are not an exact partition of the enumerated tests.')
    return selections


def simctl(*args):
    return subprocess.run(['xcrun', 'simctl', *args], capture_output=True, text=True)


def second_simulator(device):
    """A clone of the job's own simulator, named so the job's cleanup also removes it."""
    listed = json.loads(simctl('list', 'devices', '-j').stdout or '{}')
    names = [d['name'] for ds in listed.get('devices', {}).values() for d in ds if d.get('udid') == device]
    if not names:
        raise RuntimeError(f'The job simulator {device} is not in the device list.')
    simctl('shutdown', device)  # Already shut down is fine.
    cloned = simctl('clone', device, f'Clone 90 of {names[0]}')
    udid = cloned.stdout.strip()
    if cloned.returncode or not DEVICE.match(f'id={udid}'):
        raise RuntimeError(f'Could not clone the job simulator: {cloned.stderr.strip()}')
    return udid


def run_lanes(selections, devices, results, logs, enumeration=None):
    """Attempt 1 on two simulators at once, each prepared by the pre-test script and serial inside.

    Each lane writes lane-<n>/Tests.xcresult and lane-<n>/tests.log; the bundles are then merged
    into the attempt's Tests.xcresult and the logs concatenated into its tests.log, so everything
    after attempt 1 reads one run. Lane 1's pre-test writes to RESULTS itself, as a one-lane run's
    does; lane 2's to lane-2/.
    """
    # A lane with no -only-testing filter would run the whole scheme: never start one.
    if not selections or any(not selection for selection in selections):
        raise RuntimeError('A simulator lane has no tests selected; refusing to run it unfiltered.')
    outcome = [None] * len(selections)

    def lane(n):
        started = time.monotonic()
        timing = {}
        here = results if n == 1 else results / f'lane-{n}'
        try:
            status, tested = run(1, first_selection(1)[:2] + [f'-only-testing:{t}' for t in selections[n - 1]]
                             + [f'-skip-testing:{t}' for t in lines('SKIP_TESTING')],
                             here, logs / f'lane-{n}', bundle=results / f'lane-{n}' / 'Tests.xcresult',
                             destination=f'id={devices[n - 1]}', lane=n, echo=False,
                             shared={'MORPHEUS_IOS_LANE_SELECTION': str(results / f'lane-{n}' / 'selection.txt'),
                                     **({'MORPHEUS_IOS_ENUMERATION': str(enumeration)} if enumeration else {})},
                             timing=timing)
        except OSError as error:
            print(f'::error::Lane {n} could not run: {error}', flush=True)
            status, tested = 1, False
        outcome[n - 1] = {'lane': n, 'device': devices[n - 1], 'tests': len(selections[n - 1]),
                          'exitCode': status, 'ran': tested, 'seconds': round(time.monotonic() - started, 1),
                          **timing}

    threads = [threading.Thread(target=lane, args=(n,)) for n in range(1, len(selections) + 1)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    for n in range(1, len(selections) + 1):
        for name in ('pre-test.log', 'tests.log'):
            if (logs / f'lane-{n}' / name).exists():
                sys.stdout.buffer.write(f'--- lane {n} {name} ---\n'.encode() + (logs / f'lane-{n}' / name).read_bytes())
    sys.stdout.flush()
    logs.mkdir(parents=True, exist_ok=True)
    with open(logs / 'tests.log', 'wb') as log:
        for n in range(1, len(selections) + 1):
            lane_log = logs / f'lane-{n}' / 'tests.log'
            if lane_log.exists():
                log.write(lane_log.read_bytes())
    bundles = [str(results / f'lane-{n}' / 'Tests.xcresult') for n in range(1, len(selections) + 1)
               if (results / f'lane-{n}' / 'Tests.xcresult').exists()]
    # Any nonzero status fails the attempt, a signal's negative one included: max() would let a
    # lane killed by SIGTERM (-15) hide behind a sibling's 0.
    status = next((o['exitCode'] for o in outcome if o['exitCode'] != 0), 0)
    tested = all(o['ran'] for o in outcome)
    merging = time.monotonic()
    if len(bundles) == len(selections):
        merged = subprocess.run(['xcrun', 'xcresulttool', 'merge', *bundles, '--output-path',
                                 str(results / 'Tests.xcresult')], capture_output=True, text=True)
        if merged.returncode:
            print('::error::Could not merge the lanes\' result bundles.', merged.stderr, sep='\n', flush=True)
            status = status or 1
    elif tested:
        print('::error::A lane left no result bundle.', flush=True)
        status = status or 1
    return status, tested, outcome, round(time.monotonic() - merging, 1)


def selectable(identifier):
    # A test is Class/method() (XCTest), Suite/test() or a top-level test() (Swift Testing).
    # Xcode's placeholder for a bundle that never started is a bare sentence under "System
    # Failures", so -only-testing would select nothing with it.
    return '/' in identifier or identifier.endswith(')')


def read_results(bundle, keep=None):
    """Each test's results by -only-testing identifier, the bundles that could not start, and
    whether every failure names one of them.

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

    for node in exported['tests'].get('testNodes') or []:
        visit(node, None)
    failed = {test for test, outcomes in tests.items() if any(o not in PASSING | {'Skipped'} for o in outcomes)}
    reported, reported_broken = set(), set()
    for f in exported['summary'].get('testFailures', []):
        target, name = f.get('targetName'), f.get('testIdentifierString')
        if not (target and name):
            reported.add(None)
        elif selectable(name):
            reported.add(f'{target}/{name}')
        else:
            reported_broken.add(target)
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


def main():
    results, logs = Path(os.environ['RESULTS']), Path(os.environ['LOGS'])
    attempts = max(int(os.environ.get('TEST_ITERATIONS') or 0), 1)  # Validated before the build.
    device = DEVICE.match(os.environ.get('MORPHEUS_IOS_DESTINATION', ''))
    if attempts > 1 and not device:
        print('::notice::Retries need the job-owned iOS simulator, so this run has one attempt.', flush=True)
        attempts = 1

    try:
        lanes = host_lanes()
    except ValueError as error:
        print(f'::error::{error}. Fix the runner host\'s configuration; no test ran.', flush=True)
        return 1

    record = {'schemaVersion': 1, 'maxAttempts': attempts, 'attempts': []}
    if lanes is not None:
        record['simulatorLanes'] = lanes
        print(f'::notice::The runner host declares {lanes} simulator lane(s); attempt 1 uses {lanes}.', flush=True)
    # Attempt 1 on this process's clock, everything included (enumeration, clone, preparation,
    # tests, merge), and each phase of a one-simulator run; lanes record their own phases.
    attempt_timing = {'started': round(time.time(), 3)}
    if lanes == 2:
        if not device:
            print('::error::Two lanes need the job-owned iOS simulator.', flush=True)
            return 1
        clone = None
        # Everything the lanes cost outside the lanes themselves, so a comparison can see it.
        setup = record['laneSetupSeconds'] = {}
        try:
            started = time.monotonic()
            enumeration = results / 'lanes-enumeration.json'
            selections = partition(enumerated(f'id={device.group(1)}', enumeration), per_test=durations())
            setup['enumerate'] = round(time.monotonic() - started, 1)
            # A selection of one class or suite fills one lane only: run that one, on the job's
            # own simulator, and never clone a device for nothing.
            selections = [selection for selection in selections if selection]
            record['activeLanes'] = len(selections)
            if len(selections) < 2:
                print(f'::notice::The selection is one class or suite, so it runs on one of the {lanes} lanes.',
                      flush=True)
                status, tested = run(1, first_selection(lanes), results, logs, timing=attempt_timing)
            else:
                started = time.monotonic()
                clone = second_simulator(device.group(1))
                setup['clone'] = round(time.monotonic() - started, 1)
                for n, selection in enumerate(selections, start=1):
                    (results / f'lane-{n}').mkdir(parents=True, exist_ok=True)
                    (results / f'lane-{n}' / 'selection.txt').write_text(''.join(f'{t}\n' for t in selection))
                status, tested, record['lanes'], setup['merge'] = run_lanes(
                    selections, [device.group(1), clone], results, logs, enumeration)
        except (RuntimeError, ValueError, OSError) as error:
            print(f'::error::{error}', flush=True)
            return 1
        finally:
            if clone:
                simctl('shutdown', clone)
                simctl('delete', clone)
    else:
        if lanes is not None:
            record['activeLanes'] = 1
        status, tested = run(1, first_selection(lanes), results, logs, timing=attempt_timing)
    attempt_timing['finished'] = round(time.time(), 3)
    first = read_results(results / 'Tests.xcresult') if status else None
    attributed = first and first['attributed']
    failing = sorted(first['failed']) if attributed else []
    broken = sorted(first['broken']) if attributed else []
    record['attempts'].append({'attempt': 1, 'resultBundle': 'Tests.xcresult', 'selection': 'caller',
                               'exitCode': status, 'failed': failing, 'failedBundles': broken,
                               'timing': attempt_timing})
    unexplained = status != 0 and not failing and not broken
    if unexplained and tested:
        print('::error::xcodebuild failed without a failure that names a test, so nothing was retried.', flush=True)
    unbounded = [bundle for bundle in broken if bundle_selection(bundle) is None]
    if unbounded:
        print(f"::error::{', '.join(unbounded)} could not start, and the caller selected no tests in it to retry.",
              flush=True)
        unexplained = True

    passed_on, history, started, grafts = {}, {}, {}, {}
    for attempt in range(2, attempts + 1):
        if not (failing or broken) or unexplained:
            break
        directory = f'attempt-{attempt}'
        # A bundle's selection already covers its own tests.
        selected = [test for test in failing if test.split('/')[0] not in broken]
        selected += [test for bundle in broken for test in bundle_selection(bundle)]
        entry = {'attempt': attempt, 'resultBundle': f'{directory}/Tests.xcresult', 'selection': selected}
        if broken:
            entry['bundles'] = broken
        record['attempts'].append(entry)
        if not erase(device.group(1)):
            entry['simulator'] = 'erase failed'
            break
        entry['simulator'] = 'erased'
        status, tested = run(attempt, retry_selection(selected), results / directory, logs / directory)
        entry['exitCode'] = status
        outcome = read_results(results / directory / 'Tests.xcresult', keep=results / directory)
        for test in failing:
            if outcome and all(o in PASSING for o in outcome['tests'].get(test, ['Missing'])):
                passed_on[test] = attempt
            history.setdefault(test, []).append('Passed' if test in passed_on else 'Failed')
        failing = [test for test in failing if test not in passed_on]
        for bundle in broken:
            ran = [test for test in (outcome['tests'] if outcome else {}) if test and test.startswith(bundle + '/')]
            # A retry that ran none of the bundle's tests has not started it, whatever it exits.
            if ran and bundle not in outcome['broken']:
                started[bundle] = attempt
                grafts[bundle] = next(node for node in bundle_nodes(outcome['tree']) if node.get('name') == bundle)
                # Its tests ran for the first time here: a failure among them is retried like any.
                failing = sorted(set(failing) | {test for test in ran if test in outcome['failed']})
        broken = [bundle for bundle in broken if bundle not in started]
        entry['failed'], entry['failedBundles'] = failing, broken
        if status and (not outcome or not outcome['attributed'] or not (failing or broken)):
            if tested:
                print(f'::error::Attempt {attempt} failed without a failure that names a retried test.', flush=True)
            unexplained = True

    # Only a test seen passing counts: one missing from a retry's results is still failing.
    passed = not failing and not broken and not unexplained
    record['result'] = 'passed' if passed else 'failed'
    record['flaky'] = [{'id': test, 'passedOnAttempt': attempt} for test, attempt in sorted(passed_on.items())]
    record['recoveredBundles'] = [{'bundle': bundle, 'ranOnAttempt': attempt} for bundle, attempt in sorted(started.items())]
    record['failed'] = [] if passed else failing
    record['failedBundles'] = [] if passed else broken
    if passed and (passed_on or started):
        for name, exported in zip(('tests', 'summary'), combine(first, history, grafts)):
            (results / f'{name}.json').write_text(json.dumps(exported, indent=2) + '\n')
    (results / 'test-attempts.json').write_text(json.dumps(record, indent=2) + '\n')
    report(record)
    return 0 if passed else (status or 1)


def escape(text):
    return text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def report(record):
    flaky, failed, retried = record['flaky'], record['failed'], len(record['attempts']) > 1
    recovered, stuck = record['recoveredBundles'], record['failedBundles']
    for test in flaky:
        print(f"::warning title=Flaky iOS test::{escape(test['id'])} failed, then passed on a clean "
              f"retry (attempt {test['passedOnAttempt']} of {record['maxAttempts']}).", flush=True)
    for bundle in recovered:
        print(f"::warning title=iOS test bundle did not start::{escape(bundle['bundle'])} could not start on attempt 1, "
              f"then ran on a clean retry (attempt {bundle['ranOnAttempt']} of {record['maxAttempts']}).", flush=True)
    for test in failed if retried else []:
        print(f"::error title=Failing iOS test::{escape(test)} failed all {len(record['attempts'])} attempts.", flush=True)
    for bundle in stuck:
        print(f"::error title=iOS test bundle did not start::{escape(bundle)} ran none of its tests in "
              f"{len(record['attempts'])} attempt(s): its test runner or host app could not start.", flush=True)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write(f"flaky-tests={json.dumps([t['id'] for t in flaky], separators=(',', ':'))}\n")
    if os.environ.get('GITHUB_STEP_SUMMARY') and retried:
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
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('\n'.join(rows) + '\n')


if __name__ == '__main__':
    sys.exit(main())
