import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../db/prisma.js';
import { seedDatabase } from '../db/seed.js';

export async function demoRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  /**
   * POST /api/demo/reset
   * Resets database to initial deterministic scenario state.
   */
  fastify.post('/reset', async (_request, reply) => {
    try {
      const summary = await seedDatabase();
      return reply.status(200).send({
        status: 'ok',
        message: 'Database reset to initial demo state successfully',
        data: {
          seededEntities: summary,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to reset demo database state',
        error: {
          code: 'RESET_FAILED',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  /**
   * GET /api/demo/state
   * Returns comprehensive scenario snapshot formatted for frontend visualization.
   */
  fastify.get('/state', async (_request, reply) => {
    try {
      const [
        suppliers,
        inventoryList,
        purchaseOrders,
        productionOrders,
        disruptions,
        auditLogs,
        recoveryPlans,
        approvalRequests,
      ] = await Promise.all([
        prisma.supplier.findMany({
          orderBy: { code: 'asc' },
        }),
        prisma.inventory.findMany({
          orderBy: { sku: 'asc' },
        }),
        prisma.purchaseOrder.findMany({
          include: {
            supplier: true,
            trackingEvents: {
              orderBy: { eventTimestamp: 'desc' },
            },
          },
          orderBy: { poNumber: 'asc' },
        }),
        prisma.productionOrder.findMany({
          orderBy: { orderNumber: 'asc' },
        }),
        prisma.disruptionEvent.findMany({
          include: {
            recoveryPlans: {
              include: {
                approvalRequests: true,
              },
            },
          },
          orderBy: { detectedAt: 'desc' },
        }),
        prisma.auditLog.findMany({
          take: 20,
          orderBy: { timestamp: 'desc' },
        }),
        prisma.recoveryPlan.findMany({
          include: {
            approvalRequests: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.approvalRequest.findMany({
          orderBy: { requestedAt: 'desc' },
        }),
      ]);

      // Calculate scenario metrics
      const comp104 = inventoryList.find((i) => i.sku === 'COMP-104');
      const prod882 = productionOrders.find((p) => p.orderNumber === 'PROD-882');
      const po7712 = purchaseOrders.find((p) => p.poNumber === 'PO-7712');

      const currentStock = comp104?.currentStock ?? 0;
      const dailyBurnRate = comp104?.dailyBurnRate ?? 100;
      const coverageDays = dailyBurnRate > 0 ? Number((currentStock / dailyBurnRate).toFixed(1)) : 0;
      const requiredQuantity = prod882?.targetQuantity ?? 700;
      const stockDeficit = Math.max(0, requiredQuantity - currentStock);

      const hasContradiction = Boolean(
        po7712?.supplierClaimStatus &&
          po7712.trackingEvents.some(
            (t) => t.eventType === 'NO_LABEL_CREATED' || t.status.includes('EXCEPTION')
          )
      );

      const responseData = {
        scenario: {
          id: 'PO-7712-DISRUPTION',
          title: 'Supply Chain Disruption & Contradictory Supplier Verification',
          status: 'ACTIVE_DISRUPTION',
          hasContradictoryData: hasContradiction,
          contradictionSummary: {
            supplierClaim: po7712?.supplierClaimStatus || 'Shipment dispatched',
            supplierReportedDelay: po7712?.supplierClaimNotes || 'PO-7712 will be delayed by 5 days.',
            carrierActualStatus: po7712?.trackingEvents[0]?.eventType || 'NO_LABEL_CREATED',
            carrierNotes: po7712?.trackingEvents[0]?.notes || 'No physical pickup logged.',
          },
          riskAssessment: {
            riskLevel: 'CRITICAL',
            currentCoverageDays: coverageDays,
            productionDeadlineDays: 4.0,
            requiredUnits: requiredQuantity,
            currentStockUnits: currentStock,
            deficitUnits: stockDeficit,
            shutdownImminent: coverageDays < 5.0 && stockDeficit > 0,
          },
          businessRules: {
            iso9001Mandatory: true,
            autonomousRecoveryBudgetLimitUSD: 150000.0,
            requiresHumanApprovalAboveBudget: true,
          },
        },
        inventory: inventoryList,
        productionOrders,
        purchaseOrders,
        suppliers: suppliers.map((sup) => ({
          ...sup,
          isEligible: sup.iso9001Certified && sup.availableCapacity > 0,
          ineligibilityReason: !sup.iso9001Certified
            ? 'Missing mandatory ISO-9001 certification'
            : sup.availableCapacity === 0
            ? 'Zero available capacity'
            : null,
        })),
        disruptions,
        recoveryPlans,
        approvalRequests,
        auditLogs,
      };

      return reply.status(200).send({
        status: 'ok',
        data: responseData,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        status: 'error',
        message: 'Failed to retrieve demo scenario state',
        error: {
          code: 'STATE_FETCH_FAILED',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
