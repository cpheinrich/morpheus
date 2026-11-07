import { cp, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { privateConfig, outsideGit } from './files.mjs';
import { configSchema } from './reporter.mjs';
const exec = promisify(execFile);
const xml = s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function installationPaths(options) {
  const paths=[options.destination,options.configPath,options.agentDir,options.nodePath];
  if(options.credentialWrapper)paths.push(options.credentialWrapper);
  return paths.every(p=>typeof p==='string'&&isAbsolute(p));
}
export function plist({label,nodePath,destination,configPath,credentialWrapper}) {
  const args=[...(credentialWrapper ? [credentialWrapper,'run','--']:[]),nodePath,join(destination,'reporting/reporter.mjs'),'--config',configPath];
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${xml(label)}</string><key>ProgramArguments</key><array>${args.map(s=>`<string>${xml(s)}</string>`).join('')}</array><key>RunAtLoad</key><true/><key>StartInterval</key><integer>60</integer><key>ProcessType</key><string>Background</string></dict></plist>\n`;
}
export async function installReporter(options,{run=exec}={}) {
  const {destination,configPath,agentDir,nodePath,credentialWrapper,label,dryRun=true,rollback=false}=options;
  if(!/^[\w.-]{1,150}$/.test(label) || !installationPaths(options)) throw new Error('invalid-installation');
  configSchema.parse(await privateConfig(configPath));
  await outsideGit(destination);await outsideGit(dirname(configPath));
  const target=join(agentDir,label+'.plist'),backup=target+'.previous';
  const document=rollback ? await readFile(backup,'utf8') : plist(options);
  if(dryRun) return {label,plist:document,rollback};
  try { await run('/bin/launchctl',['print',`gui/${process.getuid()}/${label}`]); throw new Error('unload-reporter-before-replacing'); }
  catch(e) { if(e.code!==113) throw e; }
  if(!rollback) {
    // Destination is versioned and exclusive; never replace a running package or delete old code.
    await mkdir(destination,{mode:0o700});
    const root=dirname(dirname(fileURLToPath(import.meta.url)));
    for(const name of ['reporting','package.json','pnpm-lock.yaml','pnpm-workspace.yaml']) await cp(join(root,name),join(destination,name),{recursive:true});
    await run('pnpm',['install','--frozen-lockfile','--prod','--ignore-scripts'],{cwd:destination});
    await run(nodePath,['--input-type=module','-e',`await import(${JSON.stringify(pathToFileURL(join(destination,'reporting/reporter.mjs')).href)})`],{cwd:destination});
    try { await writeFile(backup,await readFile(target),{mode:0o600}); } catch(e) {if(e.code!=='ENOENT')throw e;}
  }
  await mkdir(agentDir,{recursive:true,mode:0o700});
  await writeFile(target+'.new',document,{mode:0o600});await rename(target+'.new',target);
  // Loading starts reporting and remains an explicit operator action after reviewed rollout.
  return {label,plistPath:target,loaded:false};
}
async function main() {
  try {
    const {values:v}=parseArgs({options:{destination:{type:'string'},config:{type:'string'},'agent-dir':{type:'string'},node:{type:'string'},'credential-wrapper':{type:'string'},label:{type:'string'},apply:{type:'boolean'},rollback:{type:'boolean'}}});
    const result=await installReporter({destination:v.destination,configPath:v.config,agentDir:v['agent-dir'],nodePath:v.node??process.execPath,credentialWrapper:v['credential-wrapper'],label:v.label,dryRun:!v.apply,rollback:v.rollback});
    // Never echo configuration contents; dry-run plist contains only paths and credential names.
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch {process.stderr.write('Reporter installation refused; inspect private configuration and service state.\n');process.exitCode=1;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
