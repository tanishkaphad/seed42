import { prisma } from './prisma.js';
import {
  SupplierStatus,
  InventoryStatus,
  PurchaseOrderStatus,
  ProductionOrderStatus,
  TrackingEventType,
  DisruptionSeverity,
  DisruptionCategory,
  DisruptionStatus,
  ActorType,
  PriorityLevel,
} from '@prisma/client';

export interface SeedResult {
  suppliers: number;
  inventory: number;
  purchaseOrders: number;
  productionOrders: number;
  trackingEvents: number;
  disruptionEvents: number;
  auditLogs: number;
}

export async function seedDatabase(): Promise<SeedResult> {
  console.log('🌱 Starting deterministic database seed...');

  // 1. Clean existing records in reverse dependency order
  await prisma.approvalRequest.deleteMany();
  await prisma.recoveryPlan.deleteMany();
  await prisma.disruptionEvent.deleteMany();
  await prisma.trackingEvent.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.auditLog.deleteMany();

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // 2. Seed Suppliers
  const sup21 = await prisma.supplier.create({
    data: {
      code: 'SUP-21',
      name: 'Global Components Ltd',
      contactEmail: 'ops@globalcomponents.com',
      contactPhone: '+49-69-1234567',
      tier: 1,
      reliabilityScore: 0.82,
      leadTimeDaysAvg: 5,
      iso9001Certified: true,
      unitPrice: 120.0,
      availableCapacity: 0,
      address: 'Industriestrasse 42, Frankfurt',
      country: 'Germany',
      status: SupplierStatus.ACTIVE,
      metadata: {
        notes: 'Primary supplier for COMP-104. Currently experiencing localized supply chain bottlenecks.',
      },
    },
  });

  const sup42 = await prisma.supplier.create({
    data: {
      code: 'SUP-42',
      name: 'Rapid Components',
      contactEmail: 'priority@rapidcomponents.io',
      contactPhone: '+1-415-555-0199',
      tier: 1,
      reliabilityScore: 0.96,
      leadTimeDaysAvg: 1,
      iso9001Certified: true,
      unitPrice: 260.0,
      availableCapacity: 300,
      address: '800 Innovation Way, San Jose, CA',
      country: 'United States',
      status: SupplierStatus.ACTIVE,
      metadata: {
        notes: 'Expedited supplier with high reliability and immediate 1-day turnaround at premium cost.',
        costClassification: 'EXPENSIVE',
      },
    },
  });

  const sup18 = await prisma.supplier.create({
    data: {
      code: 'SUP-18',
      name: 'CheapParts Manufacturing',
      contactEmail: 'sales@cheapparts-mfg.com',
      contactPhone: '+84-28-3829000',
      tier: 3,
      reliabilityScore: 0.88,
      leadTimeDaysAvg: 1,
      iso9001Certified: false, // Non-compliant with ISO-9001!
      unitPrice: 85.0,
      availableCapacity: 600,
      address: 'Lot 14 Tan Thuan Export Zone, Ho Chi Minh City',
      country: 'Vietnam',
      status: SupplierStatus.ACTIVE,
      metadata: {
        notes: 'Cheap high-capacity supplier. NON-COMPLIANT with mandatory ISO-9001 certification rule.',
        costClassification: 'CHEAP',
      },
    },
  });

  const sup37 = await prisma.supplier.create({
    data: {
      code: 'SUP-37',
      name: 'Certified Components Co',
      contactEmail: 'orders@certifiedcomp.com',
      contactPhone: '+81-3-5555-0144',
      tier: 1,
      reliabilityScore: 0.91,
      leadTimeDaysAvg: 3,
      iso9001Certified: true,
      unitPrice: 145.0,
      availableCapacity: 500,
      address: '2-11-1 Shibaura, Minato-ku, Tokyo',
      country: 'Japan',
      status: SupplierStatus.ACTIVE,
      metadata: {
        notes: 'Standard certified supplier with high capacity (500 units) and moderate 3-day lead time.',
        costClassification: 'MODERATE',
      },
    },
  });

  // 3. Seed Inventory Item (COMP-104)
  const comp104 = await prisma.inventory.create({
    data: {
      sku: 'COMP-104',
      name: 'High-Frequency Micro-Controller Module',
      description: 'Critical automotive-grade processing unit required for ECU line assembly',
      category: 'Semiconductors',
      currentStock: 420, // 420 units in stock
      safetyStock: 200,
      reorderPoint: 500,
      unitCost: 120.0,
      dailyBurnRate: 100.0, // 100 units/day -> 4.2 days usable coverage
      currency: 'USD',
      location: 'Central Warehouse / Bay-4 / Shelf-12',
      status: InventoryStatus.IN_STOCK,
      metadata: {
        criticality: 'CRITICAL',
        dailyUsage: 100,
        coverageDays: 4.2,
      },
    },
  });

  // 4. Seed Production Order (PROD-882)
  const prod882 = await prisma.productionOrder.create({
    data: {
      orderNumber: 'PROD-882',
      productName: 'Automated ECU Assembly Line A',
      targetQuantity: 700, // Requires 700 units of COMP-104
      completedQuantity: 0,
      status: ProductionOrderStatus.PLANNED,
      priority: PriorityLevel.CRITICAL,
      startDate: now,
      dueDate: new Date(now.getTime() + 4 * dayMs), // 4-day deadline
      affectedByDisruption: true,
      billOfMaterials: [
        {
          sku: 'COMP-104',
          name: 'High-Frequency Micro-Controller Module',
          requiredQuantity: 700,
          unitCost: 120.0,
        },
      ],
      metadata: {
        shutdownRisk: 'CRITICAL',
        shortfallUnits: 280, // 700 needed - 420 in stock = 280 units deficit
        deadlineDays: 4,
      },
    },
  });

  // 5. Seed Purchase Order (PO-7712) with contradictory claims
  const po7712 = await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-7712',
      supplierId: sup21.id,
      status: PurchaseOrderStatus.DELAYED,
      quantity: 500,
      unitPrice: 120.0,
      totalAmount: 60000.0,
      currency: 'USD',
      orderDate: new Date(now.getTime() - 2 * dayMs),
      expectedDeliveryDate: new Date(now.getTime() + 1 * dayMs),
      supplierClaimStatus: 'Shipment dispatched',
      supplierClaimNotes: 'PO-7712 will be delayed by 5 days.',
      lineItems: [
        {
          sku: 'COMP-104',
          name: 'High-Frequency Micro-Controller Module',
          quantity: 500,
          unitPrice: 120.0,
          totalPrice: 60000.0,
        },
      ],
      notes: 'Initial replenishment order placed with primary supplier SUP-21.',
      metadata: {
        hasContradiction: true,
        supplierClaim: 'Shipment dispatched',
        supplierDelayReportedDays: 5,
        effectiveDeliveryDateIfDelayed: new Date(now.getTime() + 6 * dayMs).toISOString(),
      },
    },
  });

  // 6. Seed Tracking Events for PO-7712 (Carrier says NO_LABEL_CREATED)
  await prisma.trackingEvent.create({
    data: {
      purchaseOrderId: po7712.id,
      eventType: TrackingEventType.NO_LABEL_CREATED,
      status: 'CARRIER_MANIFEST_EXCEPTION',
      location: 'Origin Terminal (Frankfurt Cargo Hub)',
      carrier: 'GlobalFreight Express',
      notes: 'Tracking status: NO_LABEL_CREATED. Carrier has no record of pickup or physical tender from supplier.',
      eventTimestamp: now,
      rawData: {
        mismatchDetected: true,
        supplierClaim: 'Shipment dispatched',
        carrierStatus: 'NO_LABEL_CREATED',
        lastCarrierScan: null,
        investigationFlag: 'SUPPLIER_MISREPRESENTATION_RISK',
      },
    },
  });

  // 7. Seed Disruption Event
  await prisma.disruptionEvent.create({
    data: {
      title: 'Critical Supply Disruption: PO-7712 Contradictory Claim & Imminent Line Stoppage',
      description:
        'Supplier SUP-21 reported a 5-day delay on PO-7712 (500 units of COMP-104) while claiming the batch was dispatched. Carrier tracking confirms NO_LABEL_CREATED. Inventory of 420 units covers 4.2 days, but PROD-882 requires 700 units within 4.0 days (deficit: 280 units). Factory line shutdown imminent without alternative mitigation.',
      severity: DisruptionSeverity.CRITICAL,
      category: DisruptionCategory.CONTRADICTORY_DATA,
      status: DisruptionStatus.DETECTED,
      affectedPoIds: ['PO-7712'],
      affectedSkuIds: ['COMP-104'],
      estimatedDelayDays: 5,
      impactScore: 96.5,
      detectedAt: now,
      metadata: {
        shortfall: 280,
        productionOrder: 'PROD-882',
        coverageDays: 4.2,
        deadlineDays: 4.0,
        budgetAutonomousLimit: 150000.0,
        mandatoryCertifications: ['ISO-9001'],
      },
    },
  });

  // 8. Seed Initial Audit Log
  await prisma.auditLog.create({
    data: {
      action: 'DISRUPTION_DETECTED',
      actorType: ActorType.SYSTEM,
      actorId: 'Automated-ERP-Reconciliation-Engine',
      targetEntity: 'PurchaseOrder',
      targetEntityId: 'PO-7712',
      previousState: {
        poStatus: 'CONFIRMED',
        carrierStatus: 'PENDING_PICKUP',
      },
      newState: {
        poStatus: 'DELAYED',
        carrierStatus: 'NO_LABEL_CREATED',
        supplierClaim: 'Shipment dispatched / 5-day delay',
        contradictionDetected: true,
      },
      reasoning:
        'Automated signal reconciliation identified a severe conflict between SUP-21 dispatch claim and carrier manifest (NO_LABEL_CREATED). Flagged production line PROD-882 at critical shutdown risk due to 280 unit shortfall in 4 days.',
      metadata: {
        scenario: 'PO-7712-DISRUPTION',
      },
      timestamp: now,
    },
  });

  console.log('✅ Deterministic seed complete.');

  return {
    suppliers: 4,
    inventory: 1,
    purchaseOrders: 1,
    productionOrders: 1,
    trackingEvents: 1,
    disruptionEvents: 1,
    auditLogs: 1,
  };
}

// If executed directly via `tsx src/db/seed.ts`
if (process.argv[1]?.includes('seed.ts')) {
  seedDatabase()
    .then((result) => {
      console.log('Seed summary:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error during seeding:', err);
      process.exit(1);
    });
}
