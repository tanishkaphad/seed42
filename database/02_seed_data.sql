-- ============================================================
-- 02_seed_data.sql
-- Seed Data for the Golden Scenario
-- ============================================================

-- 1. Components
INSERT INTO simulation.components (component_id, name, description, unit_of_measure, criticality, required_certification)
VALUES (
    'COMP-104',
    'Motor Driver IC',
    'Motor controller component used in Smart Controller Unit',
    'units',
    'high',
    'Automotive-Grade'
) ON CONFLICT (component_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    criticality = EXCLUDED.criticality,
    required_certification = EXCLUDED.required_certification;

-- 2. Inventory
INSERT INTO simulation.inventory (inventory_id, component_id, warehouse, current_stock, usable_stock, daily_usage, safety_stock, last_updated)
VALUES (
    'INV-104',
    'COMP-104',
    'Pune-Plant-1',
    420,
    390,
    90,
    150,
    CURRENT_TIMESTAMP
) ON CONFLICT (inventory_id) DO UPDATE SET
    current_stock = EXCLUDED.current_stock,
    usable_stock = EXCLUDED.usable_stock,
    daily_usage = EXCLUDED.daily_usage,
    safety_stock = EXCLUDED.safety_stock,
    last_updated = CURRENT_TIMESTAMP;

-- 3. Suppliers
INSERT INTO simulation.suppliers (supplier_id, supplier_name, email, reliability_score, quality_score, active)
VALUES 
    ('SUP-21', 'Original Components Ltd', 'supplier21@example.com', 0.72, 0.92, TRUE),
    ('SUP-42', 'Western Components Ltd', 'supplier42@example.com', 0.81, 0.94, TRUE),
    ('SUP-37', 'Precision Components Pvt Ltd', 'supplier37@example.com', 0.95, 0.97, TRUE),
    ('SUP-18', 'Budget Electronics', 'supplier18@example.com', 0.65, 0.75, TRUE)
ON CONFLICT (supplier_id) DO UPDATE SET
    supplier_name = EXCLUDED.supplier_name,
    email = EXCLUDED.email,
    reliability_score = EXCLUDED.reliability_score,
    quality_score = EXCLUDED.quality_score,
    active = EXCLUDED.active;

-- 4. Supplier Components
INSERT INTO simulation.supplier_components (supplier_component_id, supplier_id, component_id, unit_price, lead_time_days, available_quantity, minimum_order_quantity, certifications, expedite_available, expedite_fee)
VALUES
    ('SC-21-104', 'SUP-21', 'COMP-104', 118.00, 5, 1000, 300, ARRAY['ISO-9001', 'Automotive-Grade'], TRUE, 0.00),
    ('SC-42-104', 'SUP-42', 'COMP-104', 132.00, 4, 700, 300, ARRAY['ISO-9001', 'Automotive-Grade'], TRUE, 12000.00),
    ('SC-37-104', 'SUP-37', 'COMP-104', 128.00, 6, 1200, 300, ARRAY['ISO-9001', 'Automotive-Grade'], FALSE, 0.00),
    ('SC-18-104', 'SUP-18', 'COMP-104', 110.00, 3, 1000, 200, ARRAY['ISO-9001'], TRUE, 0.00)
ON CONFLICT (supplier_component_id) DO UPDATE SET
    unit_price = EXCLUDED.unit_price,
    lead_time_days = EXCLUDED.lead_time_days,
    available_quantity = EXCLUDED.available_quantity,
    minimum_order_quantity = EXCLUDED.minimum_order_quantity,
    certifications = EXCLUDED.certifications,
    expedite_available = EXCLUDED.expedite_available,
    expedite_fee = EXCLUDED.expedite_fee;

-- 5. Production Orders
INSERT INTO simulation.production_orders (production_order_id, product, component_id, units_planned, component_required_per_unit, deadline, priority, status)
VALUES (
    'PROD-882',
    'Smart Controller Unit',
    'COMP-104',
    700,
    1,
    '2026-09-06 00:00:00+00',
    'high',
    'scheduled'
) ON CONFLICT (production_order_id) DO UPDATE SET
    product = EXCLUDED.product,
    units_planned = EXCLUDED.units_planned,
    deadline = EXCLUDED.deadline,
    priority = EXCLUDED.priority,
    status = EXCLUDED.status;

-- 6. Purchase Orders
INSERT INTO simulation.purchase_orders (po_id, component_id, supplier_id, quantity, expected_delivery, status, unit_price, total_value, approval_threshold)
VALUES (
    'PO-7712',
    'COMP-104',
    'SUP-21',
    1000,
    '2026-09-04 00:00:00+00',
    'delayed',
    118.00,
    118000.00,
    150000.00
) ON CONFLICT (po_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    expected_delivery = EXCLUDED.expected_delivery,
    status = EXCLUDED.status,
    unit_price = EXCLUDED.unit_price,
    total_value = EXCLUDED.total_value;

-- 7. Supplier Messages
INSERT INTO simulation.supplier_messages (message_id, supplier_id, po_id, direction, subject, body, message_status, sent_at)
VALUES (
    'MSG-001',
    'SUP-21',
    'PO-7712',
    'inbound',
    'Delay on PO-7712',
    'Due to transport issues, delivery may be delayed by 5-7 days. We are trying to resolve this and will update soon.',
    'delivered',
    CURRENT_TIMESTAMP
) ON CONFLICT (message_id) DO UPDATE SET
    body = EXCLUDED.body;

-- 11. Shipment Tracking (Contradictory state seeded)
INSERT INTO simulation.shipment_tracking (tracking_id, po_id, supplier_claim, tracking_status, last_movement, tracking_updated_at)
VALUES (
    'TRK-7712',
    'PO-7712',
    'dispatched',
    'label_created_no_pickup',
    NULL,
    CURRENT_TIMESTAMP
) ON CONFLICT (tracking_id) DO UPDATE SET
    supplier_claim = EXCLUDED.supplier_claim,
    tracking_status = EXCLUDED.tracking_status,
    last_movement = EXCLUDED.last_movement,
    tracking_updated_at = CURRENT_TIMESTAMP;

-- 12. Disruptions
INSERT INTO simulation.disruptions (disruption_id, disruption_type, component_id, po_id, production_order_id, severity, description, active, detected)
VALUES (
    'DIS-001',
    'supplier_delay',
    'COMP-104',
    'PO-7712',
    'PROD-882',
    'high',
    'Supplier SUP-21 reports a 5-7 day delivery delay.',
    TRUE,
    FALSE
) ON CONFLICT (disruption_id) DO UPDATE SET
    severity = EXCLUDED.severity,
    description = EXCLUDED.description,
    active = EXCLUDED.active,
    detected = EXCLUDED.detected;

-- 13. Simulation Events
INSERT INTO simulation.simulation_events (event_id, event_type, event_time, description, payload, executed)
VALUES 
    ('EVT-001', 'inventory_correction', 2, 'Warehouse cycle count reveals damaged stock for COMP-104', '{"component_id": "COMP-104", "usable_stock": 250}'::jsonb, FALSE),
    ('EVT-002', 'demand_spike', 5, 'Urgent customer surge increases daily consumption', '{"component_id": "COMP-104", "daily_usage": 120}'::jsonb, FALSE)
ON CONFLICT (event_id) DO UPDATE SET
    executed = EXCLUDED.executed,
    payload = EXCLUDED.payload;

-- 16. Simulation State
INSERT INTO simulation.simulation_state (id, simulation_time, status, updated_at)
VALUES (1, 0, 'running', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
    simulation_time = 0,
    status = 'running',
    updated_at = CURRENT_TIMESTAMP;
