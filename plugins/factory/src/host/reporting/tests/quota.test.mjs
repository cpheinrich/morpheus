import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readProviderQuota} from '../quota.mjs';
const exampleTailnetAddress=[100,64,0,1].join('.');
const time=Date.parse('2026-11-07T08:00:00Z');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(provider='codex') {
  const credentials=provider==='codex'?{access_token:'PRIVATE_PROVIDER',chatgpt_account_id:'subject-example',expires_at:'4102444800'}:
    {access_token:'PRIVATE_PROVIDER',account_uuid:'subject-example',expires_at:'4102444800'};
  const platform=provider==='codex'?'openai':'anthropic';
  const metadata={id:2,name:'Example account',platform,type:'oauth',proxy_id:null,updated_at:'revision-a',credentials:Object.fromEntries(Object.entries(credentials).filter(([k])=>k!=='access_token'))};
  const row={name:metadata.name,platform,type:'oauth',credentials};
  const usage=provider==='codex'?{rate_limit:{primary_window:{used_percent:9,limit_window_seconds:604800,reset_at:4102444800},secondary_window:null}}:
    {five_hour:{utilization:5,resets_at:'2100-01-01T00:00:00Z'},seven_day:{utilization:83,resets_at:'2100-01-01T00:00:00Z'}};
  const calls=[];
  const binding={id:'gateway-example-2',instanceId:'gateway-example',accountId:2,provider,baseUrl:'https://gateway.example',gatewayOrigin:'https://gateway.example',subjectSha256:hash('subject-example'),directEgress:true};
  const fetchImpl=async(url,options)=>{
    const path=new URL(url).pathname;calls.push({url:String(url),options});
    if(path==='/api/v1/auth/login')return Response.json({data:{access_token:'PRIVATE_ADMIN'}});
    if(path==='/api/v1/admin/accounts/2')return Response.json({data:metadata});
    if(path==='/api/v1/admin/accounts/data')return Response.json({data:{accounts:[row],proxies:[]}});
    return Response.json(usage);
  };
  return {binding,metadata,row,credentials,usage,calls,options:{email:'synthetic',password:'PRIVATE_PASSWORD',fetchImpl,now:()=>time,env:{}}};
}
test('exact singleton export and direct GET preserve provider windows and retrieval time without secrets',async()=>{
  const f=fixture(),value=await readProviderQuota(f.binding,f.options);
  assert.deepEqual(value,{sourceObservedAt:'2026-11-07T08:00:00.000Z',value:{accountId:'gateway-example-2',provider:'codex',usageSource:'provider-get',windows:[{name:'7d',usedPercent:9,resetsAt:'2100-01-01T00:00:00.000Z'}]}});
  assert.deepEqual(f.calls.map(c=>[new URL(c.url).pathname,new URL(c.url).search,c.options.method]),[
    ['/api/v1/auth/login','','POST'],['/api/v1/admin/accounts/2','','GET'],['/api/v1/admin/accounts/data','?ids=2&include_proxies=true','GET'],
    ['/backend-api/wham/usage','','GET'],['/api/v1/admin/accounts/2','','GET']]);
  assert.ok(f.calls.every(c=>c.options.redirect==='error'));
  assert.equal(f.calls[3].options.headers['ChatGPT-Account-Id'],'subject-example');
  assert.equal(JSON.stringify(value).includes('PRIVATE'),false);
});
for(const provider of ['claude','codex'])test(`${provider} accepts numeric-string, epoch and supported timestamp expiry`,async()=>{
  for(const expiry of ['4102444800',4102444800,'2100-01-01T00:00:00Z']) {
    const f=fixture(provider);f.credentials.expires_at=expiry;f.metadata.credentials.expires_at=expiry;
    const result=await readProviderQuota(f.binding,f.options);
    assert.equal(result.value.windows.find(w=>w.name==='7d').usedPercent,provider==='claude'?83:9);
  }
});
for(const id of [undefined,null,0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'2',''])test(`invalid account ID ${String(id)} makes no credential request`,async()=>{
  const f=fixture();f.binding.accountId=id;
  await assert.rejects(readProviderQuota(f.binding,f.options),/^Error: unavailable$/);assert.equal(f.calls.length,0);
});
const badAccounts={shadow:a=>a.is_shadow=true,parent:a=>a.parent_account_id=1,platform:a=>a.platform='anthropic',type:a=>a.type='agent',id:a=>a.id=3,
  PAT:a=>a.extra={auth_provider:'codex_personal_access_token'},agent:a=>a.credentials.auth_mode='agent_identity',proxy:a=>a.proxy_id=4};
