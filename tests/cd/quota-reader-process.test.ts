import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

it("bounds private-group cleanup, refuses unknown identity and never signals after reaping", () => {
  const helper = fileURLToPath(new URL("../../src/cd/quota-reader.py", import.meta.url));
  // Pure process/syscall fixtures; no native app server or model is invoked.
  const output = execFileSync("/usr/bin/python3", ["-B", "-c", String.raw`
import importlib.util,signal,sys,types,unittest
from unittest.mock import patch
s=importlib.util.spec_from_file_location("quota_reader",sys.argv[1]);q=importlib.util.module_from_spec(s);s.loader.exec_module(q)
class Clock:
 def __init__(self):self.at=0
 def now(self):return self.at
 def sleep(self,seconds):self.at+=seconds
class Cases(unittest.TestCase):
 def test_unknown_identity_never_signals(self):
  root=types.SimpleNamespace(pid=1234)
  with patch.object(q.os,"getpgid",return_value=4321),patch.object(q.os,"killpg") as kill:
   self.assertFalse(q.cleanup(root));kill.assert_not_called()
 def test_permission_failure_is_unknown(self):
  with patch.object(q.os,"getpgid",return_value=1234),patch.object(q.os,"killpg",side_effect=PermissionError):
   self.assertFalse(q.cleanup(types.SimpleNamespace(pid=1234)))
 def test_deadline_without_reap_is_two_seconds(self):
  clock=Clock()
  with patch.object(q.os,"getpgid",return_value=1234),patch.object(q.os,"killpg") as kill,patch.object(q.os,"waitpid",return_value=(0,0)):
   self.assertFalse(q.cleanup(types.SimpleNamespace(pid=1234),clock.now,clock.sleep))
   self.assertEqual(clock.at,2.0)
   self.assertEqual(kill.call_args_list, [unittest.mock.call(1234,signal.SIGTERM),unittest.mock.call(1234,signal.SIGKILL)])
 def test_reap_only_after_final_signal(self):
  clock=Clock();events=[];root=types.SimpleNamespace(pid=1234)
  def kill(pid,sig):
   events.append(("signal",sig))
   if sig==0:raise ProcessLookupError()
  def reap(pid,flags):
   self.assertEqual(events[-1],("signal",signal.SIGKILL));events.append(("reap",pid));return(pid,0)
  with patch.object(q.os,"getpgid",return_value=1234),patch.object(q.os,"killpg",side_effect=kill),patch.object(q.os,"waitpid",side_effect=reap):
   self.assertTrue(q.cleanup(root,clock.now,clock.sleep))
   self.assertEqual(events,[("signal",signal.SIGTERM),("signal",signal.SIGKILL),("reap",1234),("signal",0)])
 def test_reused_group_after_reap_is_never_signalled(self):
  clock=Clock()
  with patch.object(q.os,"getpgid",return_value=1234),patch.object(q.os,"killpg") as kill,patch.object(q.os,"waitpid",return_value=(1234,0)):
   self.assertFalse(q.cleanup(types.SimpleNamespace(pid=1234),clock.now,clock.sleep))
   self.assertEqual(clock.at,2.0)
   self.assertEqual([call.args[1] for call in kill.call_args_list if call.args[1]!=0],[signal.SIGTERM,signal.SIGKILL])
 def test_post_reap_permission_then_absence_is_confirmed(self):
  clock=Clock();probes=[]
  def kill(pid,sig):
   if sig==0:
    probes.append(sig)
    if len(probes)==1:raise PermissionError()
    raise ProcessLookupError()
  with patch.object(q.os,"getpgid",return_value=1234),patch.object(q.os,"killpg",side_effect=kill),patch.object(q.os,"waitpid",return_value=(1234,0)):
   self.assertTrue(q.cleanup(types.SimpleNamespace(pid=1234),clock.now,clock.sleep))
   self.assertEqual(probes,[0,0]);self.assertAlmostEqual(clock.at,0.07)
 def test_persistent_post_reap_permission_stops_at_bound(self):
  clock=Clock();signals=[]
  def kill(pid,sig):
   signals.append(sig)
   if sig==0:raise PermissionError()
  with patch.object(q.os,"getpgid",return_value=1234),patch.object(q.os,"killpg",side_effect=kill),patch.object(q.os,"waitpid",return_value=(1234,0)):
   self.assertFalse(q.cleanup(types.SimpleNamespace(pid=1234),clock.now,clock.sleep))
   self.assertEqual(clock.at,2.0)
   self.assertEqual([sig for sig in signals if sig!=0],[signal.SIGTERM,signal.SIGKILL])
suite=unittest.defaultTestLoader.loadTestsFromTestCase(Cases);result=unittest.TextTestRunner(stream=sys.stderr).run(suite)
if not result.wasSuccessful():sys.exit(1)
print("7 cleanup identity/boundary cases passed")
`, helper], { encoding: "utf8", timeout: 5_000 });
  expect(output.trim()).toBe("7 cleanup identity/boundary cases passed");
});
