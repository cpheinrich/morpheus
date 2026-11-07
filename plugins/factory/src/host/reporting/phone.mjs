import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jsonFile } from './files.mjs';
const exec = promisify(execFile);
async function leaseAt(path) {
  try {
    const record = await jsonFile(path);
    return { lease:'held', signature:JSON.stringify(record.data)+record.at };
  } catch(error) {
    if(error.code==='ENOENT')return {lease:'absent',signature:'absent'};
    throw new Error('unavailable');
  }
}
function enrolledDevice(data, udid) {
  const rows = data?.result?.devices;
  if (!Array.isArray(rows) || rows.length > 128) throw new Error('unavailable');
  if(rows.some(d=>d.properties?.hardware?.udid&&d.hardwareProperties?.udid&&d.properties.hardware.udid!==d.hardwareProperties.udid))throw new Error('unavailable');
  const matches = rows.filter(d => (d.properties?.hardware?.udid ?? d.hardwareProperties?.udid) === udid);
  if (matches.length > 1) throw new Error('unavailable');
  return matches[0] ?? null;
}
function developerStatus(modern,legacy) {
  const value=modern.state?.developerModeStatus;
  if(value?.enabled)return 'enabled';
  if(value?.disabled)return 'disabled';
  return legacy.developerModeStatus;
}
function preconditions(device, lock) {
  if (!device) return {ready:false,reasons:['device-absent']};
  const cp=device.connectionProperties??{},dp=device.deviceProperties??{},hp=device.hardwareProperties??{};
  const modern=device.properties??{};
  const checks=[
    [modern.hardware?.reality??hp.reality,'physical','not-physical'],
    [modern.connection?.transportType??cp.transportType,'wired','not-wired'],
    [modern.connection?.pairingState??cp.pairingState,'paired','not-paired'],
    [modern.state?.bootState??dp.bootState,'booted','not-booted'],
    [developerStatus(modern,dp),'enabled','developer-mode-disabled'],
    [modern.connection?.state??cp.tunnelState,'connected','tunnel-inactive'],
    [modern.state?.ddiServicesAvailable??dp.ddiServicesAvailable,true,'ddi-unavailable'],
    [lock?.passcodeRequired,false,'passcode-required'],
    [lock?.unlockedSinceBoot,true,'not-unlocked-since-boot'],
  ];
  const reasons=checks.filter(([value,expected])=>value!==undefined&&value!==null&&value!==expected).map(([, ,reason])=>reason);
  const unknown=checks.some(([value])=>value===undefined||value===null);
  const failed=reasons.length>0;
  if(unknown)reasons.push('unreported');
  return {ready:failed?false:unknown?null:true,reasons};
}
async function lockFacts(first,before,priorLock,source,read) {
  if(!first||typeof first.identifier!=='string'||priorLock.lease!=='absent'||priorLock.signature!==before.signature) return {lock:null,changed:false};
  try {
    const result=(await read(['device','info','lockState','--device',source.deviceUdid])).result;
    const changed=!!result&&result.deviceIdentifier!==first.identifier;
    return {lock:changed?null:result,changed};
  } catch {return {lock:null,changed:false};}
}
function phoneResult(before,priorLock,after,first,second,lock) {
  const value={lease:after.lease,ready:null,state:'unknown',reasons:[]};
  if(after.lease==='held'){value.state='busy';value.reasons=['lease-held'];return value;}
  if(before.signature!==after.signature||priorLock.signature!==after.signature){value.reasons=['lease-changed'];return value;}
  if(lock.changed||first?.identifier!==second?.identifier||Boolean(first)!==Boolean(second)){value.reasons=['identity-changed'];return value;}
  Object.assign(value,preconditions(second,lock.lock));
  value.state=value.ready===true?'ready':value.ready===false?'not-ready':'unknown';
  return value;
}
export async function observePhone(source,{run=exec,readLease=leaseAt,now=()=>new Date()}={}) {
  const read=async args=>JSON.parse((await run('xcrun',['devicectl',...args,'--quiet','--timeout','10','--json-output','-'],{timeout:15000,maxBuffer:262144})).stdout);
  const before=await readLease(source.leasePath);
  if(!source.deviceUdid)return {value:{lease:before.lease,ready:null}};
  const first=enrolledDevice(await read(['list','devices']),source.deviceUdid);
  const priorLock=await readLease(source.leasePath);
  const lock=await lockFacts(first,before,priorLock,source,read);
  const second=enrolledDevice(await read(['list','devices']),source.deviceUdid);
  const after=await readLease(source.leasePath);
  return {sourceObservedAt:now().toISOString(),value:phoneResult(before,priorLock,after,first,second,lock)};
}
