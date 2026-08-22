// =========================================================
// API Client — Backend Fastify Integration
// =========================================================

import type { DemoStateResponse, AgentRunResult, ApprovalRequest } from '../types';

const BASE_URL = ''; // Relative URL leverages Vite proxy (/api -> localhost:3001)

export async function checkBackendHealth(): Promise<{ status: string; service: string }> {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json();
}

export async function fetchDemoState(): Promise<DemoStateResponse> {
  const res = await fetch(`${BASE_URL}/api/demo/state`);
  if (!res.ok) throw new Error('Failed to fetch demo state');
  return res.json();
}

export async function resetDemoDatabase(): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/demo/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to reset demo scenario');
  return res.json();
}

export async function runDisruptionSimulation(trigger = {
  purchaseOrderId: 'PO-7712',
  supplierId: 'SUP-21',
  componentId: 'COMP-104',
  claimedDelayDays: 5,
}): Promise<{ success: boolean; result: AgentRunResult }> {
  const res = await fetch(`${BASE_URL}/api/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trigger),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Agent execution failed' }));
    throw new Error(errorData.error || 'Agent execution failed');
  }
  return res.json();
}

export async function fetchPendingApprovals(): Promise<{ success: boolean; approvals: ApprovalRequest[] }> {
  const res = await fetch(`${BASE_URL}/api/approvals?status=PENDING`);
  if (!res.ok) throw new Error('Failed to fetch pending approvals');
  return res.json();
}

export async function approveHumanRequest(
  approvalId: string,
  payload = { userName: 'Operations Manager', notes: 'Emergency authorization granted.' }
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Approval execution failed');
  return res.json();
}

export async function rejectHumanRequest(
  approvalId: string,
  payload = { userName: 'Operations Manager', notes: 'Cost rejected; exploring line rescheduling.' }
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/approvals/${approvalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Rejection failed');
  return res.json();
}
