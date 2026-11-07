import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {pinnedHttpRequest,verifyTailnetPeer} from '../tailnet-http.mjs';
import {boundedJson} from '../transport.mjs';
test('actual HTTP socket uses the pinned address, preserves Host and never follows redirect',async t=>{
 const seen=[];const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;seen.push({host:req.headers.host,auth:req.headers.authorization,body});res.writeHead(302,{location:'http://other.invalid/'});res.end('{}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port;let target;
 const transport=(options,callback)=>{target=options;return request(options,callback);};
 const response=await pinnedHttpRequest(`http://unresolvable.example.ts.net:${port}/api/v1/auth/login`,{method:'POST',headers:{authorization:'synthetic-admin'},body:'synthetic-password'},'127.0.0.1',transport);
 await assert.rejects(boundedJson(response),/unavailable/);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.agent,false);
 assert.deepEqual(seen,[{host:`unresolvable.example.ts.net:${port}`,auth:'synthetic-admin',body:'synthetic-password'}]);
});
test('wrong connected peer sends no authenticated HTTP bytes',async()=>{
 let ended=false,destroyed=false;const {EventEmitter}=await import('node:events');
 const transport=()=>{const req=new EventEmitter();req.end=()=>{ended=true;};req.destroy=()=>{destroyed=true;req.emit('error',Error('PRIVATE'));};queueMicrotask(()=>{const socket=new EventEmitter();socket.remoteAddress='203.0.113.1';req.emit('socket',socket);socket.emit('connect');});return req;};
 await assert.rejects(pinnedHttpRequest('http://gateway.example.ts.net/auth',{method:'POST',body:'PRIVATE'},[100,64,0,1].join('.'),transport),/^Error: unavailable$/);
 assert.equal(ended,false);assert.equal(destroyed,true);
});
test('peer status must bind online tailnet identity and exact address before credentials',async()=>{
 const base=new URL('http://gateway.example.ts.net'),address=[100,64,0,1].join('.');
 const status={BackendState:'Running',Self:{},Peer:{a:{Online:true,DNSName:'gateway.example.ts.net.',TailscaleIPs:[address]}}};
 const run=async()=>({stdout:JSON.stringify(status)});await verifyTailnetPeer(base,address,run);
 const peer=structuredClone(status.Peer.a);
 for(const change of [{Online:false},{DNSName:'other.example.ts.net.'},{TailscaleIPs:['203.0.113.1']}]){status.Peer.a={...peer,...change};await assert.rejects(verifyTailnetPeer(base,address,run),/unavailable/);}
 status.Peer.a=peer;status.BackendState='Stopped';await assert.rejects(verifyTailnetPeer(base,address,run),/unavailable/);
});
