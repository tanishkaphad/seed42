import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkApproval } from '../src/sim/approval.js';
import { seedGoldenScenario, closePool } from '../src/sim/database.js';

describe('Approval Threshold Safety Verification', () => {
  beforeAll(async () => {
    await seedGoldenScenario();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should auto-approve costs below the 150000 threshold', async () => {
    const res = await checkApproval({
      action_type: 'emergency_po',
      estimated_cost: 120000,
    });
    expect(res.approval_required).toBe(false);
    expect(res.approval_status).toBe('auto_approved');
    expect(res.approval_threshold).toBe(150000);
  });

  it('should require human approval for costs above the 150000 threshold', async () => {
    const res = await checkApproval({
      action_type: 'emergency_po',
      estimated_cost: 168000,
    });
    expect(res.approval_required).toBe(true);
    expect(res.approval_status).toBe('pending_human_approval');
    expect(res.reason).toContain('exceeds autonomous purchase threshold');
  });
});
