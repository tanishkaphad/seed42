'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MetricRibbon } from './components/MetricRibbon';
import { AgentPipeline } from './components/AgentPipeline';
import { SupplierMatrix } from './components/SupplierMatrix';
import { EventStreamTerminal } from './components/EventStreamTerminal';
import { ApprovalModal } from './components/ApprovalModal';
import { PurchaseOrderCard } from './components/PurchaseOrderCard';

import {
  checkBackendHealth,
  fetchDemoState,
  resetDemoDatabase,
  runDisruptionSimulation,
  fetchPendingApprovals,
  approveHumanRequest,
  rejectHumanRequest,
} from './api/client';
import { connectDisruptionSSE } from './api/sse';

import type {
  DemoStateResponse,
  AgentStep,
  AgentRealtimeEvent,
  ApprovalRequest,
  PurchaseOrder,
} from './types';

export const App: React.FC = () => {
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [demoState, setDemoState] = useState<DemoStateResponse | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<AgentStep | null>(null);
  const [completedSteps, setCompletedSteps] = useState<AgentStep[]>([]);
  const [events, setEvents] = useState<AgentRealtimeEvent[]>([]);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [activeApproval, setActiveApproval] = useState<ApprovalRequest | null>(null);
  const [isProcessingApproval, setIsProcessingApproval] = useState<boolean>(false);
  const [recoveryPO, setRecoveryPO] = useState<PurchaseOrder | null>(null);

  // Load initial demo state & check backend health
  const refreshState = useCallback(async () => {
    try {
      await checkBackendHealth();
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }

    try {
      const state = await fetchDemoState();
      setDemoState(state);

      // Check for recovery PO if created
      const issuedPo = state.liveDatabase.purchaseOrders.find(
        (p) => p.poNumber.startsWith('PO-REC') || (p.poNumber !== 'PO-7712' && p.status === 'ISSUED')
      );
      if (issuedPo) {
        setRecoveryPO(issuedPo);
      }
    } catch (err) {
      console.warn('Could not fetch demo state:', err);
    }

    // Check for pending approvals
    try {
      const approvalData = await fetchPendingApprovals();
      if (approvalData.approvals.length > 0) {
        setActiveApproval(approvalData.approvals[0]);
      } else {
        setActiveApproval(null);
      }
    } catch {
      // Ignored
    }
  }, []);

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 4000);
    return () => clearInterval(interval);
  }, [refreshState]);

  // Connect to SSE stream for PO-7712
  useEffect(() => {
    const cleanup = connectDisruptionSSE(
      'PO-7712',
      (newEvent) => {
        setEvents((prev) => [...prev, newEvent]);
        // Update current step based on event
        if (newEvent.step) {
          const stepName = newEvent.step as AgentStep;
          setCurrentStep(stepName);
          setCompletedSteps((prev) => (prev.includes(stepName) ? prev : [...prev, stepName]));
        }
      },
      () => setSseConnected(true),
      () => setSseConnected(false)
    );
    return cleanup;
  }, []);

  // Handler: Trigger Autonomous Disruption Agent
  const handleTriggerAgent = async () => {
    setIsRunning(true);
    setCurrentStep('DETECT');
    setCompletedSteps([]);
    setRecoveryPO(null);

    try {
      const { result } = await runDisruptionSimulation();
      setCurrentStep(result.currentStep);

      // Check if human approval is required
      if (result.approvalRequired) {
        await refreshState();
      } else if (result.executionResult?.purchaseOrder) {
        setCompletedSteps([
          'DETECT',
          'IMPACT_ANALYSIS',
          'VERIFY',
          'SOURCE',
          'PLAN',
          'CONSTRAINT_CHECK',
          'APPROVAL_GATE',
          'EXECUTE',
          'VERIFY_OUTCOME',
          'COMPLETE',
        ]);
        await refreshState();
      }
    } catch (err) {
      console.error('Agent trigger failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Handler: Reset Demo Database
  const handleResetScenario = async () => {
    setIsResetting(true);
    try {
      await resetDemoDatabase();
      setCurrentStep(null);
      setCompletedSteps([]);
      setEvents([]);
      setActiveApproval(null);
      setRecoveryPO(null);
      await refreshState();
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Handler: Human-in-the-Loop Approve
  const handleApprove = async (id: string, notes: string) => {
    setIsProcessingApproval(true);
    try {
      await approveHumanRequest(id, { userName: 'Operations Manager', notes });
      setActiveApproval(null);
      await refreshState();
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // Handler: Human-in-the-Loop Reject
  const handleReject = async (id: string, notes: string) => {
    setIsProcessingApproval(true);
    try {
      await rejectHumanRequest(id, { userName: 'Operations Manager', notes });
      setActiveApproval(null);
      await refreshState();
    } catch (err) {
      console.error('Rejection failed:', err);
    } finally {
      setIsProcessingApproval(false);
    }
  };

  return (
    <div className="app-container">
      {/* Header & Controls */}
      <Header
        backendOnline={backendOnline}
        isRunning={isRunning}
        isResetting={isResetting}
        onTriggerAgent={handleTriggerAgent}
        onResetScenario={handleResetScenario}
        sseConnected={sseConnected}
      />

      {/* KPI Ribbon */}
      <MetricRibbon demoState={demoState} />

      {/* Confirmed Recovery PO Card (if executed) */}
      {recoveryPO && <PurchaseOrderCard purchaseOrder={recoveryPO} />}

      {/* 10-Node Decision Pipeline */}
      <AgentPipeline
        currentStep={currentStep}
        completedSteps={completedSteps}
        isRunning={isRunning}
      />

      {/* Split View: Supplier Compliance Matrix & Live SSE Terminal */}
      <div className="grid-2">
        <SupplierMatrix suppliers={demoState?.liveDatabase.suppliers ?? []} />
        <EventStreamTerminal
          events={events}
          onClearEvents={() => setEvents([])}
          sseConnected={sseConnected}
        />
      </div>

      {/* Human Approval Modal (Triggered on budget overage) */}
      {activeApproval && (
        <ApprovalModal
          approval={activeApproval}
          onApprove={handleApprove}
          onReject={handleReject}
          onClose={() => setActiveApproval(null)}
          isProcessing={isProcessingApproval}
        />
      )}
    </div>
  );
};

export default App;
