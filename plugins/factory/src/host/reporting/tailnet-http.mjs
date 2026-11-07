import {Agent,request as httpRequest} from 'node:http';
import {Duplex,Readable} from 'node:stream';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const binary=()=>process.platform==='darwin'?'/Applications/Tailscale.app/Contents/MacOS/Tailscale':'tailscale';
const childEnvironment=()=>({...Object.fromEntries(['HOME','PATH'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]])),TAILSCALE_BE_CLI:'1'});
export async function verifyTailnetPeer(base,address,run=exec) {
  const {stdout}=await run(binary(),['status','--json'],{timeout:3000,maxBuffer:1048576,env:childEnvironment()});
  const status=JSON.parse(stdout),peers=[status.Self,...Object.values(status.Peer??{})];
  if(status.BackendState!=='Running'||!peers.some(peer=>peer?.Online===true&&
    peer.DNSName?.replace(/\.$/,'')===base.hostname&&peer.TailscaleIPs?.includes(address)))throw new Error('unavailable');
}
// nc uses the daemon's DialTCP, so the connection itself is carried by Tailscale.
// Authentication bytes travel only through the child's pipes, never argv or inherited secrets.
export function tailnetSocket(address,port,spawnImpl=spawn) {
  const child=spawnImpl(binary(),['nc',address,String(port)],{stdio:['pipe','pipe','ignore'],env:childEnvironment()});
  const socket=Duplex.from({writable:child.stdin,readable:child.stdout});
  child.once('error',()=>socket.destroy(new Error('unavailable')));
  child.once('close',code=>{if(code!==0)socket.destroy(new Error('unavailable'));});
  socket.once('close',()=>child.kill());
  socket.on('error',()=>{});
  return socket;
}
export function pinnedHttpRequest(url,options,address,connect=tailnetSocket) {
  return new Promise((resolve,reject)=>{
    const target=new URL(url),agent=new Agent({keepAlive:false});
    agent.createConnection=()=>connect(address,target.port||80);
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
