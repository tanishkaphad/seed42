// ==========================================
// Audit Tools
// ==========================================
// Every significant agent or system action must be persisted here.

import { z } from 'zod';
import { prisma } from '../db/prisma.js';

// ---- Schemas ----

export const WriteAuditLogInputSchema = z.object({
  action: z.string().min(1),
  actorType: z.enum(['AGENT', 'USER', 'SYSTEM']),
  actorId: z.string().optional(),
  targetEntity: z.string().min(1),
  targetEntityId: z.string().optional(),
  previousState: z.unknown().optional(),
  newState: z.unknown().optional(),
  reasoning: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type WriteAuditLogInput = z.infer<typeof WriteAuditLogInputSchema>;

export const WriteAuditLogOutputSchema = z.object({
  success: z.boolean(),
  auditLogId: z.string().nullable(),
  message: z.string(),
});
export type WriteAuditLogOutput = z.infer<typeof WriteAuditLogOutputSchema>;

/**
 * writeAuditLog
 *
 * Persists a structured audit record for any significant action taken by
 * the agent, a user, or the system.
 *
 * Every tool call that changes state (createPurchaseOrder, updateProductionRisk,
 * any recovery plan approval) MUST call this.
 */
export async function writeAuditLog(
  input: WriteAuditLogInput
): Promise<WriteAuditLogOutput> {
  WriteAuditLogInputSchema.parse(input);

  const log = await prisma.auditLog.create({
    data: {
      action: input.action,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      targetEntity: input.targetEntity,
      targetEntityId: input.targetEntityId ?? null,
      previousState: input.previousState !== undefined
        ? (input.previousState as object)
        : undefined,
      newState: input.newState !== undefined
        ? (input.newState as object)
        : undefined,
      reasoning: input.reasoning ?? null,
      metadata: (input.metadata ?? {}) as object,
      timestamp: new Date(),
    },
  });

  return {
    success: true,
    auditLogId: log.id,
    message: `Audit log created: ${input.action} on ${input.targetEntity}${input.targetEntityId ? ' / ' + input.targetEntityId : ''}.`,
  };
}
