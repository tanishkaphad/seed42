import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { seedGoldenScenario, closePool } from '../src/sim/database.js';
import { parseInboundEmailWithGroq } from '../src/llm/parser.js';
import { processInboundEmail } from '../src/agent/inboxLoop.js';
import { createSupplier } from '../src/sim/suppliers.js';

describe('inbound supplier mail loop', () => {
  beforeAll(async () => {
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('parses confirmation, price, and delivery from free text', async () => {
    const signal = await parseInboundEmailWithGroq(
      'We confirm the deal for COMP-104. Unit price ₹132. Delivery in 4 days. Happy to proceed.',
      'RE: Shortage cover',
      'supplier42@example.com'
    );
    expect(signal.component_id).toBe('COMP-104');
    expect(signal.deal_intent).toBe('confirm');
    expect(signal.classification).toBe('confirmed');
    expect(signal.quoted_unit_price).toBe(132);
    expect(signal.stated_delivery_days).toBe(4);
  });

  it('executes an approved confirmed deal from a known contact', async () => {
    const result = await processInboundEmail({
      from: 'Western Components <supplier42@example.com>',
      subject: 'RE: Shortage cover COMP-104',
      text: 'We confirm the deal for COMP-104. Unit price ₹132. Delivery in 4 days. We accept the order.',
    });
    expect(result.status).toBe('execute');
    expect(result.supplier?.supplier_id).toBe('SUP-42');
    expect(result.audit_id).toMatch(/^AUD-/);
    expect(result.paymentStatus).toMatch(/simulated_paid|waiting_approval/);
  });

  it('escalates mail from an unknown mailbox', async () => {
    const result = await processInboundEmail({
      from: 'stranger@not-in-directory.test',
      subject: 'Quote',
      text: 'We confirm COMP-104.',
    });
    expect(result.status).toBe('escalated');
  });

  it('stores a newly added contact mailbox', async () => {
    const created = await createSupplier({
      supplier_name: 'Live Desk Supplier',
      email: `live-desk-${Date.now()}@mailbox.test`,
    });
    expect(created.supplier_id).toMatch(/^SUP-USR-/);
    expect(created.email).toContain('@mailbox.test');
  });
});
