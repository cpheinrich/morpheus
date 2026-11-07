import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { boundedJson } from './transport.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
// Stored observations remain available for explicitly passive enrollment.
export function storedQuota(account, binding) {
  if(binding.id !== `${binding.instanceId}-${binding.accountId}`) throw new Error('invalid-source');
  if (account.id !== binding.accountId || account.platform !== (binding.provider === 'codex' ? 'openai':'anthropic')) throw new Error('invalid-source');
  const x = account.extra ?? {};
  const fields = binding.provider === 'codex'
    ? [['5h',x.codex_5h_used_percent,x.codex_5h_reset_at],['7d',x.codex_7d_used_percent,x.codex_7d_reset_at]]
    : [['5h',x.passive_usage_5h_utilization,x.passive_usage_5h_reset],['7d',x.passive_usage_7d_utilization,x.passive_usage_7d_reset]];
  const rawStamp = binding.provider === 'codex' ? x.codex_usage_updated_at : x.passive_usage_sampled_at;
  const sourceObservedAt = typeof rawStamp === 'string' && Number.isFinite(Date.parse(rawStamp)) ? new Date(rawStamp).toISOString() : null;
  // sub2api passive Anthropic counters are fractions; active usage is percentages.
  // Unknown/out-of-range representations refuse instead of silently displaying 0.82% for 82%.
  const ceiling=binding.provider==='claude'?1:100;
  const windows = fields.filter(([,used]) => Number.isFinite(used) && used >= 0 && used <= ceiling).map(([name,used,reset]) => ({ name,usedPercent:used*(binding.provider==='claude'?100:1),
    resetsAt: reset == null ? null : new Date(typeof reset === 'number' ? reset*1000:reset).toISOString() }));
  if (!sourceObservedAt || !windows.length) throw new Error('unavailable');
  return { sourceObservedAt, value: {accountId:binding.id,provider:binding.provider,windows} };
}
export async function readStoredQuota(binding, { email, password, fetchImpl = fetch } = {}) {
  const base = new URL(binding.baseUrl);
  if (base.username || base.password || base.search || base.hash) throw new Error('invalid-source');
  const request = (path, options={}) => fetchImpl(new URL(path,base), {...options, signal:AbortSignal.timeout(10000)});
  const login = await request('/api/v1/auth/login', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  if (!login.ok) throw new Error('unavailable');
  const token = (await login.json())?.data?.access_token;
  if (typeof token !== 'string' || !token) throw new Error('unavailable');
  // Exact account lookup: no first-account selection, pagination or active refresh.
  const res = await request(`/api/v1/admin/accounts/${binding.accountId}`, { headers:{authorization:`Bearer ${token}`} });
  if(!res.ok) throw new Error('unavailable');
  return storedQuota((await res.json()).data,binding);
}

const providerUrls = {
  claude: 'https://api.anthropic.com/api/oauth/usage',
  codex: 'https://chatgpt.com/backend-api/wham/usage',
};
function expiryTime(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const numeric = Number(value);
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  return Date.parse(value);
}
function normalAccount(account, binding) {
  const platform = binding.provider === 'claude' ? 'anthropic' : 'openai';
  if (account?.id !== binding.accountId || account.platform !== platform || account.type !== 'oauth' ||
      account.is_shadow || account.parent_account_id || account.proxy_id) throw new Error('unavailable');
  const extra=account.extra??{};
  if (extra.auth_provider === 'codex_personal_access_token' || extra.import_source === 'codex_personal_access_token' ||
      account.credentials?.auth_mode === 'agent_identity') throw new Error('unavailable');
  return account;
}
function boundCredential(row, account, binding) {
  const credentials=row?.credentials;
  const subjectKey=binding.provider === 'claude'?'account_uuid':'chatgpt_account_id';
  const subject=credentials?.[subjectKey];
  if (row?.platform !== account.platform || row.type !== 'oauth' || row.name !== account.name ||
      typeof subject !== 'string' || !subject || subject !== account.credentials?.[subjectKey] ||
      digest(subject) !== binding.subjectSha256 || row.proxy_key) throw new Error('unavailable');
  // Compare every metadata field retained by the exact-ID DTO, not just a display name.
  for (const [key,value] of Object.entries(account.credentials??{})) {
    if (JSON.stringify(value)!==JSON.stringify(credentials[key])) throw new Error('unavailable');
  }
  return {token:credentials.access_token,subject,expiresAt:expiryTime(credentials.expires_at)};
}
function usableToken(credential, time) {
  if (typeof credential.token!=='string' || !credential.token || credential.token.startsWith('at-') ||
      !Number.isFinite(credential.expiresAt) || credential.expiresAt <= time) throw new Error('unavailable');
}
async function credentialsFor(binding, request, now) {
  const account=normalAccount((await request(`/api/v1/admin/accounts/${binding.accountId}`)).data,binding);
  const exported=(await request(`/api/v1/admin/accounts/data?ids=${binding.accountId}&include_proxies=true`)).data;
  if (!Array.isArray(exported?.accounts) || exported.accounts.length!==1) throw new Error('unavailable');
  if (!Array.isArray(exported.proxies) || exported.proxies.length!==0)throw new Error('unavailable');
  const credential=boundCredential(exported.accounts[0],account,binding);
  usableToken(credential,now());
  return {account,credential};
}
function tailnetAddress(ip) {
  const pieces=typeof ip==='string'?ip.split('.').map(Number):[];
  return pieces.length===4&&pieces[0]===100&&pieces[1]>=64&&pieces[1]<=127&&pieces.every(v=>Number.isInteger(v)&&v>=0&&v<=255);
}
function baseOrigin(binding) {
  const base=new URL(binding.baseUrl);
  if(base.origin!==binding.gatewayOrigin||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('unavailable');
  return base;
}
async function gatewayOrigin(binding, resolve) {
  if (!Number.isSafeInteger(binding.accountId) || binding.accountId<1 || binding.directEgress!==true) throw new Error('unavailable');
  const base=baseOrigin(binding);
  if (base.protocol==='https:')return base;
  const ip=binding.tailnetAddress;
  if (base.protocol!=='http:' || !base.hostname.endsWith('.ts.net') || !tailnetAddress(ip)) throw new Error('unavailable');
  const addresses=await resolve(base.hostname,{all:true});
  if (!addresses.length||!addresses.every(row=>row.address===ip))throw new Error('unavailable');
  return base;
}
function directEnvironment(env) {
  const proxyNames=['http_proxy','https_proxy','all_proxy','node_use_env_proxy','global_agent_http_proxy'];
  if (Object.entries(env).some(([key,value])=>value&&proxyNames.includes(key.toLowerCase()))) throw new Error('unavailable');
}
function providerWindows(provider, data, now) {
  const candidates = provider === 'claude'
    ? [['5h', data.five_hour?.utilization, data.five_hour?.resets_at], ['7d', data.seven_day?.utilization, data.seven_day?.resets_at]]
    : [data.rate_limit?.primary_window, data.rate_limit?.secondary_window].filter(Boolean).map(w =>
      [({18000:'5h',604800:'7d'})[w.limit_window_seconds], w.used_percent, w.reset_at * 1000]);
  const windows = new Map();
  for (const [name, usedPercent, reset] of candidates) {
    const time = typeof reset === 'number' ? reset : Date.parse(reset);
    if (!name || !Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100 || !Number.isFinite(time) || time <= now) continue;
    if (windows.has(name)) throw new Error('unavailable');
    windows.set(name, { name, usedPercent, resetsAt: new Date(time).toISOString() });
  }
  if (!windows.size) throw new Error('unavailable');
  return [...windows.values()];
}
export async function readProviderQuota(binding, { email, password, fetchImpl = fetch, now = Date.now, resolve = lookup, env = process.env } = {}) {
  try {
    if (binding.id !== `${binding.instanceId}-${binding.accountId}` || !/^[a-f0-9]{64}$/.test(binding.subjectSha256)) throw new Error('unavailable');
    directEnvironment(env);
    if (!providerUrls[binding.provider])throw new Error('unavailable');
    const base=await gatewayOrigin(binding,resolve);
    const perform = (url, options = {}) => fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const login = await boundedJson(await perform(new URL('/api/v1/auth/login', base), {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({email,password}),
    }));
    const adminToken = login.data?.access_token;
    if (typeof adminToken !== 'string' || !adminToken) throw new Error('unavailable');
    const request = async path => boundedJson(await perform(new URL(path, base), {method:'GET',headers:{authorization:`Bearer ${adminToken}`}}));
    const {account,credential} = await credentialsFor(binding, request, now);
    usableToken(credential,now());
    const headers = {authorization:`Bearer ${credential.token}`,accept:'application/json'};
    if (binding.provider === 'claude') headers['anthropic-beta'] = 'oauth-2025-04-20';
    else headers['ChatGPT-Account-Id'] = credential.subject;
    const data = await boundedJson(await perform(providerUrls[binding.provider], {method:'GET',headers}));
    const observed = now();
    // A second read detects concurrent owner changes. Enrollment is explicitly direct-only;
    // this observation does not lock or modify the owner's future proxy/account settings.
    const after=normalAccount((await request(`/api/v1/admin/accounts/${binding.accountId}`)).data,binding);
    if (JSON.stringify(after.credentials)!==JSON.stringify(account.credentials) || after.updated_at!==account.updated_at)throw new Error('unavailable');
    return { sourceObservedAt: new Date(observed).toISOString(), value: {accountId:binding.id,provider:binding.provider,
      usageSource:'provider-get',windows:providerWindows(binding.provider,data,observed)} };
  } catch { throw new Error('unavailable'); }
}
