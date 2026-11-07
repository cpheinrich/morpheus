import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, dirname, join } from 'node:path';
export async function jsonFile(path, { private: ownerOnly = false, limit = 65536 } = {}) {
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > limit) throw new Error('invalid-source');
  if (ownerOnly && (s.uid !== process.getuid() || (s.mode & 0o077))) throw new Error('invalid-source');
  return { data: JSON.parse(await readFile(path, 'utf8')), at: s.mtime.toISOString() };
}
export async function privateConfig(path) {
  if (!isAbsolute(path)) throw new Error('invalid-configuration');
  await outsideGit(dirname(path));
  return (await jsonFile(path, { private: true })).data;
}
export async function outsideGit(path) {
  let existing=path;
  for(;;) {
    try {await lstat(existing);break;}catch(e){if(e.code!=='ENOENT')throw e;existing=dirname(existing);}
  }
  for(let p=await realpath(existing);;p=dirname(p)) {
    try {await lstat(join(p,'.git'));throw new Error('installation-must-be-outside-git');}
    catch(e) {if(e.code!=='ENOENT')throw e;}
    if(dirname(p)===p)return;
  }
}
export async function directories(path, max = 2048) {
  const list = await readdir(path, { withFileTypes: true });
  if (list.length > max || list.some(x => x.isSymbolicLink())) throw new Error('incomplete');
  return list.filter(x => x.isDirectory()).map(x => x.name).sort();
}
export async function canonicalRoots(roots) {
  return [...new Set(await Promise.all(roots.map(p => realpath(p))))];
}
