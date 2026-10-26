"""Pure proposal qualification using exact shell definitions and private fake children."""
from pathlib import Path
import datetime
import atexit
import shutil
import hashlib
import json
import os
import shlex
import subprocess
import sys
import tempfile

HERE=Path(__file__).resolve().parent
SOURCE=HERE.parents[1]/'.github/actions/ios-testflight-upload'
helpers=(SOURCE/'asc-helpers.sh').read_bytes()
script=(SOURCE/'upload-testflight.sh').read_bytes()
effects=(SOURCE/'upload-effects.sh').read_bytes()
lines=script.decode().splitlines();assign='\n'.join(lines[47:49])+'\n';positive='\n'.join(lines[119:124])+'\n'
loop='\n'.join(effects.decode().splitlines()[50:60])+'\n'
base=Path(tempfile.mkdtemp(prefix='processing-fake-')).resolve()
atexit.register(lambda: shutil.rmtree(str(base)))
fake=base/'provider.py'
fake.write_text("import json,os\nprint(json.dumps({'timeout':os.environ.get('PROCESSING_TIMEOUT_SECONDS'),'poll':os.environ.get('PROCESSING_POLL_SECONDS'),'secretPresent':'SENTRY_AUTH_TOKEN' in os.environ,'pid':os.getpid(),'ppid':os.getppid()}))\n")
wrapper=base/'fake-provider'
wrapper.write_text('#!/bin/sh\nexec '+shlex.quote(sys.executable)+' -I -S -B '+shlex.quote(str(fake))+' "$@"\n');wrapper.chmod(0o700)
import re
text=(SOURCE/'action.yml').read_text()
declared={key: re.findall(r"^        "+key+r": '([0-9]+)'$",text,re.M)[0]
          for key in ['PROCESSING_TIMEOUT_SECONDS','PROCESSING_POLL_SECONDS']}
assert declared=={'PROCESSING_TIMEOUT_SECONDS':'1200','PROCESSING_POLL_SECONDS':'30'}
records=[]
for label,binding,expected in [('proposed-overrides-hostile-inheritance',True,('1200','30')),('current-inherited-default-is-not-a-cap',False,('9000','1')),('proposed-zero-hostile-inheritance',True,('1200','30'))]:
 env={'PATH':'/usr/bin:/bin','ASC_CLI':str(wrapper),'PROCESSING_TIMEOUT_SECONDS':'9000' if 'zero' not in label else '0','PROCESSING_POLL_SECONDS':'1' if 'zero' not in label else '0','SENTRY_AUTH_TOKEN':'FIXTURE_NOT_A_SECRET'}
 source='set -euo pipefail\n'
 if binding:source+='export PROCESSING_TIMEOUT_SECONDS='+shlex.quote(declared['PROCESSING_TIMEOUT_SECONDS'])+' PROCESSING_POLL_SECONDS='+shlex.quote(declared['PROCESSING_POLL_SECONDS'])+'\n'
 source+=assign+positive+helpers.decode()+'\nrun_asccli builds uploads get --upload-id FIXTURE\n'
 r=subprocess.run(['/bin/bash','--noprofile','--norc','-s'],input=source.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,timeout=2)
 assert r.returncode==0 and not r.stderr,(label,r.stderr)
 actual=json.loads(r.stdout);assert (actual['timeout'],actual['poll'])==expected
 assert actual['secretPresent'] is False
 records.append({'case':label,'actual':actual,'exit':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode(),'stdinSHA256':hashlib.sha256(source.encode()).hexdigest(),'directChildWaitedAndEOF':True,'actualProvider':False})
for regress,expected in [(0,41),(1,81)]:
 source='''set -u
clock=0
calls=1
regressed=0
upload_state=AWAITING_UPLOAD
upload_id=FIXTURE
PROCESSING_TIMEOUT_SECONDS=1200
PROCESSING_POLL_SECONDS=30
date() { printf '%s\n' "$clock"; }
sleep() {
  if [[ "REGRESS" == 1 && "$regressed" == 0 ]]; then clock=$((clock-1200));regressed=1;fi
  clock=$((clock+$1))
}
run_asccli() { printf '{}'; }
record_upload_resource() { calls=$((calls+1)); }
trap 'printf "{\\"calls\\":%s,\\"clock\\":%s}\\n" "$calls" "$clock"' EXIT
'''.replace('REGRESS',str(regress))+loop
 r=subprocess.run(['/bin/bash','--noprofile','--norc','-s'],input=source.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/bin:/bin'},timeout=2)
 actual=json.loads(r.stdout);assert r.returncode==1 and actual=={'calls':expected,'clock':1200}
 assert b'Timed out confirming upload acceptance' in r.stderr
 records.append({'case':'exact-source-loop-clock-regression-'+str(regress),'actual':actual,'exit':r.returncode,'stdinSHA256':hashlib.sha256(source.encode()).hexdigest(),'directChildWaitedAndEOF':True,'callsAreFake':True,'realSleeps':0})
print(json.dumps({'schema':'processing-environment-proposal-only-tests/1','python':sys.version,'cases':len(records),'records':records,'sourceRefs':{'ascHelpersSHA256':hashlib.sha256(helpers).hexdigest(),'uploadScriptSHA256':hashlib.sha256(script).hexdigest(),'effectsSHA256':hashlib.sha256(effects).hexdigest()},'sourceImplemented':'NORMAL_M_SOURCE_PENDING_REVIEW_AND_CI','normalClockProved':False,'normalProviderCalls':0,'networkCalls':0,'operationalCredit':False},sort_keys=True))
