import { describe, it, expect } from 'vitest';
import { planMailbox } from '../src/mail/deliver.js';

describe('outbound mailbox lock', () => {
  it('stays simulated when live mail env is empty', () => {
    const plan = planMailbox('vendor@supplier.example');
    expect(plan.mode).toBe('simulated');
    expect(plan.intended).toBe('vendor@supplier.example');
  });
});
