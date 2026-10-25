// Uses Firebase's documented callable wire protocol; caller owns ID-token refresh.
const names = { enqueue: 'Enqueue', read: 'Read', pending: 'Pending', inspect: 'Inspect', claim: 'Claim', beginApply: 'BeginApply', complete: 'Complete' } as const;
export function callableClient(baseUrl: string, token: () => Promise<string>, fetchImpl = fetch) {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || !(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))) throw new Error('Callable endpoint requires HTTPS or loopback without credentials');
  return async (method: keyof typeof names, data: unknown = {}) => {
    if (!Object.hasOwn(names, method)) throw new Error('Unknown HQ callable');
    const response = await fetchImpl(`${base.href.replace(/\/$/, '')}/hq${names[method]}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await token()}` }, body: JSON.stringify({ data }),
    });
    if (!response.ok) throw new Error(`HQ callable ${method} HTTP ${response.status}; retain operation ID`);
    const body = await response.json() as any;
    if (body.error || !Object.hasOwn(body, 'result')) throw new Error('HQ callable response failed; retain operation ID');
    return body.result;
  };
}
