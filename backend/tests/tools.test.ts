// ==========================================
// Tool Unit Tests
// Tools that use Prisma are tested with vi.mock to avoid needing a DB.
// Engine-only tools (checkBudget) are tested without mocks.
// ==========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock Prisma before any tool imports ----
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    inventory: {
      findFirst: vi.fn(),
    },
    supplier: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    purchaseOrder: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    productionOrder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    approvalRequest: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../src/db/prisma.js';
import { checkInventory } from '../src/tools/inventoryTools.js';
import { getSupplier, findAlternativeSuppliers } from '../src/tools/supplierTools.js';
import { verifyTracking } from '../src/tools/trackingTools.js';
import { checkProductionSchedule, updateProductionRisk } from '../src/tools/productionTools.js';
import {
  checkBudget,
  validateRecoveryPlan,
  calculateRecoveryPlan,
  createPurchaseOrder,
} from '../src/tools/procurementTools.js';
import { writeAuditLog } from '../src/tools/auditTools.js';

// ==========================================
// Shared Fixtures
// ==========================================

const mockInventoryComp104 = {
  id: 'inv-1',
  sku: 'COMP-104',
  name: 'High-Frequency Micro-Controller Module',
  category: 'Semiconductors',
  currentStock: 420,
  safetyStock: 200,
  reorderPoint: 500,
  unitCost: 120.0,
  dailyBurnRate: 100.0,
  currency: 'USD',
  location: 'Bay-4',
  status: 'IN_STOCK',
  description: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSup37 = {
  id: 'sup-37-id',
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
  address: 'Tokyo',
  country: 'Japan',
  status: 'ACTIVE',
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSup18 = {
  id: 'sup-18-id',
  code: 'SUP-18',
  name: 'CheapParts Manufacturing',
  contactEmail: 'sales@cheapparts.com',
  contactPhone: '+84-28',
  tier: 3,
  reliabilityScore: 0.88,
  leadTimeDaysAvg: 1,
  iso9001Certified: false, // Non-compliant
  unitPrice: 85.0,
  availableCapacity: 600,
  address: 'Vietnam',
  country: 'Vietnam',
  status: 'ACTIVE',
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSup42 = {
  id: 'sup-42-id',
  code: 'SUP-42',
  name: 'Rapid Components',
  contactEmail: 'priority@rapid.io',
  contactPhone: '+1-415',
  tier: 1,
  reliabilityScore: 0.96,
  leadTimeDaysAvg: 1,
  iso9001Certified: true,
  unitPrice: 260.0,
  availableCapacity: 300,
  address: 'San Jose',
  country: 'United States',
  status: 'ACTIVE',
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ==========================================
// 1. checkInventory
// ==========================================

describe('checkInventory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns coverage data for a known component', async () => {
    vi.mocked(prisma.inventory.findFirst).mockResolvedValue(mockInventoryComp104);

    const result = await checkInventory({ componentId: 'COMP-104' });

    expect(result.found).toBe(true);
    expect(result.quantity).toBe(420);
    expect(result.dailyBurnRate).toBe(100);
    expect(result.daysOfCoverage).toBe(4.2);
    expect(result.isCritical).toBe(false);
    expect(result.isBelowSafetyStock).toBe(false);
    expect(result.component?.sku).toBe('COMP-104');
  });

  it('returns found:false for an unknown component', async () => {
    vi.mocked(prisma.inventory.findFirst).mockResolvedValue(null);

    const result = await checkInventory({ componentId: 'COMP-999' });

    expect(result.found).toBe(false);
    expect(result.component).toBeNull();
    expect(result.quantity).toBe(0);
  });

  it('marks isBelowSafetyStock when stock < safetyStock', async () => {
    vi.mocked(prisma.inventory.findFirst).mockResolvedValue({
      ...mockInventoryComp104,
      currentStock: 150, // below safetyStock of 200
    });
    const result = await checkInventory({ componentId: 'COMP-104' });
    expect(result.isBelowSafetyStock).toBe(true);
  });
});

// ==========================================
// 2. getSupplier
// ==========================================

describe('getSupplier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns supplier info for a known code', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSup37);

    const result = await getSupplier({ supplierId: 'SUP-37' });

    expect(result.found).toBe(true);
    expect(result.supplier?.code).toBe('SUP-37');
    expect(result.supplier?.iso9001Certified).toBe(true);
    expect(result.supplier?.isEligible).toBe(true);
    expect(result.supplier?.ineligibilityReason).toBeNull();
  });

  it('marks isEligible:false for an uncertified supplier', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSup18);

    const result = await getSupplier({ supplierId: 'SUP-18' });

    expect(result.found).toBe(true);
    expect(result.supplier?.isEligible).toBe(false);
    expect(result.supplier?.ineligibilityReason).toMatch(/ISO-9001/);
  });

  it('returns found:false for unknown supplier', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(null);
    const result = await getSupplier({ supplierId: 'SUP-999' });
    expect(result.found).toBe(false);
    expect(result.supplier).toBeNull();
  });
});

