import {request as httpRequest} from 'node:http';
import {Readable} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function verifyTailnetPeer(base,address,run=exec) {
  const {stdout}=await run(process.platform==='darwin'?'/Applications/Tailscale.app/Contents/MacOS/Tailscale':'tailscale',['status','--json'],{timeout:3000,maxBuffer:1048576});
  const status=JSON.parse(stdout),peers=[status.Self,...Object.values(status.Peer??{})];
  if(status.BackendState!=='Running'||!peers.some(peer=>peer?.Online===true&&
    peer.DNSName?.replace(/\.$/,'')===base.hostname&&peer.TailscaleIPs?.includes(address)))throw new Error('unavailable');
}
// The authenticated body/headers are flushed only after the actual socket reaches the pinned IP.
export function pinnedHttpRequest(url,options,address,request=httpRequest) {
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    const req=request({hostname:address,family:4,port:target.port||80,path:target.pathname+target.search,
      method:options.method,agent:false,signal:AbortSignal.timeout(15000),
      headers:{...options.headers,host:target.host,'accept-encoding':'identity'}},res=>{
      if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){
        res.destroy();reject(new Error('unavailable'));return;
      }
      try{resolve(new Response(Readable.toWeb(res),{status:res.statusCode,headers:res.headers}));}
      catch{res.destroy();reject(new Error('unavailable'));}
    });
    req.on('error',()=>reject(new Error('unavailable')));
    req.on('socket',socket=>socket.once('connect',()=>{
      if(socket.remoteAddress?.replace(/^::ffff:/,'')!==address){req.destroy(new Error('unavailable'));return;}
      req.end(options.body);
    }));
  });
}
