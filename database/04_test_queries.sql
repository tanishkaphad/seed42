-- ============================================================
-- 04_test_queries.sql
-- Verification SQL Queries for Simulation State & Constraints
-- ============================================================

-- 1. Inventory Coverage Query (Should return ~4.33 days for COMP-104)
SELECT 
    i.component_id,
    c.name,
    i.current_stock,
    i.usable_stock,
    i.daily_usage,
    i.safety_stock,
    ROUND((i.usable_stock::numeric / NULLIF(i.daily_usage, 0)), 2) AS days_of_coverage
FROM simulation.inventory i
JOIN simulation.components c ON i.component_id = c.component_id
WHERE i.component_id = 'COMP-104';

-- 2. Delayed Purchase Orders Query
SELECT 
    po.po_id,
    po.component_id,
    s.supplier_name,
    po.quantity,
    po.expected_delivery,
    po.status,
    po.total_value
FROM simulation.purchase_orders po
JOIN simulation.suppliers s ON po.supplier_id = s.supplier_id
WHERE po.status = 'delayed';

-- 3. Affected Production Orders Query
SELECT 
    po.production_order_id,
    po.product,
    po.component_id,
    po.units_planned,
    po.deadline,
    po.priority,
    po.status
FROM simulation.production_orders po
WHERE po.component_id = 'COMP-104'
  AND po.status = 'scheduled';

-- 4. Available Suppliers and Certification Filtering
-- Check which suppliers hold the required 'Automotive-Grade' certification
SELECT 
    s.supplier_id,
    s.supplier_name,
    sc.unit_price,
    sc.lead_time_days,
    sc.available_quantity,
    sc.minimum_order_quantity,
    sc.certifications,
    'Automotive-Grade' = ANY(sc.certifications) AS has_required_cert,
    sc.expedite_available,
    sc.expedite_fee
FROM simulation.supplier_components sc
JOIN simulation.suppliers s ON sc.supplier_id = s.supplier_id
WHERE sc.component_id = 'COMP-104'
ORDER BY sc.unit_price ASC;

-- 5. Supplier / Tracking Contradiction Query
SELECT 
    st.tracking_id,
    st.po_id,
    st.supplier_claim,
    st.tracking_status,
    st.last_movement,
    CASE 
        WHEN st.supplier_claim = 'dispatched' AND st.tracking_status = 'label_created_no_pickup' THEN 'CONTRADICTION_DETECTED'
        ELSE 'CONSISTENT'
    END AS claim_verification
FROM simulation.shipment_tracking st
WHERE st.po_id = 'PO-7712';

-- 6. Approval Threshold Safety Verification
SELECT 
    po_id,
    total_value,
    approval_threshold,
    (total_value > approval_threshold) AS requires_human_approval
FROM simulation.purchase_orders;

-- 7. Active Disruptions Query
SELECT 
    disruption_id,
    disruption_type,
    component_id,
    po_id,
    production_order_id,
    severity,
    description,
    active,
    detected
FROM simulation.disruptions
WHERE active = TRUE;

-- 8. Simulation Clock and Pending Events
SELECT 
    s.simulation_time,
    s.status AS sim_status,
    COUNT(e.event_id) FILTER (WHERE e.executed = FALSE AND e.event_time <= s.simulation_time) AS pending_due_events,
    COUNT(e.event_id) FILTER (WHERE e.executed = FALSE) AS total_pending_events
FROM simulation.simulation_state s
LEFT JOIN simulation.simulation_events e ON TRUE
WHERE s.id = 1
GROUP BY s.simulation_time, s.status;

-- 9. ERP Updates Audit Log
SELECT 
    update_id,
    entity_type,
    entity_id,
    action,
    previous_value,
    new_value,
    reason,
    created_at
FROM simulation.erp_updates
ORDER BY created_at DESC;

-- 10. Audit Trail Records
SELECT 
    audit_id,
    disruption_id,
    detected_disruption,
    decision,
    decision_reason,
    created_at
FROM simulation.audit_trail
ORDER BY created_at DESC;
