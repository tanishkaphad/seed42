// ==========================================
// Supplier Tools
// ==========================================
// Read-only queries against the simulated supplier database.

import { z } from 'zod';
import { prisma } from '../db/prisma.js';

// ---- Shared Supplier Schema ----

export const SupplierRecordSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  country: z.string(),
  tier: z.number(),
  iso9001Certified: z.boolean(),
  availableCapacity: z.number(),
  unitPrice: z.number(),
  leadTimeDaysAvg: z.number(),
  reliabilityScore: z.number(),
  status: z.string(),
  isEligible: z.boolean(),
  ineligibilityReason: z.string().nullable(),
});
export type SupplierRecord = z.infer<typeof SupplierRecordSchema>;

// ---- getSupplier ----

export const GetSupplierInputSchema = z.object({
  supplierId: z.string().min(1, 'supplierId is required'),
});
export type GetSupplierInput = z.infer<typeof GetSupplierInputSchema>;

export const GetSupplierOutputSchema = z.object({
  found: z.boolean(),
  supplier: SupplierRecordSchema.nullable(),
});
export type GetSupplierOutput = z.infer<typeof GetSupplierOutputSchema>;

function mapToSupplierRecord(
  s: {
    id: string;
    code: string;
    name: string;
    country: string;
    tier: number;
    iso9001Certified: boolean;
    availableCapacity: number;
    unitPrice: number;
    leadTimeDaysAvg: number;
    reliabilityScore: number;
    status: string;
  }
): SupplierRecord {
  const isEligible = s.iso9001Certified && s.availableCapacity > 0;
  const ineligibilityReason = !s.iso9001Certified
    ? 'Missing mandatory ISO-9001 certification'
    : s.availableCapacity === 0
    ? 'Zero available capacity'
    : null;

  return {
    id: s.id,
    code: s.code,
    name: s.name,
    country: s.country,
    tier: s.tier,
    iso9001Certified: s.iso9001Certified,
    availableCapacity: s.availableCapacity,
    unitPrice: s.unitPrice,
    leadTimeDaysAvg: s.leadTimeDaysAvg,
    reliabilityScore: s.reliabilityScore,
    status: s.status,
    isEligible,
    ineligibilityReason,
  };
}

/**
 * getSupplier
 *
 * Returns full supplier profile for a given supplier ID or code (e.g. "SUP-37").
 */
export async function getSupplier(input: GetSupplierInput): Promise<GetSupplierOutput> {
  GetSupplierInputSchema.parse(input);

  const s = await prisma.supplier.findFirst({
    where: {
      OR: [{ id: input.supplierId }, { code: input.supplierId }],
    },
  });

  if (!s) {
    return { found: false, supplier: null };
  }

  return GetSupplierOutputSchema.parse({
    found: true,
    supplier: mapToSupplierRecord(s),
  });
}

// ---- findAlternativeSuppliers ----

export const FindAlternativeSuppliersInputSchema = z.object({
  componentId: z.string().min(1),
  requiredQuantity: z.number().int().positive(),
  excludeSupplierCodes: z.array(z.string()).optional().default([]),
});
export type FindAlternativeSuppliersInput = z.infer<typeof FindAlternativeSuppliersInputSchema>;

export const FindAlternativeSuppliersOutputSchema = z.object({
  totalFound: z.number(),
  eligibleCount: z.number(),
  suppliers: z.array(
    SupplierRecordSchema.extend({
      canFulfillAlone: z.boolean(),
      estimatedCostUSD: z.number(),
    })
  ),
});
export type FindAlternativeSuppliersOutput = z.infer<typeof FindAlternativeSuppliersOutputSchema>;

/**
 * findAlternativeSuppliers
 *
 * Returns all active suppliers, annotated with eligibility status
 * and whether they can individually fulfil the required quantity.
 * The agent uses this to build recovery plan candidates.
 * Actual validation is deferred to the Constraint Engine.
 */
export async function findAlternativeSuppliers(
  input: FindAlternativeSuppliersInput
): Promise<FindAlternativeSuppliersOutput> {
  FindAlternativeSuppliersInputSchema.parse(input);

  const allSuppliers = await prisma.supplier.findMany({
    where: {
      status: 'ACTIVE',
      code: { notIn: input.excludeSupplierCodes },
    },
    orderBy: [{ reliabilityScore: 'desc' }],
  });

  const annotated = allSuppliers.map((s) => {
    const record = mapToSupplierRecord(s);
    return {
      ...record,
      canFulfillAlone: record.isEligible && s.availableCapacity >= input.requiredQuantity,
      estimatedCostUSD: Math.round(s.availableCapacity * s.unitPrice * 100) / 100,
    };
  });

  const eligibleCount = annotated.filter((s) => s.isEligible).length;

  return FindAlternativeSuppliersOutputSchema.parse({
    totalFound: annotated.length,
    eligibleCount,
    suppliers: annotated,
  });
}
