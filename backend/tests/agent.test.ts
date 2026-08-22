// ==========================================
// LangGraph Agent Unit / Integration Tests
// ==========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockLLMResponseHandler = (messages: Array<{ content: string }>): { content: string } => {
  const lastMsg = messages[messages.length - 1]?.content || '';
  if (lastMsg.includes('calculateRecoveryPlan') || lastMsg.includes('selectedPlanId')) {
    return {
      content: JSON.stringify({
        selectedPlanId: 'PLAN-SOLO-SUP-37',
        reasoning: 'SUP-37 is ISO-9001 certified, can fulfill 280 units in 3 days within budget ($40,600).',
      }),
    };
  }
  return { content: 'Acknowledged and analyzed successfully.' };
};

// ---- Mock ChatOpenAI from @langchain/openai ----
vi.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    async invoke(messages: Array<{ content: string }>) {
      return mockLLMResponseHandler(messages);
    }
  }

  return {
    ChatOpenAI: MockChatOpenAI,
  };
});

// ---- Mock Prisma Client ----
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    disruptionEvent: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'disr-new-1' }),
      update: vi.fn().mockResolvedValue({ id: 'disr-1', status: 'RESOLVED' }),
    },
    inventory: {
      findFirst: vi.fn(),
    },
    productionOrder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    supplier: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    purchaseOrder: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    recoveryPlan: {
      create: vi.fn().mockResolvedValue({ id: 'rp-new-1' }),
    },
    approvalRequest: {
      create: vi.fn().mockResolvedValue({ id: 'appr-new-1' }),
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
    },
  },
}));

import { prisma } from '../src/db/prisma.js';
import { runDisruptionAgent } from '../src/agent/agent.js';
import { buildAgentGraph } from '../src/agent/graph.js';

// ---- Fixtures ----
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

const mockProd882 = {
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
};

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

