// ==========================================
// Approval Service & Routes Unit Tests
// ==========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock Prisma ----
vi.mock('../src/db/prisma.js', () => ({
  prisma: {
    approvalRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    recoveryPlan: {
      create: vi.fn().mockResolvedValue({ id: 'rp-1' }),
      update: vi.fn().mockResolvedValue({ id: 'rp-1' }),
    },
    disruptionEvent: {
      create: vi.fn().mockResolvedValue({ id: 'disr-1' }),
      update: vi.fn().mockResolvedValue({ id: 'disr-1' }),
    },
    supplier: {
      findFirst: vi.fn(),
    },
    purchaseOrder: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
    },
  },
}));

import { prisma } from '../src/db/prisma.js';
import {
  listApprovals,
  getApprovalById,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
} from '../src/services/approvalService.js';
import { buildApp } from '../src/app.js';

// ---- Fixtures ----
const mockSupplier = {
  id: 'sup-expensive-id',
  code: 'SUP-EXPENSIVE',
  name: 'Rapid High-Cost Supplier',
  leadTimeDaysAvg: 1,
  iso9001Certified: true,
  availableCapacity: 600,
  reliabilityScore: 0.95,
  unitPrice: 600.0,
};

const mockApprovalRequest = {
  id: 'appr-req-123',
  recoveryPlanId: 'rp-123',
  actionType: 'EXECUTE_RECOVERY_PURCHASE',
  requiredRole: 'OPERATIONS_MANAGER',
  status: 'PENDING',
  riskLevel: 'HIGH',
  payload: {
    status: 'pending',
    recoveryCost: 168000,
    autonomousLimit: 150000,
    overageAmount: 18000,
    reason: 'Recovery cost ($168,000) exceeds autonomous execution limit ($150,000)',
    disruption: {
      title: 'Disruption on PO: PO-7712',
      description: 'Supplier claimed delay of 5 days',
      severity: 'HIGH',
      affectedPoIds: ['PO-7712'],
      affectedSkuIds: ['COMP-104'],
      estimatedDelayDays: 5,
      impactScore: 90,
    },
    productionRisk: {
      componentSku: 'COMP-104',
      currentStock: 420,
      daysOfCoverage: 4.2,
      totalRequiredQuantity: 700,
      shortfallUnits: 280,
      deadlineDays: 4,
      riskLevel: 'HIGH',
      riskReason: 'Factory line stoppage imminent.',
    },
    supplierVerificationResult: {
      purchaseOrderId: 'PO-7712',
      supplierClaimStatus: 'Shipment dispatched',
      latestCarrierEventType: 'NO_LABEL_CREATED',
      hasContradiction: true,
      contradictionDetails: {
        supplierClaim: 'Shipment dispatched',
        carrierStatus: 'NO_LABEL_CREATED',
        explanation: 'Contradiction detected',
      },
    },
    recoveryPlan: {
      planId: 'PLAN-EXPENSIVE',
      description: 'Emergency expedited procurement via SUP-EXPENSIVE',
      actions: [
        {
          supplierId: 'sup-expensive-id',
          supplierCode: 'SUP-EXPENSIVE',
          quantityOrdered: 280,
          unitPrice: 600.0,
          estimatedLeadTimeDays: 1,
        },
      ],
      totalQuantity: 280,
      totalCostUSD: 168000,
      fastestDeliveryDays: 1,
    },
    constraintViolations: [
      {
        rule: 'AUTONOMOUS_BUDGET',
        message: 'Recovery cost ($168,000.00) exceeds autonomous limit ($150,000.00). Human approval is required.',
      },
    ],
  },
  approverNotes: null,
  requestedAt: new Date(),
  respondedAt: null,
  respondedBy: null,
  recoveryPlan: {
    id: 'rp-123',
    disruptionEventId: 'disr-123',
    title: 'Emergency expedited procurement via SUP-EXPENSIVE',
    status: 'PENDING_APPROVAL',
    strategySummary: 'Need 280 units urgently',
    proposedActions: [],
    costEstimate: 168000,
    timeRecoveryDays: 1,
    recommendedBy: 'AI_AGENT',
    disruptionEvent: {
      id: 'disr-123',
      title: 'Disruption on PO: PO-7712',
      status: 'ANALYZING',
    },
  },
};

