import {describe, it, expect, vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync, mkdtempSync, writeFileSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {validateRun, collectScreens, gallery, prepare, publish} = createRequire(import.meta.url)('../.github/scripts/ios-visual-qa.cjs');
const run = {id:42, run_attempt:1, run_number:9, head_sha:'a'.repeat(40), head_branch:'main', event:'schedule', path:'.github/workflows/ios-nightly-build.yml', status:'completed', conclusion:'success', updated_at:'2026-09-09T00:00:00Z', repository:{full_name:'owner/app'}, head_repository:{full_name:'owner/app'}};
const inventory = {version:1, screens:[{id:'today', title:'Today <&>', attachment:'qa-today'}, {id:'profile',title:'Profile',attachment:'qa-profile'}]};
function fixture() {
  const root = mkdtempSync(join(tmpdir(),'ios-qa-'));
  const bytes = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.writeUInt32BE(1206,16); bytes.writeUInt32BE(2622,20);
  writeFileSync(join(root,'capture.png'),bytes);
  writeFileSync(join(root,'manifest.json'),JSON.stringify([{attachments:[{suggestedHumanReadableName:'qa-today_0_UUID.png',exportedFileName:'capture.png',timestamp:1,deviceName:'iPhone'}]}]));
  return root;
}
describe('nightly iOS visual QA',()=>{
  it('accepts only completed same-repository main nightly runs',()=>{
    expect(()=>validateRun(run,'owner/app','ios-nightly-build.yml')).not.toThrow();
    for(const patch of [{event:'pull_request'},{head_branch:'feature'},{status:'in_progress'},{path:'.github/workflows/ci.yml'},{head_repository:{full_name:'fork/app'}},{head_sha:'main'}])
      expect(()=>validateRun({...run,...patch},'owner/app','ios-nightly-build.yml')).toThrow();
  });
  it('selects explicitly named full-screen attachments and labels missing screens',()=>{
    const root=fixture();try {const screens=collectScreens(inventory,root);expect(screens[0].bytes.length).toBe(24);expect(screens[1].missing).toBe(true);}finally{rmSync(root,{recursive:true});}
  });
  it('rejects unsafe file paths and duplicate inventory IDs',()=>{
    const root=fixture();try {
      writeFileSync(join(root,'manifest.json'),JSON.stringify([{attachments:[{suggestedHumanReadableName:'qa-today_0_UUID.png',exportedFileName:'../capture.png'}]}]));
      expect(()=>collectScreens(inventory,root)).toThrow('Unsafe');
      expect(()=>collectScreens({...inventory,screens:[inventory.screens[0],inventory.screens[0]]},root)).toThrow();
    }finally{rmSync(root,{recursive:true});}
  });
  it('rejects symlinks and non-screen PNGs',()=>{
    const root=fixture();try{
      rmSync(join(root,'capture.png'));symlinkSync('/etc/hosts',join(root,'capture.png'));expect(()=>collectScreens(inventory,root)).toThrow('Symlink');
      rmSync(join(root,'capture.png'));writeFileSync(join(root,'capture.png'),'not a PNG');expect(()=>collectScreens(inventory,root)).toThrow('PNG');
    }finally{rmSync(root,{recursive:true});}
  });
  it('renders two columns, immutable image URLs, escaping, and explicit missing status',()=>{
    const root=fixture();try{
      const body=gallery(collectScreens(inventory,root),'owner/app','b'.repeat(40),run);
      expect(body.match(/<tr>/g)).toHaveLength(1);expect(body.match(/<td width="50%">/g)).toHaveLength(2);
      expect(body).toContain('Today &lt;&amp;&gt;');expect(body).toContain('/blob/'+ 'b'.repeat(40));expect(body).toContain('1/2');expect(body).toContain('Not captured in this run');
    }finally{rmSync(root,{recursive:true});}
  });
  it.each([false,true])('creates or updates one draft PR (existing=%s)',async(existing)=>{
    const root=fixture();writeFileSync(join(root,'source.json'),JSON.stringify({run,inventory}));
    const called:any[]=[]; const response=(name:string,data:any)=>vi.fn(async(args:any)=>{called.push([name,args]);return {data};});
    const github:any={paginate:vi.fn(async()=>existing?[{number:3,node_id:'PR',draft:true,body:'<!-- morpheus-ios-visual-qa -->',auto_merge:null}]:[]),rest:{pulls:{list:()=>{},create:response('create',{html_url:'url'}),update:response('update',{html_url:'url'})},git:{getRef:vi.fn(async({ref}:any)=>{if(ref==='heads/main')return {data:{object:{sha:'base'}}};if(!existing)throw {status:404};return {data:{object:{sha:'old'}}};}),getCommit:vi.fn(async()=>({data:{tree:{sha:'base-tree'},message:'Refresh nightly iOS visual QA (old)'}})),createBlob:response('blob',{sha:'blob'}),createTree:response('tree',{sha:'tree'}),createCommit:response('commit',{sha:'new'}),createRef:response('createRef',{}),updateRef:response('updateRef',{})}},graphql:vi.fn()};
    const core:any={setOutput:vi.fn(),summary:{addLink(){return this;},addRaw(){return this;},write:vi.fn()}};
    try{
      await publish({github,context:{repo:{owner:'owner',repo:'app'}},core,outputDirectory:root,attachmentDirectory:root});
      expect(called.find(([n])=>n==='commit')[1].parents).toEqual(['base']);
      expect(called.filter(([n])=>n==='blob')).toHaveLength(1);
      expect(called.find(([n])=>n===(existing?'update':'create'))[1].body).toContain('Not captured in this run');
      if(!existing)expect(called.find(([n])=>n==='create')[1].draft).toBe(true);
      expect(called.find(([n])=>n==='tree')[1].tree.map((x:any)=>x.path)).toEqual(['qa/nightly-ios/today.png','qa/nightly-ios/capture.json']);
    }finally{rmSync(root,{recursive:true});}
  });
  it('does not replace newer runs or overwrite unrelated PRs',async()=>{
    const root=fixture();writeFileSync(join(root,'source.json'),JSON.stringify({run,inventory}));
    const github:any={paginate:vi.fn(async()=>[{body:'<!-- morpheus-ios-visual-qa -->\n<!-- run:43:1 number:10 -->'}]),rest:{pulls:{list:()=>{}}}};
    const core={notice:vi.fn()};try{
      await publish({github,context:{repo:{owner:'owner',repo:'app'}},core,outputDirectory:root,attachmentDirectory:root});expect(core.notice).toHaveBeenCalled();
      github.paginate.mockResolvedValue([{body:'human work'}]);await expect(publish({github,context:{repo:{owner:'owner',repo:'app'}},core,outputDirectory:root,attachmentDirectory:root})).rejects.toThrow('unrelated');
    }finally{rmSync(root,{recursive:true});}
  });
});

// A scheduled recovery no-op must not erase a complete gallery with 0/N images.
describe('intentional nightly no-op', () => {
  it('wires the skip signal into the publisher workflow', () => {
    expect(readFileSync(new URL('../.github/workflows/ios-visual-qa.yml', import.meta.url), 'utf8')).toContain("if: steps.source.outputs.skip-publish != 'true'");
  });
  it.each([true, false])('skips only a successful no-op (success=%s)', async success => {
    const root = fixture();
    const getContent = vi.fn(async () => ({data: {content: Buffer.from(JSON.stringify(inventory)).toString('base64')}}));
    const github = {rest: {actions: {getWorkflowRun: vi.fn(async () => ({data: {...run, conclusion: success ? 'success' : 'failure'}})), listWorkflowRunArtifacts: vi.fn()}, repos: {getContent}},
      paginate: vi.fn(async () => [{name:'ios-nightly-noop-42-1', expired:false}])};
    const core = {setOutput:vi.fn(), notice:vi.fn()};
    try {
      await prepare({github, context:{repo:{owner:'owner',repo:'app'}}, core, runId:'42', workflow:'ios-nightly-build.yml', manifestPath:'qa/ios-screens.json', outputDirectory:root});
      if (success) {expect(core.setOutput).toHaveBeenCalledWith('skip-publish','true'); expect(getContent).not.toHaveBeenCalled();}
      else {expect(core.setOutput).not.toHaveBeenCalledWith('skip-publish','true'); expect(getContent).toHaveBeenCalled();}
    } finally {rmSync(root,{recursive:true});}
  });
});