const mockSup18 = {
  id: 'sup-18-id',
  code: 'SUP-18',
  name: 'CheapParts Manufacturing',
  contactEmail: 'sales@cheapparts.com',
  contactPhone: '+84-28',
  tier: 3,
  reliabilityScore: 0.88,
  leadTimeDaysAvg: 1,
  iso9001Certified: false, // NON-COMPLIANT
  unitPrice: 85.0,
  availableCapacity: 600,
  address: 'Vietnam',
  country: 'Vietnam',
  status: 'ACTIVE',
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Supply Chain Disruption Control Agent (LangGraph)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLLMResponseHandler = (messages: Array<{ content: string }>) => {
      const lastMsg = messages[messages.length - 1]?.content || '';
      if (lastMsg.includes('calculateRecoveryPlan') || lastMsg.includes('selectedPlanId')) {
        return {
          content: JSON.stringify({
            selectedPlanId: 'PLAN-SOLO-SUP-37',
            reasoning: 'SUP-37 is ISO-9001 certified, can fulfill 280 units in 3 days within budget ($40,600).',
          }),
        };
      }
      return { content: 'Acknowledged and analyzed successfully.' };
    };

    // Default mock setup for successful happy path
    vi.mocked(prisma.inventory.findFirst).mockResolvedValue(mockInventoryComp104);
    vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([mockProd882 as never]);
    vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(mockPO7712 as never);
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([mockSup37, mockSup42, mockSup18]);
    vi.mocked(prisma.supplier.findFirst).mockImplementation(async (args) => {
      const code = (args as { where: { code?: string } })?.where?.code;
      if (code === 'SUP-37') return mockSup37;
      if (code === 'SUP-42') return mockSup42;
      if (code === 'SUP-18') return mockSup18;
      return mockSup37;
    });
    vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
      id: 'po-rec-1',
      poNumber: 'PO-REC001',
      supplierId: mockSup37.id,
      status: 'ISSUED',
      quantity: 280,
      unitPrice: 145.0,
      totalAmount: 40600.0,
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
  });

  it('compiles the LangGraph StateGraph without error', () => {
    const graph = buildAgentGraph();
    expect(graph).toBeDefined();
  });

  it('executes full autonomous recovery when plan is valid and under budget limit', async () => {
    const trigger = {
      purchaseOrderId: 'PO-7712',
      supplierId: 'SUP-21',
      componentId: 'COMP-104',
      claimedDelayDays: 5,
    };

    const result = await runDisruptionAgent(trigger);

    expect(result.finalStatus).toBe('MITIGATED');
    expect(result.supplierClaimContradicted).toBe(true);
    expect(result.inventoryStatus?.quantity).toBe(420);
    expect(result.productionRisk?.shortfallUnits).toBe(280);
    expect(result.rejectedSuppliers.some((s) => s.supplierCode === 'SUP-18')).toBe(true);
    expect(result.selectedPlan).not.toBeNull();
    expect(result.constraintResult?.allowed).toBe(true);
    expect(result.approvalRequired).toBe(false);
    expect(result.executionResult?.success).toBe(true);
    expect(result.executionResult?.purchaseOrder?.poNumber).toBe('PO-REC001');
    expect(result.toolCallLog.length).toBeGreaterThanOrEqual(6);
    expect(result.auditLogIds.length).toBeGreaterThanOrEqual(2);
  });

  it('detects uncertified suppliers and discards them into rejectedSuppliers', async () => {
    const trigger = {
      purchaseOrderId: 'PO-7712',
      supplierId: 'SUP-21',
      componentId: 'COMP-104',
      claimedDelayDays: 5,
    };

    const result = await runDisruptionAgent(trigger);

    const rejectedSup18 = result.rejectedSuppliers.find((s) => s.supplierCode === 'SUP-18');
    expect(rejectedSup18).toBeDefined();
    expect(rejectedSup18?.violations[0].rule).toBe('ISO_9001');
  });

  it('stops and routes to PENDING_APPROVAL when recovery plan exceeds $150,000 budget', async () => {
    mockLLMResponseHandler = (messages: Array<{ content: string }>) => {
      const lastMsg = messages[messages.length - 1]?.content || '';
      if (lastMsg.includes('calculateRecoveryPlan') || lastMsg.includes('selectedPlanId')) {
        return {
          content: JSON.stringify({
            selectedPlanId: 'PLAN-EXPENSIVE',
            reasoning: 'Need 700 units at high price exceeding $150,000.',
          }),
        };
      }
      return { content: 'OK' };
    };

    // Custom supplier with high price $600 x 280 = $168,000 > $150,000
    const mockExpensiveSup = {
      ...mockSup42,
      code: 'SUP-EXPENSIVE',
      unitPrice: 600.0,
      availableCapacity: 600,
    };

    vi.mocked(prisma.supplier.findMany).mockResolvedValue([mockExpensiveSup]);
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockExpensiveSup);

    const trigger = {
      purchaseOrderId: 'PO-7712',
      supplierId: 'SUP-21',
      componentId: 'COMP-104',
      claimedDelayDays: 5,
    };

    const result = await runDisruptionAgent(trigger);

    expect(result.approvalRequired).toBe(true);
    expect(result.finalStatus).toBe('PENDING_APPROVAL');
    expect(result.executionResult).toBeNull();
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
    expect(prisma.approvalRequest.create).toHaveBeenCalled();
  });

  it('resumes execution and creates purchase order when human approval ID is provided', async () => {
    vi.mocked(prisma.approvalRequest.findFirst).mockResolvedValue({
      id: 'appr-granted-123',
      status: 'APPROVED',
    } as never);

    const trigger = {
      purchaseOrderId: 'PO-7712',
      supplierId: 'SUP-21',
      componentId: 'COMP-104',
      claimedDelayDays: 5,
    };

    const result = await runDisruptionAgent(trigger, 'appr-granted-123');

    expect(result.finalStatus).toBe('MITIGATED');
    expect(result.executionResult?.success).toBe(true);
  });
});
