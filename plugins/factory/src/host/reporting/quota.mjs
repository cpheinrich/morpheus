// Stored snapshots only. Never call the provider usage endpoint or operational quota reader.
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
