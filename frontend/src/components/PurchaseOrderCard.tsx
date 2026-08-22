'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';
import type { PurchaseOrder } from '../types';

interface PurchaseOrderCardProps {
  purchaseOrder: PurchaseOrder | null;
}

export const PurchaseOrderCard: React.FC<PurchaseOrderCardProps> = ({ purchaseOrder }) => {
  if (!purchaseOrder) return null;

  return (
    <div
      className="glass-card"
      style={{
        padding: '1.25rem 1.5rem',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
        borderColor: 'rgba(16, 185, 129, 0.4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        {/* PO Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShoppingCart size={20} color="var(--status-emerald)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {purchaseOrder.poNumber}
              </span>
              <span className="badge badge-emerald mono">ERP CONFIRMED</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Recovery order issued to <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{purchaseOrder.supplier?.name ?? purchaseOrder.supplierId}</span>
            </p>
          </div>
        </div>

        {/* PO Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Quantity</div>
            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {purchaseOrder.quantity} units
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Amount</div>
            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--status-emerald)' }}>
              ${purchaseOrder.totalAmount.toLocaleString()}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Expected Delivery</div>
            <div className="mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              {new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
