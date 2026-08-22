import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getInventory, updateStock } from '../sim/inventory.js';
import { getApprovals, updateApprovalStatus } from '../sim/approval.js';
import { getSuppliers } from '../sim/suppliers.js';
import { getAllQuotes } from '../sim/rfq.js';
import { getSupplierMessages } from '../sim/messaging.js';

const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

// ponytail: MCP only exposes the existing service boundary; business rules stay in src/sim.
export function createMcpServer() {
  const server = new McpServer({ name: 'seed42-operations', version: '1.0.0' });

  server.tool('list_inventory', 'List live component inventory and days of coverage.', {}, async () => result(await getInventory()));
  server.tool('update_inventory', 'Update current and usable stock for a component using the existing validated inventory service.', {
    component_id: z.string().min(1), current_stock: z.number().int().nonnegative(), usable_stock: z.number().int().nonnegative(), reason: z.string().optional(),
  }, async ({ component_id, current_stock, usable_stock, reason }) => result(await updateStock(component_id, current_stock, usable_stock, reason)));
  server.tool('list_approvals', 'List actions awaiting, approved by, or rejected by a human.', {}, async () => result(await getApprovals()));
  server.tool('decide_approval', 'Approve or reject an existing human-in-the-loop approval.', {
    approval_id: z.string().min(1), action: z.enum(['approved', 'rejected']), notes: z.string().optional(),
  }, async ({ approval_id, action, notes }) => result(await updateApprovalStatus(approval_id, action, notes)));
  server.tool('list_suppliers', 'List active supplier contacts and reliability rankings.', { component_id: z.string().optional() }, async ({ component_id }) => result(await getSuppliers(component_id)));
  server.tool('list_quotations', 'List supplier quotations saved against RFQs.', {}, async () => result(await getAllQuotes()));
  server.tool('list_supplier_messages', 'List inbound or outbound supplier emails.', { direction: z.enum(['inbound', 'outbound']).optional(), supplier_id: z.string().optional(), po_id: z.string().optional() }, async ({ direction, supplier_id, po_id }) => result(await getSupplierMessages(supplier_id, po_id, direction)));

  return server;
}
