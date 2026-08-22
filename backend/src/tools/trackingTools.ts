// ==========================================
// Tracking Tools
// ==========================================
// Reads simulated carrier tracking events from the database.
// Intentionally exposes the PO-7712 / SUP-21 contradiction.

import { z } from 'zod';
import { prisma } from '../db/prisma.js';

// ---- Schemas ----

export const VerifyTrackingInputSchema = z.object({
  purchaseOrderId: z.string().min(1, 'purchaseOrderId is required'),
});
export type VerifyTrackingInput = z.infer<typeof VerifyTrackingInputSchema>;

export const TrackingEventSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  status: z.string(),
  location: z.string().nullable(),
  carrier: z.string().nullable(),
  notes: z.string().nullable(),
  eventTimestamp: z.string(), // ISO string
  rawData: z.unknown(),
});

export const VerifyTrackingOutputSchema = z.object({
  found: z.boolean(),
  purchaseOrderId: z.string(),
  poNumber: z.string().nullable(),
  supplierClaimStatus: z.string().nullable(),
  supplierClaimNotes: z.string().nullable(),
  latestCarrierStatus: z.string().nullable(),
  latestCarrierEventType: z.string().nullable(),
  hasContradiction: z.boolean(),
  contradictionDetails: z
    .object({
      supplierClaim: z.string(),
      carrierStatus: z.string(),
      explanation: z.string(),
    })
    .nullable(),
  trackingEvents: z.array(TrackingEventSchema),
});
export type VerifyTrackingOutput = z.infer<typeof VerifyTrackingOutputSchema>;

/**
 * verifyTracking
 *
 * Returns actual carrier-side tracking events for a purchase order,
 * and flags any contradiction between the supplier's claim and the
 * real carrier status.
 *
 * Key scenario: PO-7712 supplier claims "Dispatched" but carrier reports
 * "NO_LABEL_CREATED" — this is the contradiction the agent must detect.
 */
export async function verifyTracking(
  input: VerifyTrackingInput
): Promise<VerifyTrackingOutput> {
  VerifyTrackingInputSchema.parse(input);

  const po = await prisma.purchaseOrder.findFirst({
    where: {
      OR: [{ id: input.purchaseOrderId }, { poNumber: input.purchaseOrderId }],
    },
    include: {
      trackingEvents: {
        orderBy: { eventTimestamp: 'desc' },
      },
    },
  });

  if (!po) {
    return {
      found: false,
      purchaseOrderId: input.purchaseOrderId,
      poNumber: null,
      supplierClaimStatus: null,
      supplierClaimNotes: null,
      latestCarrierStatus: null,
      latestCarrierEventType: null,
      hasContradiction: false,
      contradictionDetails: null,
      trackingEvents: [],
    };
  }

  const latestEvent = po.trackingEvents[0] ?? null;

  // Contradiction detection: supplier claims dispatch but carrier has no record
  const CLAIM_SUGGESTS_MOVEMENT = ['dispatched', 'shipped', 'in transit', 'picked up'];
  const CARRIER_NO_MOVEMENT = ['NO_LABEL_CREATED', 'CARRIER_MANIFEST_EXCEPTION', 'EXCEPTION'];

  const supplierClaimLower = (po.supplierClaimStatus ?? '').toLowerCase();
  const carrierEventType = latestEvent?.eventType ?? '';

  const hasContradiction =
    CLAIM_SUGGESTS_MOVEMENT.some((kw) => supplierClaimLower.includes(kw)) &&
    CARRIER_NO_MOVEMENT.some((kw) => carrierEventType.includes(kw));

  const contradictionDetails = hasContradiction
    ? {
        supplierClaim: po.supplierClaimStatus ?? '',
        carrierStatus: latestEvent?.status ?? '',
        explanation: `Supplier claims "${po.supplierClaimStatus}" but the carrier has status "${latestEvent?.eventType}". No physical shipment movement has been confirmed.`,
      }
    : null;

  return VerifyTrackingOutputSchema.parse({
    found: true,
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    supplierClaimStatus: po.supplierClaimStatus,
    supplierClaimNotes: po.supplierClaimNotes,
    latestCarrierStatus: latestEvent?.status ?? null,
    latestCarrierEventType: latestEvent?.eventType ?? null,
    hasContradiction,
    contradictionDetails,
    trackingEvents: po.trackingEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      status: e.status,
      location: e.location,
      carrier: e.carrier,
      notes: e.notes,
      eventTimestamp: e.eventTimestamp.toISOString(),
      rawData: e.rawData,
    })),
  });
}
