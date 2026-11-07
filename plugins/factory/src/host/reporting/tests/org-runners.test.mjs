import {test} from 'node:test';
import assert from 'node:assert/strict';
import {organizationRunners} from '../org-runners.mjs';
const entries=[{organization:'example',runnerId:18,projectIds:['example/a']},{organization:'example',runnerId:18,projectIds:['example/b']}];
const at='2026-11-07T08:00:00.000Z';
const options={env:{ORG_READ:'synthetic-token',GH_TOKEN:'untouched'},now:()=>new Date(at)};
const response=body=>new Response(JSON.stringify(body));
test('optional missing dedicated credential performs no API call and retains exact identity gaps',async()=>{
 let calls=0;const value=await organizationRunners(entries,'MISSING',{...options,fetchImpl:async()=>{calls++;}});
 assert.equal(calls,0);assert.deepEqual(value,[{organization:'example',runnerId:18,projectIds:['example/a','example/b'],observedAt:at,readable:false,online:null,busy:null,labels:[],gap:'credential-missing'}]);assert.equal(options.env.GH_TOKEN,'untouched');
});
test('deduplicates eligible projects and performs only exact enrolled read with a separate credential',async()=>{
 const calls=[];const value=await organizationRunners(entries,'ORG_READ',{...options,fetchImpl:async(url,init)=>{calls.push({url,init});return response({id:18,status:'online',busy:true,labels:[{name:'phone'}]});}});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.github.com/orgs/example/actions/runners/18');assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.headers.authorization,'Bearer synthetic-token');
 assert.deepEqual(value[0],{organization:'example',runnerId:18,projectIds:['example/a','example/b'],observedAt:at,readable:true,online:true,busy:true,labels:['phone'],gap:null});assert.equal(options.env.GH_TOKEN,'untouched');
});
test('invalid enrollment and exhausted shared budget cannot issue any request',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;};
 for(const entry of [null,{...entries[0],runnerId:0},{...entries[0],runnerId:1.5},{...entries[0],organization:'example/foreign'},{...entries[0],projectIds:['other/private']},{...entries[0],projectIds:[null]}])await assert.rejects(organizationRunners([entry],'ORG_READ',{...options,fetchImpl}));
 for(const extra of [{deadline:0},{canRead:()=>false}])assert.equal((await organizationRunners(entries,'ORG_READ',{...options,fetchImpl,...extra}))[0].gap,'unavailable');assert.equal(calls,0);
});
test('denial, redirects, wrong identity, malformed status and oversized body preserve unknown server values',async()=>{
 const failed=[()=>new Response('private',{status:403}),()=>new Response('',{status:401}),()=>new Response('',{status:404}),()=>new Response('',{status:302}),()=>response({id:19,status:'online',busy:false,labels:[]}),()=>response({id:18,status:'unknown',busy:false,labels:[]}),()=>response({id:18,status:'online',busy:null,labels:[]}),()=>response({id:18,status:'online',busy:true,labels:[{name:null}]}),()=>response({padding:'x'.repeat(65536)}),()=>{throw Error('synthetic-token');}];
 for(const fail of failed){const [row]=await organizationRunners(entries,'ORG_READ',{...options,fetchImpl:async()=>fail()});assert.equal(row.readable,false);assert.equal(row.online,null);assert.equal(row.busy,null);assert.equal(row.gap,'unavailable');assert.equal(JSON.stringify(row).includes('synthetic-token'),false);}
});
test('merged project eligibility stays within the wire cap before any HTTP request',async()=>{
 const first={organization:'example',runnerId:18,projectIds:Array.from({length:16},(_,i)=>'example/p'+i)};
 let calls=0;await assert.rejects(organizationRunners([first,{...first,projectIds:['example/extra']}],'ORG_READ',{...options,fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
});