for(const [name,change] of Object.entries(badAccounts))test(`refuses ${name} account before export`,async()=>{
  const f=fixture();change(f.metadata);await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);assert.equal(f.calls.length,2);
});
for(const expiry of ['unrecognized','',null,time/1000,(time-1)/1000])test(`invalid or expired token ${String(expiry)} is not sent`,async()=>{
  const f=fixture();f.credentials.expires_at=expiry;f.metadata.credentials.expires_at=expiry;
  await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);assert.equal(f.calls.length,3);
});
test('metadata/export subject, revision, missing and PAT tokens fail closed',async()=>{
  const changes=[f=>f.row.credentials.chatgpt_account_id='other',f=>f.row.name='other',f=>delete f.credentials.access_token,f=>f.credentials.access_token='at-PRIVATE',f=>f.binding.subjectSha256=hash('other')];
  for(const change of changes){const f=fixture();change(f);await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);assert.equal(f.calls.length,3);}
});
test('empty or broad export, step-up denial, redirects and oversized bodies cannot reach provider',async()=>{
  for(const response of [Response.json({data:{accounts:[]}}),Response.json({data:{accounts:[{},{}]}}),new Response('PRIVATE',{status:403}),new Response('',{status:302}),new Response('x'.repeat(524289))]) {
    const f=fixture(),base=f.options.fetchImpl;
    f.options.fetchImpl=(url,opts)=>String(url).includes('/accounts/data')?response:base(url,opts);
    await assert.rejects(readProviderQuota(f.binding,f.options),/^Error: unavailable$/);
    assert.equal(f.calls.some(c=>c.url.startsWith('https://chatgpt.com')),false);
  }
});
test('every redirect hop and provider error is refused with a secret-free error',async()=>{
  for(const hop of ['/auth/login','/accounts/2','/accounts/data','/wham/usage']) {
    const f=fixture(),base=f.options.fetchImpl;
    f.options.fetchImpl=(url,options)=>String(url).includes(hop)?new Response('PRIVATE',{status:302}):base(url,options);
    await assert.rejects(readProviderQuota(f.binding,f.options),/^Error: unavailable$/);
  }
  const f=fixture(),base=f.options.fetchImpl;
  f.options.fetchImpl=(url,opts)=>String(url).includes('/wham/usage')?Promise.reject(Error('PRIVATE_PROVIDER')):base(url,opts);
  await assert.rejects(readProviderQuota(f.binding,f.options),/^Error: unavailable$/);
});
test('public HTTP, origin drift and inherited proxies are rejected before login',async()=>{
  const changes=[f=>f.binding.baseUrl='http://public.example',f=>f.binding.gatewayOrigin='https://other.example',f=>f.binding.directEgress=false,f=>f.options.env={HTTPS_PROXY:'PRIVATE'}];
  for(const change of changes){const f=fixture();change(f);await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);assert.equal(f.calls.length,0);}
});
test('private HTTP requires the enrolled exact tailnet origin and resolved peer address',async()=>{
  const f=fixture();Object.assign(f.binding,{baseUrl:'http://gateway.example.ts.net:8080',gatewayOrigin:'http://gateway.example.ts.net:8080',tailnetAddress:exampleTailnetAddress});
  f.options.resolve=async()=>[{address:'203.0.113.1'}];await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);assert.equal(f.calls.length,0);
  f.options.resolve=async()=>[{address:exampleTailnetAddress},{address:'203.0.113.1'}];await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);assert.equal(f.calls.length,0);
  f.options.resolve=async()=>[{address:exampleTailnetAddress}];assert.equal((await readProviderQuota(f.binding,f.options)).value.windows[0].name,'7d');
});
test('concurrent metadata proxy or revision change discards the retrieved observation',async()=>{
  for(const field of ['proxy_id','updated_at']) {
    const f=fixture(),base=f.options.fetchImpl;let reads=0;
    f.options.fetchImpl=(url,opts)=>{if(new URL(url).pathname==='/api/v1/admin/accounts/2'&&++reads===2)f.metadata[field]=field==='proxy_id'?4:'revision-b';return base(url,opts);};
    await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);
  }
});
test('expired or missing windows never become fresh zero headroom',async()=>{
  const f=fixture();f.usage.rate_limit.primary_window.reset_at=time/1000;
  await assert.rejects(readProviderQuota(f.binding,f.options),/unavailable/);
  const g=fixture('claude');delete g.usage.five_hour;assert.deepEqual((await readProviderQuota(g.binding,g.options)).value.windows.map(w=>w.name),['7d']);
});

test('proxy reference in the export or token expiring immediately before provider request prevents credential use',async()=>{
  const proxy=fixture();proxy.row.proxy_key='synthetic-proxy';await assert.rejects(readProviderQuota(proxy.binding,proxy.options),/unavailable/);assert.equal(proxy.calls.length,3);
  const expiring=fixture();expiring.credentials.expires_at=(time+1000)/1000;expiring.metadata.credentials.expires_at=expiring.credentials.expires_at;
  let clock=0;expiring.options.now=()=>time+(clock++?1000:0);
  await assert.rejects(readProviderQuota(expiring.binding,expiring.options),/unavailable/);assert.equal(expiring.calls.length,3);
});