// ==========================================
// 3. findAlternativeSuppliers
// ==========================================

describe('findAlternativeSuppliers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all suppliers with eligibility annotations', async () => {
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([mockSup37, mockSup42, mockSup18]);

    const result = await findAlternativeSuppliers({
      componentId: 'COMP-104',
      requiredQuantity: 280,
    });

    expect(result.totalFound).toBe(3);
    expect(result.eligibleCount).toBe(2); // SUP-37 and SUP-42 are certified
    const sup18 = result.suppliers.find((s) => s.code === 'SUP-18');
    expect(sup18?.isEligible).toBe(false);
    const sup37 = result.suppliers.find((s) => s.code === 'SUP-37');
    expect(sup37?.canFulfillAlone).toBe(true); // 500 capacity >= 280 required
    const sup42 = result.suppliers.find((s) => s.code === 'SUP-42');
    expect(sup42?.canFulfillAlone).toBe(true); // 300 capacity >= 280 required
  });
});

// ==========================================
// 4. verifyTracking (Contradiction Detection)
// ==========================================

describe('verifyTracking', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockPO7712 = {
    id: 'po-7712-id',
    poNumber: 'PO-7712',
    supplierId: 'sup-21-id',
    status: 'DELAYED',
    quantity: 500,
    unitPrice: 120.0,
    totalAmount: 60000.0,
    currency: 'USD',
    orderDate: new Date(),
    expectedDeliveryDate: new Date(Date.now() + 86400000),
    actualDeliveryDate: null,
    supplierClaimStatus: 'Shipment dispatched',
    supplierClaimNotes: 'PO-7712 will be delayed by 5 days.',
    lineItems: [],
    notes: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    trackingEvents: [
      {
        id: 'te-1',
        purchaseOrderId: 'po-7712-id',
        eventType: 'NO_LABEL_CREATED',
        status: 'CARRIER_MANIFEST_EXCEPTION',
        location: 'Frankfurt Cargo Hub',
        carrier: 'GlobalFreight Express',
        notes: 'No physical pickup logged.',
        eventTimestamp: new Date(),
        rawData: { mismatchDetected: true },
        createdAt: new Date(),
      },
    ],
  };

  it('detects contradiction between supplier claim and carrier status', async () => {
    vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(mockPO7712 as never);

    const result = await verifyTracking({ purchaseOrderId: 'PO-7712' });

    expect(result.found).toBe(true);
    expect(result.hasContradiction).toBe(true);
    expect(result.supplierClaimStatus).toBe('Shipment dispatched');
    expect(result.latestCarrierEventType).toBe('NO_LABEL_CREATED');
    expect(result.contradictionDetails).not.toBeNull();
    expect(result.contradictionDetails?.explanation).toMatch(/NO_LABEL_CREATED/);
  });

  it('returns found:false for an unknown PO', async () => {
    vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
    const result = await verifyTracking({ purchaseOrderId: 'PO-9999' });
    expect(result.found).toBe(false);
    expect(result.hasContradiction).toBe(false);
  });
});

// ==========================================
// 5. checkProductionSchedule
// ==========================================

