import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { sim } from '../sim';

export const loadErpTool = tool(
  async ({ from, po_id, component_id }) => {
    const [suppliers, inventory, pos, quotes] = await Promise.all([
      sim('/suppliers'),
      sim('/inventory'),
      sim('/purchase-orders'),
      sim('/rfq/quotes'),
    ]);
    const supplier = (suppliers.suppliers || []).find(
      (s: { email: string }) => s.email?.toLowerCase() === from.toLowerCase()
    );
    const po = po_id ? (pos.purchase_orders || []).find((p: { po_id: string }) => p.po_id === po_id) : null;
    const inv = component_id
      ? (inventory.inventory || []).find((i: { component_id: string }) => i.component_id === component_id)
      : null;
    const quote = (quotes.quotes || []).find(
      (q: { supplier_id?: string; component_id?: string; accepted?: boolean }) =>
        !q.accepted &&
        (!supplier || q.supplier_id === supplier.supplier_id) &&
        (!component_id || q.component_id === component_id)
    );
    return JSON.stringify({ supplier: supplier || null, po: po || null, inventory: inv || null, quote: quote || null });
  },
  {
    name: 'load_erp',
    description: 'Load supplier, PO, inventory coverage, and open quotes from the Neon simulation.',
    schema: z.object({
      from: z.string(),
      po_id: z.string().optional(),
      component_id: z.string().optional(),
    }),
  }
);

export const recoverSupplierTool = tool(
  async ({ component_id, po_id }) => {
    const data = await sim('/recovery/evaluate', {
      method: 'POST',
      body: JSON.stringify({ component_id, po_id }),
    });
    return JSON.stringify(data);
  },
  {
    name: 'recover_supplier',
    description: 'Evaluate fallback suppliers and recovery cost on the live simulation.',
    schema: z.object({
      component_id: z.string(),
      po_id: z.string().optional(),
    }),
  }
);

export const checkApprovalTool = tool(
  async ({ estimated_cost, reason }) => {
    const data = await sim('/approval/check', {
      method: 'POST',
      body: JSON.stringify({ action_type: 'supplier_confirmed_deal', estimated_cost, reason }),
    });
    return JSON.stringify(data);
  },
  {
    name: 'check_approval',
    description: 'Check the autonomous spend threshold. Never treat a supplier YES as payment by itself.',
    schema: z.object({
      estimated_cost: z.number(),
      reason: z.string(),
    }),
  }
);
