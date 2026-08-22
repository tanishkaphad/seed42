import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), fileURLToPath(new URL('./index.ts', import.meta.url))],
});
const client = new Client({ name: 'seed42-mcp-selfcheck', version: '1.0.0' });
await client.connect(transport);
const tools = await client.listTools();
const names = tools.tools.map((tool) => tool.name);
const inv = await client.callTool({ name: 'list_inventory', arguments: {} });
const text = (inv.content as { type: string; text?: string }[])?.find((c) => c.type === 'text')?.text || '';
let count = '?';
try {
  const parsed = JSON.parse(text);
  count = String(Array.isArray(parsed) ? parsed.length : parsed.count ?? parsed.inventory?.length ?? 'ok');
} catch {
  count = text ? 'ok' : 'empty';
}
console.log(`ok: ${names.join(', ')}`);
console.log(`list_inventory: ${count} rows`);
await client.close();
