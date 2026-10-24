// A deliberately small Paperclip REST client: HTTPS or loopback HTTP only, no redirects,
// ten-second bound, and fixed error text. Response bodies can echo request content, so
// they never reach an error message.
export function apiOrigin(value) {
  const url = new URL(value);
  if (
    url.username || url.password || url.search || url.hash ||
    !["/", "", "/api", "/api/"].includes(url.pathname) ||
    !(url.protocol === "https:" ||
      (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
  )
    throw new Error("Paperclip API must use HTTPS or loopback HTTP, without credentials or a path");
  return url.origin;
}
export function paperclipClient({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  const origin = apiOrigin(baseUrl);
  if (!token || /\s/.test(token)) throw new Error("Paperclip token is missing or malformed");
  async function call(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${origin}/api${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      const error = new Error("Paperclip transport failed; outcome may be unknown");
      error.unknown = true;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`Paperclip HTTP ${response.status}`);
      error.status = response.status;
      // A 5xx after a write may or may not have applied it.
      error.unknown = response.status >= 500;
      throw error;
    }
    try {
      return await response.json();
    } catch {
      const error = new Error("Paperclip returned invalid JSON");
      error.unknown = true;
      throw error;
    }
  }
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body ?? {}),
  };
}
