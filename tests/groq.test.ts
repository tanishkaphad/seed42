import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGroq, GroqAPIError } from '../src/llm/groq.js';
import { parseInboundEmailWithGroq } from '../src/llm/parser.js';
import { generateGroqDisruptionBrief } from '../src/llm/reasoner.js';
import * as groqModule from '../src/llm/groq.js';
import * as dbModule from '../src/sim/database.js';
import * as configModule from '../src/sim/config.js';
import { processDisruptionFlow } from '../src/agent/disruptionController.js';

describe('Groq LLM Integration & Zero-Hardcode Policy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw explicit GroqAPIError when GROQ_API_KEY is missing (no silent hardcoded fallback)', async () => {
    const { env } = await import('../src/config/env.js');
    const originalEnvKey = env.GROQ_API_KEY;
    const originalProcessKey = process.env.GROQ_API_KEY;

    (env as any).GROQ_API_KEY = '';
    delete process.env.GROQ_API_KEY;

    try {
      await expect(
        callGroq([{ role: 'user', content: 'test' }])
      ).rejects.toThrow(/GROQ_API_KEY is missing/);
    } finally {
      (env as any).GROQ_API_KEY = originalEnvKey;
      process.env.GROQ_API_KEY = originalProcessKey;
    }
  });

  it('should parse free-form email text into structured parameters via Groq', async () => {
    vi.spyOn(groqModule, 'callGroq').mockResolvedValue(
      JSON.stringify({
        affected_po_id: 'PO-7712',
        component_id: 'COMP-104',
        reported_delay_days: 5,
        disruption_cause: 'Port congestion at Chennai',
        classification: 'delayed-with-date',
        summary: 'Supplier reports 5 day shipment delay due to Chennai port congestion',
      })
    );

    const email = 'Our container on PO-7712 with Motor Driver ICs is stuck at Chennai port. Expected delay is 5 days.';
    const result = await parseInboundEmailWithGroq(email, 'Delay on PO-7712', 'supplier21@example.com');

    expect(result.affected_po_id).toBe('PO-7712');
    expect(result.component_id).toBe('COMP-104');
    expect(result.reported_delay_days).toBe(5);
    expect(result.disruption_cause).toContain('Chennai');
    expect(result.classification).toBe('delayed-with-date');
  });

  it('should perform multi-criteria trade-off reasoning and generate human decision brief via Groq', async () => {
    vi.spyOn(groqModule, 'callGroq').mockResolvedValue(
      JSON.stringify({
        executive_summary: 'Primary PO-7712 delayed by 5 days. Usable stock lasts 4.33 days, so production stoppage will occur on Day 5.',
        human_decision_brief: 'We recommend placing an emergency order with Western Components Ltd (SUP-42) at ₹132/unit (+₹14/unit over baseline). They hold Automotive-Grade certification and can deliver within 4 days, preventing plant downtime.',
        recommended_action: 'place_emergency_order',
        chosen_supplier_id: 'SUP-42',
        chosen_supplier_name: 'Western Components Ltd',
        shipping_mode: 'standard',
        order_quantity: 600,
        estimated_cost: 79200,
        approval_required: false,
      })
    );

    const context = {
      component_id: 'COMP-104',
      component_name: 'Motor Driver IC',
      required_certification: 'Automotive-Grade',
      affected_po_id: 'PO-7712',
      original_supplier_name: 'Original Components Ltd',
      reported_delay_days: 5,
      disruption_cause: 'Port congestion',
      operational_metrics: {
        current_usable_stock: 390,
        daily_usage: 90,
        days_of_coverage: 4.33,
        max_affordable_delay_days: 4.33,
        will_cause_stockout: true,
        stockout_in_days: 4.33,
        production_order_id: 'PROD-882',
        production_deadline: '2026-09-06T00:00:00Z',
        shortfall_quantity: 310,
      },
      alternatives: [
        {
          supplier_id: 'SUP-42',
          supplier_name: 'Western Components Ltd',
          reliability_score: 0.81,
          quality_score: 0.94,
          unit_price: 132,
          price_diff_per_unit_formatted: '+₹14.00 (+11.8%)',
          standard_lead_time_days: 4,
          expedite_available: true,
          expedited_lead_time_days: 2,
          expedite_fee: 12000,
          total_cost_standard: 79200,
          total_cost_expedited: 91200,
          certifications: ['ISO-9001', 'Automotive-Grade'],
          meets_certification: true,
          delivers_before_stockout: true,
        },
      ],
      approval_threshold: 150000,
    };

    const brief = await generateGroqDisruptionBrief(context);
    expect(brief.llm_model).toBeDefined();
    expect(brief.chosen_supplier_id).toBe('SUP-42');
    expect(brief.human_decision_brief).toContain('Western Components Ltd');
    expect(brief.estimated_cost).toBe(79200);
    expect(brief.approval_required).toBe(false);
  });

  it('should run end-to-end disruption flow and output full standardized JSON', async () => {
    vi.spyOn(dbModule, 'query').mockImplementation(async (text: string): Promise<any> => {
      if (text.includes('FROM simulation.purchase_orders WHERE po_id')) {
        return {
          rows: [
            {
              po_id: 'PO-7712',
              component_id: 'COMP-104',
              supplier_id: 'SUP-21',
              unit_price: 118,
              status: 'delayed',
              quantity: 1000,
            },
          ],
        };
      }
      if (text.includes('FROM simulation.components WHERE')) {
        return {
          rows: [
            {
              component_id: 'COMP-104',
              name: 'Motor Driver IC',
              required_certification: 'Automotive-Grade',
            },
          ],
        };
      }
      if (text.includes('FROM simulation.inventory')) {
        return {
          rows: [
            {
              component_id: 'COMP-104',
              usable_stock: 390,
              daily_usage: 90,
              safety_stock: 150,
            },
          ],
        };
      }
      if (text.includes('FROM simulation.production_orders')) {
        return {
          rows: [
            {
              production_order_id: 'PROD-882',
              component_id: 'COMP-104',
              units_planned: 700,
              component_required_per_unit: 1,
              deadline: '2026-09-06T00:00:00Z',
            },
          ],
        };
      }
      if (text.includes('FROM simulation.suppliers WHERE supplier_id')) {
        return {
          rows: [{ supplier_name: 'Original Components Ltd' }],
        };
      }
      if (text.includes('simulation.supplier_components')) {
        return {
          rows: [
            {
              supplier_id: 'SUP-42',
              supplier_name: 'Western Components Ltd',
              reliability_score: 0.81,
              quality_score: 0.94,
              unit_price: 132.0,
              lead_time_days: 4,
              available_quantity: 700,
              minimum_order_quantity: 300,
              certifications: ['ISO-9001', 'Automotive-Grade'],
              expedite_available: true,
              expedite_fee: 12000.0,
              has_required_certification: true,
            },
            {
              supplier_id: 'SUP-18',
              supplier_name: 'Budget Electronics',
              reliability_score: 0.65,
              quality_score: 0.75,
              unit_price: 110.0,
              lead_time_days: 3,
              available_quantity: 1000,
              minimum_order_quantity: 200,
              certifications: ['ISO-9001'],
              expedite_available: true,
              expedite_fee: 0,
              has_required_certification: false,
            },
          ],
        };
      }
      return { rows: [] };
    });

    vi.spyOn(configModule, 'getConfigValue').mockResolvedValue('150000');

    vi.spyOn(groqModule, 'callGroq').mockImplementation(async (messages: any[]): Promise<string> => {
      const systemText = messages.find(m => m.role === 'system')?.content || '';
      if (systemText.includes('Inbound Message Intelligence')) {
        return JSON.stringify({
          affected_po_id: 'PO-7712',
          component_id: 'COMP-104',
          reported_delay_days: 5,
          disruption_cause: 'Port congestion at Chennai',
          classification: 'delayed-with-date',
          summary: '5 day delay reported on PO-7712',
        });
      }
      return JSON.stringify({
        executive_summary: 'Primary PO-7712 delayed by 5 days. Line stoppage expected in 4.33 days.',
        human_decision_brief: 'Supplier SUP-21 reports 5-day delay. We can afford only 4.33 days. SUP-18 is disqualified for lack of certification. SUP-42 is recommended with 4-day delivery at ₹79,200.',
        recommended_action: 'place_emergency_order',
        chosen_supplier_id: 'SUP-42',
        chosen_supplier_name: 'Western Components Ltd',
        shipping_mode: 'standard',
        order_quantity: 310,
        estimated_cost: 40920,
        approval_required: false,
      });
    });

    const report = await processDisruptionFlow({
      email_body: 'PO-7712 is delayed by 5 days due to Chennai port congestion.',
      subject: 'Delay on PO-7712',
    });

    expect(report.status).toBe('success');
    expect(report.inbound_signal.extracted_data.affected_po_id).toBe('PO-7712');
    expect(report.inventory_and_buffer_analysis.days_of_coverage).toBe(4.33);
    expect(report.inventory_and_buffer_analysis.max_affordable_delay_days).toBe(4.33);
    expect(report.inventory_and_buffer_analysis.will_cause_production_shutdown).toBe(true);

    // Rate difference comparison verified
    const sup42 = report.market_supplier_comparison.alternative_options.find(o => o.supplier_id === 'SUP-42');
    expect(sup42?.price_difference_per_unit).toContain('+₹14.00');
    expect(sup42?.meets_certification).toBe(true);

    const sup18 = report.market_supplier_comparison.alternative_options.find(o => o.supplier_id === 'SUP-18');
    expect(sup18?.meets_certification).toBe(false);
    expect(sup18?.disqualification_reason).toContain('Automotive-Grade');

    expect(report.groq_reasoning_and_recommendation.human_decision_brief).toContain('SUP-42 is recommended');
  });
});