describe('checkProductionSchedule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CRITICAL risk when shortfall exists and deadline is near', async () => {
    vi.mocked(prisma.inventory.findFirst).mockResolvedValue(mockInventoryComp104);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
      {
        id: 'prod-882-id',
        orderNumber: 'PROD-882',
        productName: 'ECU Assembly',
        targetQuantity: 700,
        completedQuantity: 0,
        status: 'PLANNED',
        priority: 'CRITICAL',
        startDate: new Date(),
        dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days
        completionDate: null,
        affectedByDisruption: true,
        billOfMaterials: [{ sku: 'COMP-104', requiredQuantity: 700, unitCost: 120 }],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ]);

    const result = await checkProductionSchedule({ componentId: 'COMP-104' });

    expect(result.found).toBe(true);
    expect(result.currentStock).toBe(420);
    expect(result.totalRequiredQuantity).toBe(700);
    expect(result.shortfallUnits).toBe(280);
    // deadlineDays=4 (>3 and <=7) + shortfall > 0 => MEDIUM risk
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.productionOrders).toHaveLength(1);
  });

  it('returns NONE risk when no production orders reference the component', async () => {
    vi.mocked(prisma.inventory.findFirst).mockResolvedValue(mockInventoryComp104);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([]);

    const result = await checkProductionSchedule({ componentId: 'COMP-104' });

    expect(result.riskLevel).toBe('NONE');
    expect(result.shortfallUnits).toBe(0);
  });
});

// ==========================================
// 6. checkBudget (pure engine — no DB)
// ==========================================

describe('checkBudget', () => {
  it('allows autonomous execution at or below $150,000', () => {
    const result = checkBudget({ recoveryCostUSD: 40_600 });
    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks and requires human approval above $150,000', () => {
    const result = checkBudget({ recoveryCostUSD: 182_000 });
    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.violations[0].rule).toBe('AUTONOMOUS_BUDGET');
  });
});

// ==========================================
// 7. validateRecoveryPlan (DB-backed engine call)
// ==========================================

describe('validateRecoveryPlan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('approves a valid single-supplier plan within budget', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSup37);

    const result = await validateRecoveryPlan({
      actions: [{ supplierId: 'sup-37-id', supplierCode: 'SUP-37', quantityOrdered: 280, unitPrice: 145 }],
      requiredQuantity: 700,
      deadlineDays: 4,
      currentInventory: 420,
      dailyBurnRate: 100,
    });

    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.totalCostUSD).toBe(40_600);
  });

  it('rejects a plan with an uncertified supplier', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSup18);

    const result = await validateRecoveryPlan({
      actions: [{ supplierId: 'sup-18-id', supplierCode: 'SUP-18', quantityOrdered: 280, unitPrice: 85 }],
      requiredQuantity: 700,
      deadlineDays: 4,
      currentInventory: 420,
      dailyBurnRate: 100,
    });

    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.rule === 'ISO_9001')).toBe(true);
  });

  it('escalates to human approval when cost exceeds budget', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue({ ...mockSup42, availableCapacity: 700 });

    const result = await validateRecoveryPlan({
      actions: [{ supplierId: 'sup-42-id', supplierCode: 'SUP-42', quantityOrdered: 700, unitPrice: 260 }],
      requiredQuantity: 700,
      deadlineDays: 4,
      currentInventory: 420,
      dailyBurnRate: 100,
    });

    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.totalCostUSD).toBe(182_000);
  });
});

// ==========================================
// 8. calculateRecoveryPlan
// ==========================================

describe('calculateRecoveryPlan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates candidates including solo and combo plans', async () => {
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([mockSup42, mockSup37]);

    const result = await calculateRecoveryPlan({
      requiredQuantity: 700,
      currentInventory: 420,
      dailyBurnRate: 100,
      deadlineDays: 4,
      candidateSupplierCodes: ['SUP-42', 'SUP-37'],
    });

    expect(result.shortfallUnits).toBe(280);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.note).toMatch(/must be validated/);
    const soloSup42 = result.candidates.find((c) => c.planId.includes('SUP-42'));
    expect(soloSup42).toBeDefined();
  });
});

// ==========================================
// 9. createPurchaseOrder — safety gate
// ==========================================

