import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

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
    return tools;
  } finally { await client.close(); }
}

async function verifyHooks(root) {
  for (const relative of ['hooks/hooks.json', 'claude-plugin/hooks/hooks.json']) {
    const manifest = JSON.parse(await readFile(join(root, relative), 'utf8'));
    const events = Object.keys(manifest.hooks ?? {});
    if (relative === 'hooks/hooks.json' && events.includes('UserPromptSubmit'))
      throw new Error(`${relative} must not register a prompt hook`);
    if (relative === 'claude-plugin/hooks/hooks.json') {
      const promptCommand = manifest.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command;
      if (promptCommand !== 'node "$HOME/plugins/factory/scripts/claude-hook.mjs" UserPromptSubmit')
        throw new Error(`${relative} must use the settings-only Claude prompt recorder`);
    }
    for (const required of ['SessionStart', 'PreToolUse', 'SessionEnd'])
      if (!events.includes(required)) throw new Error(`${relative} is missing ${required}`);
  }
  const mcp = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));
  if (mcp.mcpServers?.factory?.command !== '/bin/sh' ||
      JSON.stringify(mcp.mcpServers?.factory?.args) !==
        JSON.stringify(['-c', 'root=${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-$HOME/plugins/factory}}; exec node "$root/scripts/mcp.mjs"']))
    throw new Error('Codex MCP launcher must expand the documented PLUGIN_ROOT');
  if (mcp.mcpServers.factory.default_tools_approval_mode !== 'approve')
    throw new Error('Codex Factory tools must be callable under the host approval policy');
  if (JSON.stringify(mcp.mcpServers.factory.env_vars) !== JSON.stringify(['CODEX_THREAD_ID']))
    throw new Error('Codex MCP launcher must receive the verified root task id');
}

const factoryContract = (tools, names) => Object.fromEntries(
  tools
    .filter(({ name }) => names.includes(name))
    .map(({ name, description, inputSchema }) => [name, { description, inputSchema }]),
);

export async function probe(root) {
  await probeServer(root, {
    clientName: 'factory-install-check',
    script: 'mcp.mjs',
    contractName: 'codexMcpToolNames',
    label: 'Installed plugin tool contract',
  });
}

export async function probeClaude(root) {
  const claudeTools = await probeServer(root, {
    clientName: 'claude-codex-install-check',
    script: 'claude-mcp.mjs',
    contractName: 'claudeMcpToolNames',
    label: 'Installed Claude tool contract',
  });
  const codexTools = await probeServer(root, {
    clientName: 'factory-shared-contract-check',
    script: 'mcp.mjs',
    contractName: 'codexMcpToolNames',
    label: 'Installed Codex tool contract',
  });
  const contract = await import(
    pathToFileURL(join(root, 'scripts', 'tool-contract.mjs')).href
  );
  if (JSON.stringify(factoryContract(codexTools, contract.factoryMcpToolNames)) !==
      JSON.stringify(factoryContract(claudeTools, contract.factoryMcpToolNames)))
    throw new Error('Installed Codex and Claude Factory tool schemas differ');
  await verifyHooks(root);
}
