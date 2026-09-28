import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readJSON, atomic, runDir } from "./store.mjs";
import { join } from "node:path";
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Claude · Codex</title><style>body{font:16px system-ui;background:#f5f4f0;color:#272824;margin:0;padding:40px;max-width:900px}h1{font-size:28px}small{color:#676a60}pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;background:white;padding:24px;border-radius:12px}#state{font-weight:600}</style><h1>Claude working with Codex</h1><small id="place"></small><p id="state">Connecting…</p><pre id="text" aria-live="polite"></pre><script>
const id=location.pathname.split('/').pop(),token=location.hash.slice(1);history.replaceState(null,'',location.pathname);async function update(){try{const res=await fetch('/state/'+id,{headers:{Authorization:'Bearer '+token}});if(!res.ok)throw Error('This viewer is unavailable. Ask Codex to reopen it.');const s=await res.json();document.getElementById('place').textContent=s.host+' · '+s.cwd;document.getElementById('state').textContent=s.terminal?'Finished · '+s.state:s.question?'Waiting for an answer':s.state;document.getElementById('text').textContent=s.result?JSON.stringify(s.result,null,2):s.progress||'Waiting for Claude output…';if(!s.terminal)setTimeout(update,1000);}catch(e){document.getElementById('state').textContent=e.message;}}update();</script></html>`;
export class Viewer {
  constructor(manager) {
    this.manager = manager;
    this.tokens = new Map();
  }
  async open(id) {
    await this.manager.status(id);
    if (!this.server) {
      this.server = http.createServer(async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("X-Content-Type-Options", "nosniff");
        try {
          if (
            req.method !== "GET" ||
            req.headers.host !== `127.0.0.1:${this.server.address().port}`
          ) {
            res.writeHead(403);
            return res.end();
          }
          const match = /^\/(view|state)\/([0-9a-f-]{36})$/.exec(req.url);
          if (!match) {
            res.writeHead(404);
            return res.end();
          }
          if (match[1] === "view") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.end(html);
          }
          const token = this.tokens.get(match[2]);
          const supplied = Buffer.from(
            (req.headers.authorization || "").replace(/^Bearer /, ""),
          );
          if (
            !token ||
            supplied.length !== token.length ||
            !timingSafeEqual(supplied, token)
          ) {
            res.writeHead(403);
            return res.end();
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(await this.manager.status(match[2])));
        } catch {
          res.writeHead(404);
          res.end();
        }
      });
      await new Promise((resolve, reject) => {
        this.server.once("error", reject);
        this.server.listen(0, "127.0.0.1", resolve);
      });
    }
    // Viewer capabilities are short-lived and bounded, and never confer control.
    if (this.tokens.size >= 32)
      this.tokens.delete(this.tokens.keys().next().value);
    const token = Buffer.from(randomBytes(24).toString("hex"));
    this.tokens.set(id, token);
    return {
      url: `http://127.0.0.1:${this.server.address().port}/view/${id}#${token}`,
      executionHost: (await this.manager.status(id)).host,
      note: "Open in the Codex browser panel on this host. Remote sessions use tool progress unless the local port is forwarded. Opening the viewer does not keep Claude running.",
    };
  }
  close() {
    this.server?.close();
    this.tokens.clear();
  }
}
