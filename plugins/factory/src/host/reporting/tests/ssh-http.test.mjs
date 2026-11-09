import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {sshArguments,sshHttpRequest,sshSocket} from '../ssh-http.mjs';
import {boundedJson} from '../transport.mjs';
const binding={ssh:{host:'example.test',user:'operator',gatewayPort:8080}};
test('SSH builder binds exact enrolled endpoint, loopback port and strict existing trust',()=>{
 const target=new URL('http://example.test:8080/auth');
 assert.deepEqual(sshArguments(target,binding),['-F','/dev/null','-T','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oUpdateHostKeys=no','-oConnectTimeout=10','-oProxyCommand=none','-oProxyJump=none','-oPermitLocalCommand=no','-W','127.0.0.1:8080','operator@example.test']);
 for(const ssh of [undefined,{...binding.ssh,host:'other.example.test'},{...binding.ssh,user:undefined},{...binding.ssh,user:'-oProxyCommand=private'},{...binding.ssh,gatewayPort:80},{...binding.ssh,gatewayPort:0},{...binding.ssh,gatewayPort:65536},{...binding.ssh,gatewayPort:8080.5}])assert.throws(()=>sshArguments(target,{ssh}),/^Error: unavailable$/);
 for(const url of ['https://example.test:8080','http://secret@example.test:8080'])assert.throws(()=>sshArguments(new URL(url),binding),/unavailable/);
});
async function fixture(t,handler){
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port,calls=[],enrolled={ssh:{...binding.ssh,gatewayPort:port}};
 const connect=(target,bound)=>sshSocket(target,bound,(bin,argv,opts)=>{
  calls.push({bin,argv,opts});return spawn(process.execPath,['-e',`const s=require('node:net').connect(${port},'127.0.0.1');process.stdin.pipe(s);s.pipe(process.stdout);s.on('end',()=>process.exit(0));`],opts);
 });
 return {url:`http://example.test:${port}`,enrolled,connect,calls};
}
test('composed HTTP uses SSH pipes with request secrets absent from argv and child environment',async t=>{
 const received=[];const f=await fixture(t,async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({host:req.headers.host,auth:req.headers.authorization,body});res.end('{"data":"synthetic-result"}');});
 const response=await sshHttpRequest(f.url+'/auth',{method:'POST',headers:{authorization:'synthetic-admin'},body:'synthetic-password'},f.enrolled,f.connect);
 assert.deepEqual(await boundedJson(response),{data:'synthetic-result'});assert.equal(f.calls[0].bin,'/usr/bin/ssh');assert.deepEqual(f.calls[0].argv,sshArguments(new URL(f.url),f.enrolled));
 assert.equal(Object.keys(f.calls[0].opts.env).every(k=>['HOME','PATH','SSH_AUTH_SOCK'].includes(k)),true);assert.equal(f.calls[0].opts.stdio[2],'ignore');
 assert.deepEqual(received,[{host:new URL(f.url).host,auth:'synthetic-admin',body:'synthetic-password'}]);assert.equal(JSON.stringify(f.calls).includes('synthetic-admin'),false);assert.equal(JSON.stringify(f.calls).includes('synthetic-password'),false);
});
test('SSH failure refuses the request with no plaintext or OS socket fallback',async()=>{
 let calls=0;const connect=(target,bound)=>sshSocket(target,bound,(_bin,_argv,opts)=>{calls++;return spawn(process.execPath,['-e','process.exit(255)'],opts);});
 await assert.rejects(sshHttpRequest('http://example.test:8080/auth',{method:'POST',body:'synthetic-secret'},binding,connect),/^Error: unavailable$/);assert.equal(calls,1);
});
test('composed SSH HTTP refuses redirects, compressed and oversized response bodies',async t=>{
 let calls=0;const f=await fixture(t,(req,res)=>{calls++;if(req.url==='/redirect'){res.writeHead(302,{location:'https://foreign.invalid'});res.end();}else if(req.url==='/compressed'){res.writeHead(200,{'content-encoding':'gzip'});res.end('synthetic');}else res.end(JSON.stringify({data:'x'.repeat(64)}));});
 const redirect=await sshHttpRequest(f.url+'/redirect',{method:'GET'},f.enrolled,f.connect);await assert.rejects(boundedJson(redirect),/unavailable/);await redirect.body.cancel();
 await assert.rejects(sshHttpRequest(f.url+'/compressed',{method:'GET'},f.enrolled,f.connect),/unavailable/);
 await assert.rejects(boundedJson(await sshHttpRequest(f.url+'/large',{method:'GET'},f.enrolled,f.connect),16),/unavailable/);assert.equal(calls,3);
});

test('actual SSH effective configuration ignores ambient endpoint, host-key, proxy and multiplexing overrides',async t=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {execFileSync}=await import('node:child_process');
 const dir=await mkdtemp(join(tmpdir(),'ssh-report-config-'));t.after(()=>rm(dir,{recursive:true,force:true}));const config=join(dir,'config');
 await writeFile(config,'Host example.test\n HostName other.example.test\n Port 2222\n HostKeyAlias other.example.test\n ControlMaster auto\n ControlPath '+join(dir,'mux')+'\n ProxyCommand /usr/bin/false\n ProxyJump other.example.test\n PermitLocalCommand yes\n LocalCommand /usr/bin/false\n');
 const args=sshArguments(new URL('http://example.test:8080'),{ssh:{host:'example.test',user:'operator',gatewayPort:8080}});
 const effective=argv=>Object.fromEntries(execFileSync('/usr/bin/ssh',['-G','-F',config,...argv],{encoding:'utf8',env:{HOME:process.env.HOME,PATH:process.env.PATH}}).trim().split('\n').map(line=>{const at=line.indexOf(' ');return [line.slice(0,at),line.slice(at+1)];}));
 const unsafe=effective(args.slice(2));assert.equal(unsafe.hostname,'other.example.test');assert.equal(unsafe.port,'2222');assert.equal(unsafe.hostkeyalias,'other.example.test');assert.equal(unsafe.controlmaster,'auto');
 const safe=effective(args);assert.equal(safe.hostname,'example.test');assert.equal(safe.user,'operator');assert.equal(safe.port,'22');assert.equal(safe.stricthostkeychecking,'true');assert.equal(safe.updatehostkeys,'false');assert.equal(safe.controlmaster,'false');assert.equal(safe.controlpath,undefined);assert.equal(safe.hostkeyalias,undefined);assert.equal(safe.proxycommand,undefined);assert.equal(safe.proxyjump,undefined);assert.equal(safe.permitlocalcommand,'no');assert.equal(safe.localcommand,undefined);assert.match(safe.userknownhostsfile,/\.ssh\/known_hosts/);
});
