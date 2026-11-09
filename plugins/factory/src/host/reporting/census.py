"""Read canonical current ownership metadata. Never output process command/environment text."""
import json
import os
import sys
import uuid
from pathlib import Path

installed = Path(__file__).parent / 'proof'
sys.path.insert(0, str(installed if installed.exists() else Path(__file__).parents[2]))
from owned_processes import read_census

os.environ.pop('TZ', None)
os.environ['LC_ALL'] = 'C'
rows, markers, groups = read_census()
for run_id in markers:
    uuid.UUID(run_id)
if not rows or len(rows) > 8192 or len(markers) > 2048:
    raise ValueError('incomplete census')
print(json.dumps({
    'identities': {pid: ' '.join((*stamp[1:], str(groups[pid]), str(stamp[0])))
                   for pid, (_, stamp) in rows.items()},
    'owned': {pid: list(stamp) for pid, (_, stamp) in rows.items()},
    'markedRunIds': list(markers),
}))
