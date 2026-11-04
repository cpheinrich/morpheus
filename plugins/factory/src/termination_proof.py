"""Late termination evidence for an exited unattended admission.

The guardian proves cleanup once, at exit. A census error, an identity ambiguity or a tool that
outlives that window leaves `cleanupVerified: false` for good, which holds the workspace and
refuses resume even after every owned process is gone. `reconcile` re-proves it with the same
tracker and the same standard: a fresh census of the run marker, the identities the guardian
recorded and their descendants, plus the guardian's own recorded identity. It never signals.
Only a positive proof writes `reconciliation.json`, bound to the admission's exact record bytes;
`process.json` is never changed. `valid` is the one check the guardian's admission gate and the
public status share. Like the tracker, this is cleanup for cooperating tools, not isolation from a
same-user process that clears the marker.
"""
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from owned_processes import OwnedProcesses

PROOF = 'reconciliation.json'


def _digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _exited_unverified(directory, run_id):
    """The guardian's final record for this run: exited, not rejected, cleanup unproven."""
    try:
        state = json.loads((directory / 'process.json').read_text())
        admission = json.loads((directory / 'admission.json').read_text())
    except Exception:
        return None
    if not isinstance(state, dict) or not isinstance(admission, dict):
        return None
    if state.get('runId') != run_id or admission.get('admissionId') != run_id:
        return None
    if state.get('state') != 'exited' or state.get('cleanupVerified') is not False or state.get('admissionRejected'):
        return None
    return state


def valid(directory, run_id):
    directory = Path(directory)
    if _exited_unverified(directory, run_id) is None:
        return False
    try:
        proof = json.loads((directory / PROOF).read_text())
        return (isinstance(proof, dict) and proof.get('version') == 1 and proof.get('admissionId') == run_id
                and proof.get('processSha256') == _digest(directory / 'process.json')
                and proof.get('admissionSha256') == _digest(directory / 'admission.json'))
    except Exception:
        return False


def _known(state):
    """The owned identities the guardian recorded: {pid: (uid, lstart words)}, or None if incomplete."""
    owned = state.get('ownedProcesses')
    if not isinstance(owned, list) or not owned:
        return None
    known = {}
    for entry in owned:
        if not isinstance(entry, dict):
            return None
        pid, stamp = entry.get('pid'), entry.get('identity')
        if not (type(pid) is int and pid > 0 and isinstance(stamp, list) and len(stamp) == 6
                and type(stamp[0]) is int and all(isinstance(word, str) and word for word in stamp[1:])):
            return None
        known[pid] = tuple(stamp)
    return known


def _guardian_gone(pid, recorded):
    """True only when the PID is absent or now names a different process than the guardian."""
    try:
        current = subprocess.check_output(['ps', '-p', str(pid), '-o', 'lstart=', '-o', 'pgid=', '-o', 'uid='],
                                          text=True, stderr=subprocess.DEVNULL, timeout=2).strip()
    except subprocess.CalledProcessError:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        except Exception:
            return False
        return False  # Something answers at that PID but its identity cannot be read.
    except Exception:
        return False
    return bool(current) and current.split() != recorded.split()


def reconcile(directory, run_id):
    directory = Path(directory)
    if valid(directory, run_id):
        return {'proven': True, 'reason': 'already reconciled'}
    state = _exited_unverified(directory, run_id)
    if state is None:
        return {'proven': False, 'reason': 'not an exited admission with unverified cleanup'}
    if (directory / PROOF).exists():
        return {'proven': False, 'reason': 'existing reconciliation does not match this admission'}
    known = _known(state)
    pid, recorded = state.get('guardianPid'), state.get('guardianIdentity')
    if known is None or not (type(pid) is int and pid > 0) or not (isinstance(recorded, str) and recorded.strip()):
        return {'proven': False, 'reason': 'original ownership evidence is incomplete'}
    # Bind the proof to the record as read before the census; a change since then invalidates it.
    proof = {'version': 1, 'admissionId': run_id, 'method': 'fresh owned-process census',
             'processSha256': _digest(directory / 'process.json'), 'admissionSha256': _digest(directory / 'admission.json'),
             'recordedIdentities': len(known)}
    if not _guardian_gone(pid, recorded):
        return {'proven': False, 'reason': 'guardian may still be running'}
    tracker = OwnedProcesses(run_id)
    tracker.known = dict(known)
    if not tracker.empty():
        return {'proven': False, 'reason': 'owned processes remain' if tracker.verified else 'process census unreadable'}
    proof['reconciledAt'] = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    tmp = directory / f'{PROOF}.{os.getpid()}.tmp'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as handle:
        handle.write(json.dumps(proof))
    try:
        os.link(tmp, directory / PROOF)  # Exclusive: never replaces an existing proof.
    except FileExistsError:
        pass
    finally:
        tmp.unlink()
    proven = valid(directory, run_id)
    return {'proven': proven, 'reason': 'fresh owned-process census found none' if proven else 'admission record changed during reconciliation'}


if __name__ == '__main__':
    command, directory, run_id = sys.argv[1:4]
    if command == 'valid':
        sys.exit(0 if valid(directory, run_id) else 1)
    if command == 'reconcile':
        print(json.dumps(reconcile(directory, run_id)))
        sys.exit(0)
    sys.exit(2)
