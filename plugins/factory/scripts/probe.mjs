import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function contractError(label, expected, tools) {
  const saw = tools.map((tool) => tool.name);
  const expectedSet = new Set(expected);
  const sawSet = new Set(saw);
  const missing = expected.filter((name) => !sawSet.has(name));
  const unexpected = [...sawSet].filter((name) => !expectedSet.has(name));
  if (!missing.length && !unexpected.length) return null;
  return new Error(
    `${label} is incomplete; missing: ${JSON.stringify(missing.sort())}; ` +
      `unexpected: ${JSON.stringify(unexpected.sort())}; saw: ${JSON.stringify(saw.sort())}`,
  );
}

async function probeServer(root, { clientName, script, contractName, label }) {
  const contract = await import(
    pathToFileURL(join(root, 'scripts', 'tool-contract.mjs')).href
  );
  const client = new Client({ name: clientName, version: '1' });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [join(root, 'scripts', script)],
    }));
    const { tools } = await client.listTools();
    const error = contractError(label, contract[contractName], tools);
    if (error) throw error;
  } finally { await client.close(); }
}

export async function probe(root) {
  await probeServer(root, {
    clientName: 'factory-install-check',
    script: 'mcp.mjs',
    contractName: 'codexMcpToolNames',
    label: 'Installed plugin tool contract',
  });
}

export async function probeClaude(root) {
  await probeServer(root, {
    clientName: 'claude-codex-install-check',
    script: 'claude-mcp.mjs',
    contractName: 'claudeMcpToolNames',
    label: 'Installed Claude tool contract',
  });
}
