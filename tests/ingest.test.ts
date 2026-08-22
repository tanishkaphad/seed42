import { describe, it, expect } from 'vitest';
import { normalizers } from '../src/ingest/normalize.js';
import { generateSupplierResponse } from '../src/sim/messaging.js';

describe('CSV Dynamic Normalizer & Ingestion Layer', () => {
  it('should normalize and validate component rows correctly', () => {
    const rawRows = [
      {
        component_id: 'COMP-101',
        name: 'Power Management Unit',
        description: 'Voltage regulator IC',
        unit_of_measure: 'units',
        criticality: 'critical',
        required_certification: 'Automotive-Grade',
      },
    ];

    const result = normalizers.components(rawRows);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].component_id).toBe('COMP-101');
    expect(result.valid[0].criticality).toBe('critical');
  });

  it('should reject malformed component IDs with helpful error', () => {
    const rawRows = [
      {
        component_id: 'INVALID-ID',
        name: 'Bad Component',
        description: 'Testing failure',
        unit_of_measure: 'units',
        criticality: 'high',
        required_certification: '',
      },
    ];

    const result = normalizers.components(rawRows);
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Must match COMP-NNN');
  });

  it('should parse certifications pipe-separated list to array', () => {
    const rawRows = [
      {
        supplier_component_id: 'SC-01-101',
        supplier_id: 'SUP-01',
        component_id: 'COMP-101',
        unit_price: '245.00',
        lead_time_days: '4',
        available_quantity: '2000',
        minimum_order_quantity: '200',
        certifications: 'Automotive-Grade|IATF-16949',
        expedite_available: 'true',
        expedite_fee: '15000.00',
      },
    ];

    const result = normalizers.supplier_components(rawRows);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].certifications).toEqual(['Automotive-Grade', 'IATF-16949']);
    expect(result.valid[0].unit_price).toBe(245);
    expect(result.valid[0].expedite_available).toBe(true);
  });

  it('should dynamically generate supplier responses via Groq with appropriate classification', async () => {
    const groqModule = await import('../src/llm/groq.js');
    const spy = (await import('vitest')).vi.spyOn(groqModule, 'callGroq').mockImplementation(async (messages: any[]): Promise<string> => {
      const userText = messages.find(m => m.role === 'user')?.content || '';
      const systemText = messages.find(m => m.role === 'system')?.content || '';

      if (systemText.includes('Reliability Score: 0.95')) {
        return JSON.stringify({
          inboundSubject: 'RE: Order Confirmation',
          inboundBody: 'We can confirm this order on schedule.',
          classification: 'confirmed',
        });
      }
      if (systemText.includes('Reliability Score: 0.82')) {
        return JSON.stringify({
          inboundSubject: 'RE: Delay Notice',
          inboundBody: 'Estimated delay of 4 days due to logistics.',
          classification: 'delayed-with-date',
        });
      }
      if (systemText.includes('Reliability Score: 0.6')) {
        return JSON.stringify({
          inboundSubject: 'RE: Under Review',
          inboundBody: 'We are reviewing inventory allocations.',
          classification: 'vague',
        });
      }
      return JSON.stringify({
        inboundSubject: 'RE: Inquiry',
        inboundBody: 'Cannot commit to a timeline.',
        classification: 'contradictory',
      });
    });

    const tier1 = await generateSupplierResponse({ supplier_id: 'SUP-99', reliability_score: 0.95 }, 'PO-1');
    expect(tier1.classification).toBe('confirmed');

    const tier2 = await generateSupplierResponse({ supplier_id: 'SUP-98', reliability_score: 0.82 }, 'PO-2');
    expect(tier2.classification).toBe('delayed-with-date');

    const tier3 = await generateSupplierResponse({ supplier_id: 'SUP-97', reliability_score: 0.60 }, 'PO-3');
    expect(tier3.classification).toBe('vague');

    const tier4 = await generateSupplierResponse({ supplier_id: 'SUP-96', reliability_score: 0.35 }, 'PO-4');
    expect(tier4.classification).toBe('contradictory');

    spy.mockRestore();
  });

  it('should read and parse actual CSV seed files correctly', async () => {
    const { readCsv } = await import('../src/ingest/csv.js');
    const path = await import('path');

    const components = await readCsv(path.resolve(process.cwd(), 'data', 'seed', 'components.csv'));
    expect(components.length).toBe(32);
    expect(components[0].component_id).toBe('COMP-101');

    const suppliers = await readCsv(path.resolve(process.cwd(), 'data', 'seed', 'suppliers.csv'));
    expect(suppliers.length).toBe(15);

    const config = await readCsv(path.resolve(process.cwd(), 'data', 'seed', 'config.csv'));
    expect(config.length).toBeGreaterThanOrEqual(3);
  });
});
