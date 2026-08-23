import { describe, it, expect } from 'vitest';
import { decideFromRules } from '../src/agent/escalation.js';
import type { ParsedEmailSignal } from '../src/llm/parser.js';

const base: ParsedEmailSignal = {
  affected_po_id: 'PO-7712',
  component_id: 'COMP-104',
  rfq_id: null,
  reported_delay_days: null,
  quoted_unit_price: 132,
  quoted_quantity: null,
  stated_delivery_days: 4,
  deal_intent: 'confirm',
  disruption_cause: 'None',
  classification: 'confirmed',
  summary: 'Supplier said yes',
};

describe('escalation rules', () => {
  it('does not execute on a supplier YES without deal context', () => {
    expect(
      decideFromRules({
        signal: base,
        risks: [],
        componentId: 'COMP-104',
        dealContext: false,
      })
    ).toBe('negotiate');
  });

  it('escalates when business risks remain after a confirmation', () => {
    expect(
      decideFromRules({
        signal: base,
        risks: ['Missing required certification'],
        componentId: 'COMP-104',
        dealContext: true,
      })
    ).toBe('escalate');
  });

  it('allows execute only when confirmed, in context, and clean', () => {
    expect(
      decideFromRules({
        signal: base,
        risks: [],
        componentId: 'COMP-104',
        dealContext: true,
      })
    ).toBe('execute');
  });
});
