import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getInventory, getInventoryByComponent, updateStock } from '../sim/inventory.js';
import { getPurchaseOrders, getPurchaseOrderById, createPurchaseOrder } from '../sim/purchaseOrders.js';
import { getSuppliers, getSupplierById } from '../sim/suppliers.js';
import { getProductionSchedule } from '../sim/production.js';
import { sendSupplierMessage, getSupplierMessages } from '../sim/messaging.js';
import { createRfq, getRfqQuotes } from '../sim/rfq.js';
import { checkApproval, getApprovals } from '../sim/approval.js';
import { getTrackingByPoId, updateTracking } from '../sim/tracking.js';
import { logErpUpdate, getErpUpdates } from '../sim/erp.js';
import {
  getSimulationState,
  getDisruptions,
  injectDisruption,
  injectSimulationEvent,
  advanceSimulationTime,
} from '../sim/events.js';
import { resetSimulation } from '../sim/database.js';
import { recordAuditTrail, getAuditTrail } from '../audit/trail.js';

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 1. Health
  fastify.get('/health', async (request, reply) => {
    try {
      const state = await getSimulationState();
      return {
        status: 'healthy',
        database: 'Neon PostgreSQL connected',
        simulation_status: state.status,
        simulation_time: state.simulation_time,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      reply.status(503);
      return {
        status: 'unhealthy',
        error: err.message,
      };
    }
  });

  // 2. Inventory
  fastify.get('/inventory', async (request, reply) => {
    try {
      const items = await getInventory();
      return { count: items.length, inventory: items };
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve inventory', details: err.message };
    }
  });

  fastify.get('/inventory/:component_id', async (request, reply) => {
    const { component_id } = request.params as { component_id: string };
    try {
      const item = await getInventoryByComponent(component_id);
      if (!item) {
        reply.status(404);
        return { error: `Component ${component_id} not found in inventory` };
      }
      return item;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve component inventory', details: err.message };
    }
  });

  // 3. Purchase Orders
  fastify.get('/purchase-orders', async (request, reply) => {
    const querySchema = z.object({
      status: z.string().optional(),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query parameters', issues: parsed.error.issues };
    }

    try {
      const orders = await getPurchaseOrders(parsed.data.status);
      return { count: orders.length, purchase_orders: orders };
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve purchase orders', details: err.message };
    }
  });

  fastify.get('/purchase-orders/:po_id', async (request, reply) => {
    const { po_id } = request.params as { po_id: string };
    try {
      const order = await getPurchaseOrderById(po_id);
      if (!order) {
        reply.status(404);
        return { error: `Purchase order ${po_id} not found` };
      }
      return order;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve purchase order', details: err.message };
    }
  });

  // 4. Suppliers
  fastify.get('/suppliers', async (request, reply) => {
    const querySchema = z.object({
      component_id: z.string().optional(),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query parameters', issues: parsed.error.issues };
    }

    try {
      const suppliers = await getSuppliers(parsed.data.component_id);
      return { count: suppliers.length, suppliers };
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve suppliers', details: err.message };
    }
  });

  // 5. Production Schedule
  fastify.get('/production-schedule', async (request, reply) => {
    try {
      const schedule = await getProductionSchedule();
      return { count: schedule.length, production_orders: schedule };
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve production schedule', details: err.message };
    }
  });

  // 6. Messaging
  fastify.post('/suppliers/:supplier_id/message', async (request, reply) => {
    const { supplier_id } = request.params as { supplier_id: string };
    const bodySchema = z.object({
      po_id: z.string().optional(),
      subject: z.string().min(1, 'Subject is required'),
      body: z.string().min(1, 'Body is required'),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid message payload', issues: parsed.error.issues };
    }

    try {
      const result = await sendSupplierMessage({
        supplier_id,
        po_id: parsed.data.po_id,
        subject: parsed.data.subject,
        body: parsed.data.body,
      });
      return result;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to send message to supplier', details: err.message };
    }
  });

  // 7. RFQ
  fastify.post('/rfq', async (request, reply) => {
    const bodySchema = z.object({
      component_id: z.string().min(1),
      requested_quantity: z.number().int().positive('Quantity must be positive'),
      required_delivery_date: z.string().min(1, 'Required delivery date is required'),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid RFQ payload', issues: parsed.error.issues };
    }

    try {
      const result = await createRfq(parsed.data);
      return result;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to create RFQ', details: err.message };
    }
  });

  // 8. Approval Check
  fastify.post('/approval/check', async (request, reply) => {
    const bodySchema = z.object({
      action_type: z.string().min(1),
      estimated_cost: z.number().nonnegative('Cost cannot be negative'),
      approval_threshold: z.number().nonnegative().optional(),
      reason: z.string().optional(),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid approval check payload', issues: parsed.error.issues };
    }

    try {
      const result = await checkApproval(parsed.data);
      return result;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to check approval', details: err.message };
    }
  });

  // 9. ERP Update
  fastify.post('/erp/update', async (request, reply) => {
    const bodySchema = z.object({
      entity_type: z.string().min(1),
      entity_id: z.string().min(1),
      action: z.string().min(1),
      previous_value: z.record(z.any()).optional().default({}),
      new_value: z.record(z.any()).optional().default({}),
      reason: z.string().min(1, 'Reason is required'),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid ERP update payload', issues: parsed.error.issues };
    }

    try {
      const record = await logErpUpdate(
        parsed.data.entity_type,
        parsed.data.entity_id,
        parsed.data.action,
        parsed.data.previous_value,
        parsed.data.new_value,
        parsed.data.reason
      );
      return record;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to update ERP', details: err.message };
    }
  });

  // 10. Shipment Tracking
  fastify.get('/tracking/:po_id', async (request, reply) => {
    const { po_id } = request.params as { po_id: string };
    try {
      const tracking = await getTrackingByPoId(po_id);
      if (!tracking) {
        reply.status(404);
        return { error: `Tracking information for purchase order ${po_id} not found` };
      }
      return tracking;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve tracking', details: err.message };
    }
  });

  // 11. Disruptions
  fastify.get('/disruptions', async (request, reply) => {
    try {
      const disruptions = await getDisruptions();
      return { count: disruptions.length, disruptions };
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve disruptions', details: err.message };
    }
  });

  fastify.post('/disruptions/inject', async (request, reply) => {
    const bodySchema = z.object({
      disruption_type: z.string().min(1),
      component_id: z.string().min(1),
      po_id: z.string().optional(),
      production_order_id: z.string().optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      description: z.string().min(1),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid disruption payload', issues: parsed.error.issues };
    }

    try {
      const record = await injectDisruption(parsed.data);
      return record;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to inject disruption', details: err.message };
    }
  });

  // 12. Simulation State & Advance
  fastify.get('/simulation/state', async (request, reply) => {
    try {
      const state = await getSimulationState();
      return state;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve simulation state', details: err.message };
    }
  });

  fastify.post('/simulation/advance', async (request, reply) => {
    const bodySchema = z.object({
      steps: z.number().int().min(1, 'Steps must be at least 1').default(1),
    });

    const parsed = bodySchema.safeParse(request.body || {});
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid advance payload', issues: parsed.error.issues };
    }

    try {
      const result = await advanceSimulationTime(parsed.data.steps);
      return result;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to advance simulation time', details: err.message };
    }
  });

  fastify.post('/simulation/reset', async (request, reply) => {
    try {
      await resetSimulation();
      const state = await getSimulationState();
      return {
        status: 'reset_successful',
        message: 'Simulation environment restored to golden scenario',
        state,
      };
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to reset simulation', details: err.message };
    }
  });

  // 13. Audit Trail
  fastify.get('/audit/:disruption_id', async (request, reply) => {
    const { disruption_id } = request.params as { disruption_id: string };
    try {
      const records = await getAuditTrail(disruption_id);
      return { count: records.length, audit_trail: records };
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to retrieve audit trail', details: err.message };
    }
  });

  fastify.post('/audit', async (request, reply) => {
    const bodySchema = z.object({
      disruption_id: z.string().min(1),
      detected_disruption: z.string().min(1),
      data_sources_checked: z.array(z.any()).optional().default([]),
      messages_sent: z.array(z.any()).optional().default([]),
      messages_received: z.array(z.any()).optional().default([]),
      alternatives_considered: z.array(z.any()).optional().default([]),
      calculations: z.record(z.any()).optional().default({}),
      decision: z.string().min(1),
      decision_reason: z.string().min(1),
      erp_updates: z.array(z.any()).optional().default([]),
      escalations: z.array(z.any()).optional().default([]),
      remaining_risks: z.array(z.any()).optional().default([]),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid audit trail payload', issues: parsed.error.issues };
    }

    try {
      const record = await recordAuditTrail(parsed.data);
      return record;
    } catch (err: any) {
      reply.status(500);
      return { error: 'Failed to record audit trail', details: err.message };
    }
  });
};
