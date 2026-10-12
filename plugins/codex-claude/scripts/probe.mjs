import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
export async function probe(root) {
  const client = new Client({ name: 'codex-claude-install-check', version: '1' });
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'scripts','mcp.mjs')]}));
    const { tools } = await client.listTools();
    if (tools.length !== 9 || !tools.some(t => t.name === 'claude_start')) throw new Error('Installed plugin tool contract is incomplete');
  } finally { await client.close(); }
}
export async function probeClaude(root) {
  const client = new Client({ name: 'claude-codex-install-check', version: '1' });
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'scripts','claude-mcp.mjs')]}));
    const { tools } = await client.listTools();
    if (tools.length !== 8 || !tools.some(t => t.name === 'codex_start')) throw new Error('Installed Claude tool contract is incomplete');
  } finally { await client.close(); }
}