describe('createPurchaseOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  const baseInput = {
    supplierCode: 'SUP-37',
    quantityOrdered: 280,
    unitPrice: 145.0,
    componentSku: 'COMP-104',
    deadlineDays: 4,
    currentInventory: 420,
    dailyBurnRate: 100,
  };

  it('blocks execution when constraint engine disallows', async () => {
    const result = await createPurchaseOrder({
      ...baseInput,
      constraintValidationResult: {
        allowed: false,
        requiresHumanApproval: false,
        violations: [{ rule: 'ISO_9001', message: 'ISO-9001 certification is required.' }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toMatch(/ISO-9001/);
    expect(result.purchaseOrder).toBeNull();
    // Verify DB was NOT touched
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('blocks execution when budget exceeded and no human approval', async () => {
    vi.mocked(prisma.approvalRequest.findFirst).mockResolvedValue(null);

    const result = await createPurchaseOrder({
      ...baseInput,
      constraintValidationResult: {
        allowed: false,
        requiresHumanApproval: true,
        violations: [{ rule: 'AUTONOMOUS_BUDGET', message: 'Cost exceeds autonomous limit.' }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toMatch(/Human approval required/);
  });

  it('creates PO when engine allows', async () => {
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSup37);
    vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
      id: 'po-new-id',
      poNumber: 'PO-ABC123',
      supplierId: mockSup37.id,
      status: 'ISSUED',
      quantity: 280,
      unitPrice: 145,
      totalAmount: 40600,
      currency: 'USD',
      orderDate: new Date(),
      expectedDeliveryDate: new Date(Date.now() + 3 * 86400000),
      actualDeliveryDate: null,
      supplierClaimStatus: 'Order issued',
      supplierClaimNotes: null,
      lineItems: [],
      notes: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await createPurchaseOrder({
      ...baseInput,
      constraintValidationResult: {
        allowed: true,
        requiresHumanApproval: false,
        violations: [],
      },
    });

    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.purchaseOrder).not.toBeNull();
    expect(prisma.purchaseOrder.create).toHaveBeenCalledOnce();
  });

  it('creates PO when budget blocked but human approval is APPROVED', async () => {
    vi.mocked(prisma.approvalRequest.findFirst).mockResolvedValue({
      id: 'appr-1',
      status: 'APPROVED',
    } as never);
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSup37);
    vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
      id: 'po-new-id',
      poNumber: 'PO-XYZ789',
      supplierId: mockSup37.id,
      status: 'ISSUED',
      quantity: 280,
      unitPrice: 145,
      totalAmount: 40600,
      currency: 'USD',
      orderDate: new Date(),
      expectedDeliveryDate: new Date(Date.now() + 3 * 86400000),
      actualDeliveryDate: null,
      supplierClaimStatus: null,
      supplierClaimNotes: null,
      lineItems: [],
      notes: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await createPurchaseOrder({
      ...baseInput,
      constraintValidationResult: {
        allowed: false,
        requiresHumanApproval: true,
        violations: [{ rule: 'AUTONOMOUS_BUDGET', message: 'Exceeds limit.' }],
      },
      humanApprovalRequestId: 'appr-1',
    });

    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
  });
});

// ==========================================
// 10. updateProductionRisk
// ==========================================

describe('updateProductionRisk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates production order status successfully', async () => {
    vi.mocked(prisma.productionOrder.findFirst).mockResolvedValue({
      id: 'prod-882-id',
      orderNumber: 'PROD-882',
      status: 'PLANNED',
    } as never);
    vi.mocked(prisma.productionOrder.update).mockResolvedValue({
      id: 'prod-882-id',
      orderNumber: 'PROD-882',
      status: 'BLOCKED',
      affectedByDisruption: true,
    } as never);

    const result = await updateProductionRisk({
      productionOrderId: 'PROD-882',
      status: 'BLOCKED',
      affectedByDisruption: true,
    });

    expect(result.success).toBe(true);
    expect(result.newStatus).toBe('BLOCKED');
    expect(result.previousStatus).toBe('PLANNED');
  });

  it('returns success:false for unknown order', async () => {
    vi.mocked(prisma.productionOrder.findFirst).mockResolvedValue(null);
    const result = await updateProductionRisk({ productionOrderId: 'PROD-999', status: 'BLOCKED' });
    expect(result.success).toBe(false);
  });
});

// ==========================================
// 11. writeAuditLog
// ==========================================

describe('writeAuditLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an audit log record', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({
      id: 'audit-1',
      action: 'PO_CREATED',
    } as never);

    const result = await writeAuditLog({
      action: 'PO_CREATED',
      actorType: 'AGENT',
      actorId: 'supply-chain-agent-v1',
      targetEntity: 'PurchaseOrder',
      targetEntityId: 'PO-NEW',
      reasoning: 'Recovery plan approved by engine.',
      metadata: { planId: 'PLAN-SOLO-SUP-37' },
    });

    expect(result.success).toBe(true);
    expect(result.auditLogId).toBe('audit-1');
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });
});
