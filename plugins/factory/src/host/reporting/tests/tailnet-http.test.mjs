import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {pinnedHttpRequest,verifyTailnetPeer,tailnetSocket} from '../tailnet-http.mjs';
import {boundedJson} from '../transport.mjs';
test('composed HTTP uses the nc pipes with no credential arguments or inherited secret environment',async t=>{
 const {spawn}=await import('node:child_process');
 const seen=[];const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;seen.push({host:req.headers.host,auth:req.headers.authorization,body});res.end('{"data":"synthetic-result"}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port,args=[];
 const connect=(address,targetPort)=>tailnetSocket(address,targetPort,(bin,argv,opts)=>{
  args.push({bin,argv,opts});return spawn(process.execPath,['-e',`const s=require('node:net').connect(${port},'127.0.0.1');process.stdin.pipe(s);s.pipe(process.stdout);s.on('end',()=>process.exit(0));`],opts);
 });
 const response=await pinnedHttpRequest(`http://gateway.example.ts.net:${port}/auth`,{method:'POST',headers:{authorization:'synthetic-admin'},body:'synthetic-password'},'synthetic-peer',connect);
 assert.deepEqual(await boundedJson(response),{data:'synthetic-result'});assert.deepEqual(args[0].argv,['nc','synthetic-peer',String(port)]);assert.equal(Object.keys(args[0].opts.env).every(k=>['HOME','PATH','TAILSCALE_BE_CLI'].includes(k)),true);assert.equal(args[0].opts.env.TAILSCALE_BE_CLI,'1');assert.equal(args[0].opts.stdio[2],'ignore');
 assert.deepEqual(seen,[{host:`gateway.example.ts.net:${port}`,auth:'synthetic-admin',body:'synthetic-password'}]);assert.equal(JSON.stringify(args).includes('synthetic-password'),false);assert.equal(JSON.stringify(args).includes('synthetic-admin'),false);
});
test('conduit failure refuses the request and never falls back to an OS-routed socket',async()=>{
 const {Duplex}=await import('node:stream');let calls=0;
 const connect=()=>{calls++;const socket=new Duplex({read(){},write(_c,_e,callback){callback(Error('PRIVATE'));}});return socket;};
 await assert.rejects(pinnedHttpRequest('http://unresolvable.invalid/auth',{method:'POST',body:'PRIVATE'},'synthetic-peer',connect),/^Error: unavailable$/);assert.equal(calls,1);
});
test('peer status must bind online tailnet identity and exact address before credentials',async()=>{
 const base=new URL('http://gateway.example.ts.net'),address=[100,64,0,1].join('.');
 const status={BackendState:'Running',Self:{},Peer:{a:{Online:true,DNSName:'gateway.example.ts.net.',TailscaleIPs:[address]}}};
 const run=async()=>({stdout:JSON.stringify(status)});await verifyTailnetPeer(base,address,run);
 const peer=structuredClone(status.Peer.a);
 for(const change of [{Online:false},{DNSName:'other.example.ts.net.'},{TailscaleIPs:['203.0.113.1']}]){status.Peer.a={...peer,...change};await assert.rejects(verifyTailnetPeer(base,address,run),/unavailable/);}
 status.Peer.a=peer;status.BackendState='Stopped';await assert.rejects(verifyTailnetPeer(base,address,run),/unavailable/);
});
test('a gateway redirect is refused without following or forwarding credentials',async t=>{
 const {spawn}=await import('node:child_process');let calls=0;
 const server=createServer((_req,res)=>{calls++;res.writeHead(302,{location:'https://foreign.invalid/private'});res.end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const port=server.address().port;
 const connect=(address,targetPort)=>tailnetSocket(address,targetPort,(_bin,_argv,opts)=>spawn(process.execPath,['-e',`const s=require('node:net').connect(${port},'127.0.0.1');process.stdin.pipe(s);s.pipe(process.stdout);s.on('end',()=>process.exit(0));`],opts));
 const response=await pinnedHttpRequest(`http://gateway.example.ts.net:${port}/auth`,{method:'GET',headers:{authorization:'synthetic-admin'}},'synthetic-peer',connect);await assert.rejects(boundedJson(response),/unavailable/);await response.body.cancel();assert.equal(calls,1);
});