describe('Human-in-the-Loop Approval Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createApprovalRequest', () => {
    it('creates an approval request with structured operational payload', async () => {
      vi.mocked(prisma.recoveryPlan.create).mockResolvedValue({
        id: 'rp-new-1',
        disruptionEventId: 'disr-123',
        title: 'Emergency recovery',
        status: 'PENDING_APPROVAL',
        strategySummary: 'Need 280 units',
        proposedActions: [],
        costEstimate: 168000,
        currency: 'USD',
        riskScore: 0,
        timeRecoveryDays: 1,
        recommendedBy: 'AI_AGENT',
        approvedBy: null,
        executedAt: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.approvalRequest.create).mockResolvedValue(mockApprovalRequest as never);

      const result = await createApprovalRequest({
        disruptionEventId: 'disr-123',
        disruption: mockApprovalRequest.payload.disruption,
        productionRisk: mockApprovalRequest.payload.productionRisk,
        supplierVerificationResult: mockApprovalRequest.payload.supplierVerificationResult,
        recoveryPlan: mockApprovalRequest.payload.recoveryPlan,
        totalCostUSD: 168000,
        autonomousBudgetUSD: 150000,
        constraintViolations: mockApprovalRequest.payload.constraintViolations,
      });

      expect(result.id).toBe('appr-req-123');
      expect(prisma.approvalRequest.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('listApprovals', () => {
    it('returns all approval requests', async () => {
      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValue([mockApprovalRequest as never]);

      const list = await listApprovals();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('appr-req-123');
    });

    it('filters by status when provided', async () => {
      vi.mocked(prisma.approvalRequest.findMany).mockResolvedValue([]);
      await listApprovals({ status: 'PENDING' });
      expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
        })
      );
    });
  });

  describe('getApprovalById', () => {
    it('returns approval request by id', async () => {
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(mockApprovalRequest as never);
      const app = await getApprovalById('appr-req-123');
      expect(app?.id).toBe('appr-req-123');
    });

    it('returns null when id does not exist', async () => {
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(null);
      const app = await getApprovalById('non-existent');
      expect(app).toBeNull();
    });
  });

  describe('approveRequest', () => {
    it('approves the request, creates purchase order, and writes audit logs', async () => {
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(mockApprovalRequest as never);
      vi.mocked(prisma.approvalRequest.findFirst).mockResolvedValue({
        ...mockApprovalRequest,
        status: 'APPROVED',
      } as never);
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({
        ...mockApprovalRequest,
        status: 'APPROVED',
        respondedBy: 'Chief Supply Officer',
      } as never);
      vi.mocked(prisma.recoveryPlan.update).mockResolvedValue({
        id: 'rp-123',
        status: 'APPROVED',
      } as never);
      vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSupplier as never);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: 'po-approved-1',
        poNumber: 'PO-APPR001',
        supplierId: mockSupplier.id,
        status: 'ISSUED',
        quantity: 280,
        unitPrice: 600,
        totalAmount: 168000,
        currency: 'USD',
        orderDate: new Date(),
        expectedDeliveryDate: new Date(Date.now() + 86400000),
        actualDeliveryDate: null,
        supplierClaimStatus: 'Order issued',
        supplierClaimNotes: null,
        lineItems: [],
        notes: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await approveRequest('appr-req-123', {
        userName: 'Chief Supply Officer',
        notes: 'Approved due to critical line shutdown risk.',
      });

      expect(result.success).toBe(true);
      expect(result.approval.status).toBe('APPROVED');
      expect(prisma.purchaseOrder.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws error if approval request is not found', async () => {
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(null);
      await expect(approveRequest('missing-id')).rejects.toThrow(/not found/);
    });

    it('throws error if approval request is not in PENDING status', async () => {
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue({
        ...mockApprovalRequest,
        status: 'APPROVED',
      } as never);
      await expect(approveRequest('appr-req-123')).rejects.toThrow(/already APPROVED/);
    });
  });

  describe('rejectRequest', () => {
    it('marks request as REJECTED and creates audit log without creating PO', async () => {
      vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(mockApprovalRequest as never);
      vi.mocked(prisma.approvalRequest.update).mockResolvedValue({
        ...mockApprovalRequest,
        status: 'REJECTED',
        respondedBy: 'Finance Director',
      } as never);
      vi.mocked(prisma.recoveryPlan.update).mockResolvedValue({
        id: 'rp-123',
        status: 'REJECTED',
      } as never);

      const result = await rejectRequest('appr-req-123', {
        userName: 'Finance Director',
        notes: 'Cost is too high, evaluate alternative production schedules instead.',
      });

      expect(result.success).toBe(true);
      expect(result.approval.status).toBe('REJECTED');
      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});

describe('Human-in-the-Loop Approval Endpoints (Fastify Routes)', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/approvals returns list of approvals', async () => {
    vi.mocked(prisma.approvalRequest.findMany).mockResolvedValue([mockApprovalRequest as never]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/approvals',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(body.approvals[0].id).toBe('appr-req-123');
  });

  it('GET /api/approvals/:id returns 404 for unknown approval', async () => {
    vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/approvals/non-existent-id',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('POST /api/approvals/:id/approve executes approved action', async () => {
    vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(mockApprovalRequest as never);
    vi.mocked(prisma.approvalRequest.findFirst).mockResolvedValue({
      ...mockApprovalRequest,
      status: 'APPROVED',
    } as never);
    vi.mocked(prisma.approvalRequest.update).mockResolvedValue({
      ...mockApprovalRequest,
      status: 'APPROVED',
      respondedBy: 'Plant Manager',
    } as never);
    vi.mocked(prisma.recoveryPlan.update).mockResolvedValue({ id: 'rp-123', status: 'APPROVED' } as never);
    vi.mocked(prisma.supplier.findFirst).mockResolvedValue(mockSupplier as never);
    vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
      id: 'po-1',
      poNumber: 'PO-APPR001',
      supplierId: mockSupplier.id,
      status: 'ISSUED',
      quantity: 280,
      unitPrice: 600,
      totalAmount: 168000,
      currency: 'USD',
      orderDate: new Date(),
      expectedDeliveryDate: new Date(),
      actualDeliveryDate: null,
      supplierClaimStatus: null,
      supplierClaimNotes: null,
      lineItems: [],
      notes: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/approvals/appr-req-123/approve',
      payload: {
        userName: 'Plant Manager',
        notes: 'Emergency authorization granted.',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.result.approval.status).toBe('APPROVED');
  });

  it('POST /api/approvals/:id/reject rejects the plan', async () => {
    vi.mocked(prisma.approvalRequest.findUnique).mockResolvedValue(mockApprovalRequest as never);
    vi.mocked(prisma.approvalRequest.update).mockResolvedValue({
      ...mockApprovalRequest,
      status: 'REJECTED',
      respondedBy: 'VP Operations',
    } as never);
    vi.mocked(prisma.recoveryPlan.update).mockResolvedValue({ id: 'rp-123', status: 'REJECTED' } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/approvals/appr-req-123/reject',
      payload: {
        userName: 'VP Operations',
        notes: 'Too expensive, investigate alternatives.',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.result.approval.status).toBe('REJECTED');
  });
});
