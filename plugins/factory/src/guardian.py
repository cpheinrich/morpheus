"""Own one Claude process group. stdin is a lease from the service, never a terminal.
Even if the service is killed, this process expires the lease and removes descendants.
"""
import json, os, selectors, signal, subprocess, sys, time, fcntl
from pathlib import Path
from datetime import datetime, timezone
from owned_processes import OwnedProcesses, MARKER
import termination_proof


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def identity(pid):
    try: return subprocess.check_output(['ps','-p',str(pid),'-o','lstart=','-o','pgid=','-o','uid='],text=True,stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError: return None


def previous_admission_safe(current_path):
    """The workspace's last admission exited with cleanup verified, then or by a later proof."""
    try:
        previous = json.loads(current_path.read_text())
        prior = json.loads((Path(previous['directory']) / 'process.json').read_text())
        return (prior.get('runId') == previous['runId'] and prior.get('state') == 'exited'
                and not prior.get('admissionRejected')
                and (prior.get('cleanupVerified') is True
                     # Cleanup proven later by an explicit reconciliation of this exact record.
                     or termination_proof.valid(previous['directory'], previous['runId'])))
    except Exception: return False


def redaction_secrets(job):
    # Delay a suffix so secrets split across read boundaries never reach disk. Only
    # environment variable names are in job.json; values remain in this process.
    secrets = set()
    for name in job.get('redactEnv', []):
        value = os.environ.get(name)
        if value:
            secrets.add(value.encode()); secrets.add(json.dumps(value, ensure_ascii=False)[1:-1].encode())
    return sorted(secrets, key=len, reverse=True)


class Guardian:
    def __init__(self, job_path):
        self.job_path = Path(job_path)
        self.job = json.loads(self.job_path.read_text())
        self.root = self.job_path.parent
        os.umask(0o077)
        self.state = {'guardianPid': os.getpid(), 'runId': self.job['runId'], 'state': 'starting'}
        self.persist()

    def persist(self):
        tmp = self.root / 'process.tmp'
        tmp.write_text(json.dumps(self.state)); tmp.replace(self.root / 'process.json')

    def refuse(self, reason):
        self.state.update(state='exited', admissionRejected=True, reason=reason, cleanupVerified=True)
        self.persist(); sys.exit(0)

    # Only the explicit unattended path uses a kernel-held workspace admission. The file
    # remains after a crash; age or a dead owner alone never authorizes replacement.
    def admit(self):
        admission = self.job['admission']
        lock_path = Path(admission['directory']) / (admission['workspaceKey'] + '.lock')
        self.admission_lock = open(lock_path, 'a+')
        try: fcntl.flock(self.admission_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: self.refuse('Workspace already has an active guardian')
        current_path = lock_path.with_suffix('.json')
        if current_path.exists() and not previous_admission_safe(current_path):
            self.refuse('Previous workspace admission has unverified termination')
        tmp = current_path.with_suffix('.tmp')
        tmp.write_text(json.dumps({'runId': self.job['runId'], 'directory': str(self.root)})); tmp.replace(current_path)

    def launch(self):
        job, state = self.job, self.state
        self.owned = OwnedProcesses(job['runId']) if job.get('admission') else None
        child_env = dict(os.environ)
        if self.owned: child_env[MARKER] = job['runId']
        # Measure the invocation independently of the existing deadline/lease clock, through
        # owned cleanup. Wall timestamps locate it; only the monotonic clock measures duration.
        self.invocation_start_ns = time.monotonic_ns()
        started_at = utc_now()
        try:
            self.child = subprocess.Popen(job['argv'], cwd=job['cwd'], env=child_env,
                                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                          start_new_session=True)
        except Exception as error:
            state.update(state='exited', exitCode=127, reason='Worker launch failed' if job.get('admission') else str(error), interrupted=False, cleanupVerified=True); self.persist()
            sys.exit(1)
        if self.owned: state['timing'] = {'startedAt': started_at}
        state.update(claudePid=self.child.pid, claudeIdentity=identity(self.child.pid), guardianIdentity=identity(os.getpid()), state='running'); self.persist()

    def open_streams(self):
        self.selector = selectors.DefaultSelector()
        for f, name in [(sys.stdin.buffer, 'lease'), (self.child.stdout, 'stdout'), (self.child.stderr, 'stderr')]:
            os.set_blocking(f.fileno(), False); self.selector.register(f, selectors.EVENT_READ, name)
        self.last_lease = self.start = time.monotonic()
        self.stopping = None
        self.lease_buffer = b''
        self.bytes_written = 0
        self.max_bytes = self.job.get('maxLogBytes', 16 * 1024 * 1024)
        self.out = open(self.root / 'events.jsonl', 'ab', buffering=0)
        self.err = open(self.root / 'stderr.log', 'ab', buffering=0)
        self.secrets = redaction_secrets(self.job)
        self.tails = {self.out: b'', self.err: b''}

    def output(self, dest, data, final=False):
        secrets = self.secrets
        data = self.tails[dest] + data
        limit = len(data) if final else max(0, len(data) - max([len(s) for s in secrets] + [1]) + 1)
        # Move the boundary before any complete or partial secret that spans it.
        for secret in secrets:
            start = data.find(secret)
            while start != -1:
                if start < limit < start + len(secret): limit = start
                start = data.find(secret, start + 1)
        prefix, self.tails[dest] = data[:limit], data[limit:]
        for secret in secrets: prefix = prefix.replace(secret, b'[REDACTED]')
        dest.write(prefix)

    def stop(self, signum=signal.SIGINT):
        if self.stopping is None: self.stopping = time.monotonic()
        if self.owned: self.owned.signal(signum)
        try: os.killpg(self.child.pid, signum)
        except ProcessLookupError: pass
        except PermissionError:
            # Darwin can return EPERM for an already-empty process group.
            try: os.getpgid(self.child.pid)
            except ProcessLookupError: return
            raise

    def on_signal(self, signum, frame): self.stop()

    def prepare_input(self):
        signal.signal(signal.SIGTERM, self.on_signal); signal.signal(signal.SIGINT, self.on_signal)
        os.set_blocking(self.child.stdin.fileno(), False)
        # Claude reads a stream-json conversation; Codex exec reads one plain prompt until EOF.
        text_input = self.job.get('input') == 'text'
        prompt = self.job['prompt']
        self.pending_input = prompt.encode() if text_input else (json.dumps({'type':'user','message':{'role':'user','content':prompt}})+'\n').encode()
        self.input_registered = False
        self.close_requested = text_input

    def check_limits(self, now):
        job, state = self.job, self.state
        cancel = (self.root/'cancel').exists()
        task_cancel = (self.root/'task-cancel').exists()
        if cancel or task_cancel:
            if job.get('admission'): state['reason']='Cancelled'
            self.stop_requested(task_cancel and not cancel)
        elif now-self.start > job['maxRunSeconds']:
            if job.get('admission'): state['reason']='Run deadline reached'
            self.stop()
        if not job.get('background',False) and now-self.last_lease > job['graceSeconds']:
            state['reason']='Owner lease expired'; self.stop()
        if self.stopping is not None:
            if now-self.stopping > 8: self.stop(signal.SIGKILL)
            elif now-self.stopping > 3: self.stop(signal.SIGTERM)

    def sync_input(self):
        stdin = self.child.stdin
        if self.pending_input and not self.input_registered and not stdin.closed:
            self.selector.register(stdin, selectors.EVENT_WRITE, 'input'); self.input_registered=True
        if not self.pending_input and self.input_registered:
            self.selector.unregister(stdin); self.input_registered=False
        if self.close_requested and not self.pending_input and not stdin.closed: stdin.close()

    def write_input(self, selected):
        try:
            written=os.write(selected.fd,self.pending_input[:65536]);self.pending_input=self.pending_input[written:]
        except BlockingIOError: pass
        except (BrokenPipeError,OSError):
            self.selector.unregister(self.child.stdin);self.input_registered=False;self.pending_input=b'';self.child.stdin.close()

    def stop_requested(self, task_cancel):
        if task_cancel and self.stopping is None and self.child.poll() is None:
            self.state['taskCanceled'] = True
        self.stop()

    def lease_message(self, message):
        kind = message.get('type')
        if kind=='heartbeat': self.last_lease=time.monotonic()
        elif kind in ('stop', 'task-cancel'): self.stop_requested(kind=='task-cancel')
        elif kind=='close': self.close_requested=True
        elif kind=='input' and self.child.poll() is None:
            self.pending_input+=(json.dumps(message['message'])+'\n').encode()
            if len(self.pending_input)>2*1024*1024: self.state['reason']='Input limit reached';self.stop();self.pending_input=b''

    def read_lease(self, data):
        self.lease_buffer += data
        if len(self.lease_buffer)>1024*1024: self.stop(); self.lease_buffer=b''; return
        while b'\n' in self.lease_buffer:
            line,self.lease_buffer=self.lease_buffer.split(b'\n',1)
            try: message=json.loads(line)
            except ValueError: self.stop();continue
            self.lease_message(message)

    def read_ready(self, selected):
        if selected.data=='input': return self.write_input(selected)
        try: data=os.read(selected.fd, 65536)
        except BlockingIOError: return
        if not data:
            self.selector.unregister(selected.fileobj); return
        if selected.data=='lease': return self.read_lease(data)
        self.bytes_written+=len(data)
        if self.bytes_written>self.max_bytes:
            self.state['reason']='Output limit reached';self.stop();return
        self.output(self.out if selected.data=='stdout' else self.err, data)

    def drain_exited(self):
        # Drain already-written output before declaring exit.
        for f,dest in [(self.child.stdout,self.out),(self.child.stderr,self.err)]:
            while self.bytes_written<=self.max_bytes:
                try: data=os.read(f.fileno(),65536)
                except (BlockingIOError,OSError): break
                if not data:break
                self.bytes_written+=len(data)
                if self.bytes_written<=self.max_bytes: self.output(dest, data)

    def supervise(self):
        while True:
            now=time.monotonic()
            if self.owned: self.owned.observe()
            self.check_limits(now)
            self.sync_input()
            for selected, _ in self.selector.select(.2):
                self.read_ready(selected)
            if self.child.poll() is not None:
                self.drain_exited()
                break

    def wait_for_group(self):
        deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            if self.owned:
                if self.owned.empty(): break
                self.owned.signal(signal.SIGTERM)
                time.sleep(.05)
                continue
            try: os.killpg(self.child.pid,0)
            except (ProcessLookupError, PermissionError):break
            time.sleep(.05)

    def verify_owned(self):
        # KILL is not proof: wait for detached tools too, then retain admission on
        # any unreadable census, identity ambiguity or remaining live descendant.
        owned = self.owned
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and not owned.empty():
            owned.signal(signal.SIGKILL)
            time.sleep(.05)
        self.state['cleanupVerified'] = owned.empty()
        self.state['ownedProcesses'] = [{'pid': pid, 'identity': list(stamp)}
                                        for pid, stamp in owned.known.items()]

    def cleanup(self):
        # Also stop background tools left behind after the main CLI exits.
        interrupted = self.stopping is not None
        self.stop(signal.SIGTERM)
        self.wait_for_group()
        self.stop(signal.SIGKILL)
        self.child.wait()
        self.output(self.out, b'', True); self.output(self.err, b'', True)
        self.out.close();self.err.close();self.selector.close()
        if self.owned: self.verify_owned()
        self.state.update(state='exited',exitCode=self.child.returncode,interrupted=interrupted)
        if self.owned:
            self.state['timing'].update(
                endedAt=utc_now(),
                durationMs=(time.monotonic_ns() - self.invocation_start_ns) // 1000000)
        self.persist()

    def main(self):
        if self.job.get('admission'): self.admit()
        self.launch()
        self.open_streams()
        self.prepare_input()
        try:
            self.supervise()
        finally:
            self.cleanup()


Guardian(sys.argv[1]).main()
