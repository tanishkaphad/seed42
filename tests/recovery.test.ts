import { describe, it, expect, vi } from 'vitest';
import * as dbModule from '../src/sim/database.js';
import * as configModule from '../src/sim/config.js';
import { evaluateDisruption } from '../src/sim/recovery.js';

describe('Autonomous Recovery Decision Engine', () => {
  it('should compute operational metrics and filter non-certified suppliers', async () => {
    // Mock query calls
    vi.spyOn(dbModule, 'query').mockImplementation(async (text: string, params?: any[]): Promise<any> => {
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
      if (text.includes('FROM simulation.purchase_orders')) {
        return {
          rows: [
            {
              po_id: 'PO-7712',
              supplier_id: 'SUP-21',
              status: 'delayed',
              quantity: 1000,
            },
          ],
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
              supplier_id: 'SUP-37',
              supplier_name: 'Precision Components Pvt Ltd',
              reliability_score: 0.95,
              quality_score: 0.97,
              unit_price: 128.0,
              lead_time_days: 6,
              available_quantity: 1200,
              minimum_order_quantity: 300,
              certifications: ['ISO-9001', 'Automotive-Grade'],
              expedite_available: false,
              expedite_fee: 0,
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
              has_required_certification: false, // lacks Automotive-Grade
            },
          ],
        };
      }
      return { rows: [] };
    });

    vi.spyOn(configModule, 'getConfigValue').mockResolvedValue('150000');

    const result = await evaluateDisruption({
      component_id: 'COMP-104',
      reported_delay_days: 5,
      po_id: 'PO-7712',
      order_quantity: 600,
    });

    expect(result.status).toBe('evaluated');
    expect(result.disruption.component_id).toBe('COMP-104');
    expect(result.disruption.affected_po_id).toBe('PO-7712');

    // Operational metrics: 390 / 90 = 4.33 days DOC
    expect(result.operational_metrics.days_of_coverage).toBe(4.33);
    expect(result.operational_metrics.max_affordable_delay_days).toBe(4.33);
    expect(result.operational_metrics.will_cause_stockout).toBe(true);

    // Fallbacks
    expect(result.fallbacks.total_options_found).toBe(3);
    expect(result.fallbacks.qualified_options).toHaveLength(2);
    expect(result.fallbacks.disqualified_options).toHaveLength(1);
    expect(result.fallbacks.disqualified_options[0].supplier_id).toBe('SUP-18');
    expect(result.fallbacks.disqualified_options[0].reason).toContain('Automotive-Grade');

    // Recommendation: SUP-42 delivers in 4 days (<= 4.33 days DOC)
    expect(result.recommendation.action).toBe('place_emergency_order');
    expect(result.recommendation.chosen_supplier_id).toBe('SUP-42');
    expect(result.recommendation.shipping_mode).toBe('standard');
    expect(result.recommendation.estimated_cost).toBe(79200); // 600 * 132
    expect(result.recommendation.approval_required).toBe(false); // 79200 <= 150000
    expect(result.recommendation.justification).toContain('Western Components Ltd');
  });

  it('should flag approval_required when emergency procurement exceeds threshold', async () => {
    vi.spyOn(configModule, 'getConfigValue').mockResolvedValue('50000'); // low threshold

    const result = await evaluateDisruption({
      component_id: 'COMP-104',
      reported_delay_days: 5,
      po_id: 'PO-7712',
      order_quantity: 600,
    });

    expect(result.recommendation.estimated_cost).toBe(79200);
    expect(result.recommendation.approval_required).toBe(true);
    expect(result.recommendation.justification).toContain('exceeds autonomous threshold');
  });
});
