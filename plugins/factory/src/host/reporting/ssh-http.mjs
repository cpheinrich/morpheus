import {Agent,request as httpRequest} from 'node:http';
import {Duplex,Readable} from 'node:stream';
import {spawn} from 'node:child_process';
const childEnvironment=()=>Object.fromEntries(['HOME','PATH','SSH_AUTH_SOCK'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
export function sshArguments(target,binding) {
  const enrolled=binding.ssh;
  if(target.protocol!=='http:'||target.username||target.password||!enrolled||
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(enrolled.host)||target.hostname!==enrolled.host||
    typeof enrolled.user!=='string'||!/^[a-z_][a-z0-9_-]{0,31}$/.test(enrolled.user)||!Number.isSafeInteger(enrolled.gatewayPort)||
    enrolled.gatewayPort<1||enrolled.gatewayPort>65535||Number(target.port||80)!==enrolled.gatewayPort)throw new Error('unavailable');
  return ['-F','/dev/null','-T','-oBatchMode=yes','-oStrictHostKeyChecking=yes','-oConnectTimeout=10',
    '-oProxyCommand=none','-oProxyJump=none','-oPermitLocalCommand=no',
    '-W',`127.0.0.1:${enrolled.gatewayPort}`,`${enrolled.user}@${enrolled.host}`];
}
// Host-key authentication binds encryption to the enrolled SSH endpoint. Only loopback is forwarded.
// HTTP credentials travel in pipes after the SSH handshake, never in argv or inherited secrets.
export function sshSocket(target,binding,spawnImpl=spawn) {
  const child=spawnImpl('/usr/bin/ssh',sshArguments(target,binding),{stdio:['pipe','pipe','ignore'],env:childEnvironment()});
  const socket=Duplex.from({writable:child.stdin,readable:child.stdout});
  child.once('error',()=>socket.destroy(new Error('unavailable')));
  child.once('close',code=>{if(code!==0)socket.destroy(new Error('unavailable'));});
  socket.once('close',()=>child.kill());
  socket.on('error',()=>{});
  return socket;
}
export function sshHttpRequest(url,options,binding,connect=sshSocket) {
  return new Promise((resolve,reject)=>{
    const target=new URL(url),agent=new Agent({keepAlive:false});
    agent.createConnection=()=>connect(target,binding);
    const req=httpRequest({hostname:target.hostname,port:target.port||80,path:target.pathname+target.search,
      method:options.method,agent,signal:AbortSignal.timeout(15000),
      headers:{...options.headers,host:target.host,'accept-encoding':'identity',connection:'close'}},res=>{
      res.once('end',()=>agent.destroy());
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){
        res.destroy();agent.destroy();reject(new Error('unavailable'));return;
      }
      try{resolve(new Response(Readable.toWeb(res),{status:res.statusCode,headers:res.headers}));}
      catch{res.destroy();agent.destroy();reject(new Error('unavailable'));}
    });
    req.on('error',()=>{agent.destroy();reject(new Error('unavailable'));});
    req.end(options.body);
  });
}
