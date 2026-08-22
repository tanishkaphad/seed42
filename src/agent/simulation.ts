import { getInventoryByComponent } from '../sim/inventory.js';
import { getPurchaseOrderById } from '../sim/purchaseOrders.js';
import { getAllQuotes } from '../sim/rfq.js';
import { getTrackingByPoId } from '../sim/tracking.js';
import { getSupplierByEmail, getSupplierCapability } from '../sim/suppliers.js';
import { logAgentEvent } from '../sim/agentStore.js';

/** Simulation / ERP agent — read Tanishka's Neon tables only, never seed a parallel world. */
export async function loadErpSnapshot(input: {
  runId: string;
  fromEmail: string;
  poId?: string | null;
  componentId?: string | null;
  rfqId?: string | null;
}) {
  const supplier = await getSupplierByEmail(input.fromEmail);
  const po = input.poId ? await getPurchaseOrderById(input.poId) : null;
  const quotes = await getAllQuotes();
  const quote = quotes.find(
    (q) =>
      supplier &&
      q.supplier_id === supplier.supplier_id &&
      !q.accepted &&
      (!input.componentId || q.component_id === input.componentId) &&
      (!input.rfqId || q.rfq_id === input.rfqId)
  );
  const componentId = input.componentId || quote?.component_id || po?.component_id || null;
  const inventory = componentId ? await getInventoryByComponent(componentId) : null;
  const capability = supplier && componentId ? await getSupplierCapability(supplier.supplier_id, componentId) : null;
  const tracking = po?.po_id ? await getTrackingByPoId(po.po_id) : null;

  await logAgentEvent(
    input.runId,
    'simulation',
    `ERP snapshot ${componentId || 'no-component'} / ${po?.po_id || 'no-po'} / ${quote?.quote_id || 'no-quote'} / tracking ${tracking?.tracking_status || 'none'}.`
  );

  return { supplier, po, quote: quote || null, componentId, inventory, capability, tracking };
}
