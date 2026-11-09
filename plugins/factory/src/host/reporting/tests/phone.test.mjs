import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observePhone} from '../phone.mjs';
const udid='00000000-0000000000000000',identifier='11111111-1111-1111-1111-111111111111';
const source={deviceUdid:udid,leasePath:'/synthetic/lease.json'};
function fixture(){
  const device={identifier,hardwareProperties:{udid,reality:'physical'},deviceProperties:{bootState:'booted',developerModeStatus:'enabled',ddiServicesAvailable:true},connectionProperties:{transportType:'wired',pairingState:'paired',tunnelState:'connected'},private:'PRIVATE'};
  const calls=[],lease={lease:'absent',signature:'absent'};
  const run=async(command,args)=>{calls.push({command,args});return {stdout:JSON.stringify(args[1]==='list'?{result:{devices:[device]}}:{result:{deviceIdentifier:identifier,passcodeRequired:false,unlockedSinceBoot:true}})};};
  return {device,calls,options:{run,readLease:async()=>lease,now:()=>new Date('2026-11-07T08:00:00Z')}};
}
test('bounded enrolled inventory and lock facts can prove host execution preconditions',async()=>{
  const f=fixture();const observed=await observePhone(source,f.options);
  assert.deepEqual(observed,{sourceObservedAt:'2026-11-07T08:00:00.000Z',value:{lease:'absent',ready:true,state:'ready',reasons:[]}});
  assert.equal(f.calls.length,3);
  assert.ok(f.calls.every(c=>c.command==='xcrun'&&c.args.includes('--timeout')&&c.args.includes('10')));
  assert.deepEqual(f.calls.map(c=>c.args.slice(0,3)),[['devicectl','list','devices'],['devicectl','device','info'],['devicectl','list','devices']]);
  assert.ok(f.calls.every(c=>!c.args.some(a=>/ddiServices|connect|mount|reboot|unlock|test|process/.test(a))));
  assert.equal(JSON.stringify(observed).includes('PRIVATE'),false);assert.equal(JSON.stringify(observed).includes(udid),false);
});
test('paired wired unlocked-since-boot phone with inactive tunnel/DDI reports actual incomplete prerequisites',async()=>{
  const f=fixture();f.device.connectionProperties.tunnelState='disconnected';f.device.deviceProperties.ddiServicesAvailable=false;
  const s=await observePhone(source,f.options);assert.equal(s.value.ready,false);assert.deepEqual(s.value.reasons,['tunnel-inactive','ddi-unavailable']);
});
test('held lease is busy and never runs lock information query',async()=>{
  const f=fixture();f.options.readLease=async()=>({lease:'held',signature:'owner-a'});
  const s=await observePhone(source,f.options);assert.deepEqual(s.value,{lease:'held',ready:null,state:'busy',reasons:['lease-held']});assert.equal(f.calls.length,2);
});
test('lease appearing or changing before publication discards readiness',async()=>{
  for(const stage of [1,2,3]) {
    const f=fixture();let reads=0;f.options.readLease=async()=>++reads>=stage?{lease:'held',signature:'owner-new'}:{lease:'absent',signature:'absent'};
    const s=await observePhone(source,f.options);assert.equal(s.value.ready,null);assert.equal(s.value.state,'busy');
  }
  const f=fixture();let reads=0;f.options.readLease=async()=>({lease:'absent',signature:String(++reads)});
  const s=await observePhone(source,f.options);assert.deepEqual(s.value.reasons,['lease-changed']);assert.equal(s.value.ready,null);
});
test('identity change or mismatched lock identity cannot publish ready',async()=>{
  for(const lockMismatch of [false,true]){
    const f=fixture(),run=f.options.run;let lists=0;
    f.options.run=async(command,args)=>{
      if(args[1]==='list'&&++lists===2&&!lockMismatch)f.device.identifier='22222222-2222-2222-2222-222222222222';
      const result=await run(command,args);
      return lockMismatch&&args[1]==='device'?{stdout:JSON.stringify({result:{deviceIdentifier:'other',passcodeRequired:false,unlockedSinceBoot:true}})}:result;
    };
    const s=await observePhone(source,f.options);assert.equal(s.value.ready,null);assert.deepEqual(s.value.reasons,['identity-changed']);
  }
});
test('absent enrollment, missing facts, lock rejection and modern inventory retain narrow meaning',async()=>{
  const absent=fixture();absent.device.hardwareProperties.udid='00000000-0000000000000001';assert.equal((await observePhone(source,absent.options)).value.ready,false);assert.equal(absent.calls.length,2);
  const missing=fixture();delete missing.device.deviceProperties.ddiServicesAvailable;assert.equal((await observePhone(source,missing.options)).value.ready,null);
  const denied=fixture(),base=denied.options.run;denied.options.run=(c,a)=>a[1]==='device'?Promise.reject(Error('PRIVATE')):base(c,a);assert.equal((await observePhone(source,denied.options)).value.ready,null);
  const modern=fixture();modern.device.properties={hardware:{udid,reality:'physical'},connection:{pairingState:'paired',state:'connected',transportType:'wired'},state:{bootState:'booted',developerModeStatus:{enabled:{mode:1}}}};delete modern.device.hardwareProperties;delete modern.device.connectionProperties;
  assert.equal((await observePhone(source,modern.options)).value.ready,true);
});
test('malformed inventory and lease errors fail closed before device lock read',async()=>{
  const f=fixture();f.options.run=async()=>({stdout:'PRIVATE'});await assert.rejects(observePhone(source,f.options));
  const g=fixture();g.options.readLease=async()=>{throw Error('unavailable');};await assert.rejects(observePhone(source,g.options));assert.equal(g.calls.length,0);
});
test('a currently valid held lease survives either inventory timeout or malformed response',async()=>{
 for(const stage of [1,2])for(const malformed of [false,true]){
  const f=fixture(),read=f.options.run;let lists=0;f.options.readLease=async()=>({lease:'held',signature:'held'});
  f.options.run=async(c,a)=>a[1]==='list'&&++lists===stage?(malformed?{stdout:'invalid'}:Promise.reject(Error('timeout'))):read(c,a);
  assert.deepEqual((await observePhone(source,f.options)).value,{lease:'held',ready:null,state:'busy',reasons:['lease-held']});
  assert.equal(f.calls.some(c=>c.args[1]==='device'),false);
 }
});
