"""Find ordinary worker descendants across setsid/reparenting, without logging env.

The inherited run marker complements PPID tracking: polling the parent tree alone
misses a tool whose launcher exits before the next sample. This is ownership cleanup
for cooperating tools, not isolation against an authorized user clearing the marker.
"""
import os
import signal
import subprocess

MARKER = 'FACTORY_WORKER_RUN_ID'


class OwnedProcesses:
    def __init__(self, run_id):
        self.token = f'{MARKER}={run_id}'
        self.known = {}
        self.verified = True

    def observe(self):
        try:
            raw = subprocess.check_output(
                ['ps', 'eww', '-axo', 'pid=,ppid=,pgid=,uid=,stat=,lstart=,command='],
                text=True, stderr=subprocess.DEVNULL, timeout=2)
            rows = {}
            marked = set()
            for line in raw.splitlines():
                parts = line.split(None, 10)
                if len(parts) != 11:
                    raise ValueError('Incomplete process census')
                pid, parent, group, uid = map(int, parts[:4])
                if uid != os.getuid() or parts[4].startswith('Z'):
                    continue
                stamp = (uid, *parts[5:10])  # PGID can change after setsid.
                rows[pid] = (parent, stamp)
                if self.token in parts[10].split():
                    marked.add(pid)
            owned = marked | {pid for pid, (_, stamp) in rows.items()
                              if self.known.get(pid) == stamp}
            while True:
                children = {pid for pid, (parent, _) in rows.items() if parent in owned}
                if children <= owned:
                    break
                owned |= children
            for pid in owned:
                self.known[pid] = rows[pid][1]
            return {pid: rows[pid][1] for pid in owned}
        except Exception:
            # A missed census can lose an unmarked parent relationship. Never turn
            # unreadable ownership into proof that a replacement writer is safe.
            self.verified = False
            return None

    def signal(self, signum):
        owned = self.observe()
        if owned is None:
            return
        for pid, stamp in owned.items():
            # Check start identity again immediately before signalling a PID.
            try:
                raw = subprocess.check_output(
                    ['ps', '-p', str(pid), '-o', 'uid=', '-o', 'lstart='],
                    text=True, stderr=subprocess.DEVNULL, timeout=2).split()
                if tuple([int(raw[0]), *raw[1:]]) != stamp:
                    self.verified = False
                    continue
                os.kill(pid, signum)
            except ProcessLookupError:
                pass
            except subprocess.CalledProcessError:
                # A failed lookup is absence only when the PID is actually gone.
                try:
                    os.kill(pid, 0)
                    self.verified = False
                except ProcessLookupError:
                    pass
                except Exception:
                    self.verified = False
            except Exception:
                self.verified = False

    def empty(self):
        remaining = self.observe()
        return self.verified and remaining is not None and not remaining
