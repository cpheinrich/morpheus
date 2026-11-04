"""Own one Claude process group. stdin is a lease from the service, never a terminal.
Even if the service is killed, this process expires the lease and removes descendants.
"""
import json, os, selectors, signal, subprocess, sys, time, fcntl
from pathlib import Path

job_path = Path(sys.argv[1])
job = json.loads(job_path.read_text())
root = job_path.parent
os.umask(0o077)
state = {'guardianPid': os.getpid(), 'runId': job['runId'], 'state': 'starting'}
def persist():
    tmp = root / 'process.tmp'
    tmp.write_text(json.dumps(state)); tmp.replace(root / 'process.json')
persist()
# Only the explicit unattended path uses a kernel-held workspace admission. The file
# remains after a crash; age or a dead owner alone never authorizes replacement.
if job.get('admission'):
    admission = job['admission']
    lock_path = Path(admission['directory']) / (admission['workspaceKey'] + '.lock')
    admission_lock = open(lock_path, 'a+')
    def refuse(reason):
        state.update(state='exited', admissionRejected=True, reason=reason, cleanupVerified=True)
        persist(); sys.exit(0)
    try: fcntl.flock(admission_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: refuse('Workspace already has an active guardian')
    current_path = lock_path.with_suffix('.json')
    if current_path.exists():
        try:
            previous = json.loads(current_path.read_text())
            prior = json.loads((Path(previous['directory']) / 'process.json').read_text())
            safe = (prior.get('runId') == previous['runId'] and prior.get('state') == 'exited'
                    and prior.get('cleanupVerified') is True and not prior.get('admissionRejected'))
        except Exception: safe = False
        if not safe: refuse('Previous workspace admission has unverified termination')
    tmp = current_path.with_suffix('.tmp')
    tmp.write_text(json.dumps({'runId': job['runId'], 'directory': str(root)})); tmp.replace(current_path)
try:
    child = subprocess.Popen(job['argv'], cwd=job['cwd'], env=os.environ,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             start_new_session=True)
except Exception as error:
    state.update(state='exited', exitCode=127, reason='Worker launch failed' if job.get('admission') else str(error), interrupted=False, cleanupVerified=True); persist()
    sys.exit(1)
def identity(pid):
    try: return subprocess.check_output(['ps','-p',str(pid),'-o','lstart=','-o','pgid=','-o','uid='],text=True,stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError: return None
state.update(claudePid=child.pid, claudeIdentity=identity(child.pid), guardianIdentity=identity(os.getpid()), state='running'); persist()
selector = selectors.DefaultSelector()
for f, name in [(sys.stdin.buffer, 'lease'), (child.stdout, 'stdout'), (child.stderr, 'stderr')]:
    os.set_blocking(f.fileno(), False); selector.register(f, selectors.EVENT_READ, name)
last_lease = start = time.monotonic()
stopping = None
lease_buffer = b''
bytes_written = 0
max_bytes = job.get('maxLogBytes', 16 * 1024 * 1024)
out = open(root / 'events.jsonl', 'ab', buffering=0)
err = open(root / 'stderr.log', 'ab', buffering=0)
# Delay a suffix so secrets split across read boundaries never reach disk. Only
# environment variable names are in job.json; values remain in this process.
secrets = set()
for name in job.get('redactEnv', []):
    value = os.environ.get(name)
    if value:
        secrets.add(value.encode()); secrets.add(json.dumps(value, ensure_ascii=False)[1:-1].encode())
secrets = sorted(secrets, key=len, reverse=True)
tails = {out: b'', err: b''}
def output(dest, data, final=False):
    data = tails[dest] + data
    limit = len(data) if final else max(0, len(data) - max([len(s) for s in secrets] + [1]) + 1)
    # Move the boundary before any complete or partial secret that spans it.
    for secret in secrets:
        start = data.find(secret)
        while start != -1:
            if start < limit < start + len(secret): limit = start
            start = data.find(secret, start + 1)
    prefix, tails[dest] = data[:limit], data[limit:]
    for secret in secrets: prefix = prefix.replace(secret, b'[REDACTED]')
    dest.write(prefix)
def stop(signum=signal.SIGINT):
    global stopping
    if stopping is None: stopping = time.monotonic()
    try: os.killpg(child.pid, signum)
    except ProcessLookupError: pass
    except PermissionError:
        # Darwin can return EPERM for an already-empty process group.
        try: os.getpgid(child.pid)
        except ProcessLookupError: return
        raise

def on_signal(signum, frame): stop()
signal.signal(signal.SIGTERM, on_signal); signal.signal(signal.SIGINT, on_signal)
os.set_blocking(child.stdin.fileno(), False)
# Claude reads a stream-json conversation; Codex exec reads one plain prompt until EOF.
text_input = job.get('input') == 'text'
pending_input = job['prompt'].encode() if text_input else (json.dumps({'type':'user','message':{'role':'user','content':job['prompt']}})+'\n').encode()
input_registered = False
close_requested = text_input
try:
    while True:
        now=time.monotonic()
        if (root/'cancel').exists() or now-start > job['maxRunSeconds']:
            if job.get('admission'): state['reason']='Cancelled' if (root/'cancel').exists() else 'Run deadline reached'
            stop()
        if not job.get('background',False) and now-last_lease > job['graceSeconds']:
            state['reason']='Owner lease expired'; stop()
        if stopping is not None:
            if now-stopping > 8: stop(signal.SIGKILL)
            elif now-stopping > 3: stop(signal.SIGTERM)
        if pending_input and not input_registered and not child.stdin.closed:
            selector.register(child.stdin, selectors.EVENT_WRITE, 'input'); input_registered=True
        if not pending_input and input_registered:
            selector.unregister(child.stdin); input_registered=False
        if close_requested and not pending_input and not child.stdin.closed: child.stdin.close()
        for selected, _ in selector.select(.2):
            if selected.data=='input':
                try:
                    written=os.write(selected.fd,pending_input[:65536]);pending_input=pending_input[written:]
                except BlockingIOError: pass
                except (BrokenPipeError,OSError):
                    selector.unregister(child.stdin);input_registered=False;pending_input=b'';child.stdin.close()
                continue
            try: data=os.read(selected.fd, 65536)
            except BlockingIOError: continue
            if not data:
                selector.unregister(selected.fileobj); continue
            if selected.data=='lease':
                lease_buffer += data
                if len(lease_buffer)>1024*1024: stop(); lease_buffer=b'';continue
                while b'\n' in lease_buffer:
                    line,lease_buffer=lease_buffer.split(b'\n',1)
                    try: message=json.loads(line)
                    except ValueError: stop();continue
                    if message.get('type')=='heartbeat': last_lease=time.monotonic()
                    elif message.get('type')=='stop': stop()
                    elif message.get('type')=='close': close_requested=True
                    elif message.get('type')=='input' and child.poll() is None:
                        pending_input+=(json.dumps(message['message'])+'\n').encode()
                        if len(pending_input)>2*1024*1024: state['reason']='Input limit reached';stop();pending_input=b''
            else:
                bytes_written+=len(data)
                if bytes_written>max_bytes:
                    state['reason']='Output limit reached';stop();continue
                output(out if selected.data=='stdout' else err, data)
        if child.poll() is not None:
            # Drain already-written output before declaring exit.
            for f,dest in [(child.stdout,out),(child.stderr,err)]:
                while bytes_written<=max_bytes:
                    try: data=os.read(f.fileno(),65536)
                    except (BlockingIOError,OSError): break
                    if not data:break
                    bytes_written+=len(data)
                    if bytes_written<=max_bytes: output(dest, data)
            break
finally:
    # Also stop background tools left behind after the main CLI exits.
    interrupted = stopping is not None
    stop(signal.SIGTERM)
    deadline=time.monotonic()+2
    while time.monotonic()<deadline:
        try: os.killpg(child.pid,0)
        except (ProcessLookupError, PermissionError):break
        time.sleep(.05)
    stop(signal.SIGKILL)
    child.wait()
    output(out, b'', True); output(err, b'', True)
    out.close();err.close();selector.close()
    if job.get('admission'):
        # Sending KILL is not proof of cleanup. Unknown ps results retain admission.
        try:
            rows = subprocess.check_output(['ps','-axo','pid=,pgid=,stat='], text=True)
            state['cleanupVerified'] = not any(int(parts[1]) == child.pid and not parts[2].startswith('Z')
                for line in rows.splitlines() if len(parts := line.split()) >= 3)
        except Exception: state['cleanupVerified'] = False
    state.update(state='exited',exitCode=child.returncode,interrupted=interrupted)
    persist()
