-- ============================================================
-- 01_schema.sql
-- PostgreSQL Schema Definition for Simulation Environment
-- Schema: simulation
-- ============================================================

CREATE SCHEMA IF NOT EXISTS simulation;

-- 1. Components
CREATE TABLE IF NOT EXISTS simulation.components (
    component_id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    unit_of_measure VARCHAR DEFAULT 'units',
    criticality VARCHAR CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
    required_certification VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Inventory
CREATE TABLE IF NOT EXISTS simulation.inventory (
    inventory_id VARCHAR PRIMARY KEY,
    component_id VARCHAR NOT NULL REFERENCES simulation.components(component_id) ON DELETE CASCADE,
    warehouse VARCHAR NOT NULL,
    current_stock INT NOT NULL CHECK (current_stock >= 0),
    usable_stock INT NOT NULL CHECK (usable_stock >= 0),
    daily_usage INT NOT NULL CHECK (daily_usage >= 0),
    safety_stock INT NOT NULL CHECK (safety_stock >= 0),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Suppliers
CREATE TABLE IF NOT EXISTS simulation.suppliers (
    supplier_id VARCHAR PRIMARY KEY,
    supplier_name VARCHAR NOT NULL,
    email VARCHAR NOT NULL,
    reliability_score NUMERIC(4,2) NOT NULL,
    quality_score NUMERIC(4,2) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Supplier Components
CREATE TABLE IF NOT EXISTS simulation.supplier_components (
    supplier_component_id VARCHAR PRIMARY KEY,
    supplier_id VARCHAR NOT NULL REFERENCES simulation.suppliers(supplier_id) ON DELETE CASCADE,
    component_id VARCHAR NOT NULL REFERENCES simulation.components(component_id) ON DELETE CASCADE,
    unit_price NUMERIC(10,2) NOT NULL,
    lead_time_days INT NOT NULL,
    available_quantity INT NOT NULL CHECK (available_quantity >= 0),
    minimum_order_quantity INT NOT NULL CHECK (minimum_order_quantity >= 0),
    certifications TEXT[] DEFAULT '{}',
    expedite_available BOOLEAN DEFAULT FALSE,
    expedite_fee NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Production Orders
CREATE TABLE IF NOT EXISTS simulation.production_orders (
    production_order_id VARCHAR PRIMARY KEY,
    product VARCHAR NOT NULL,
    component_id VARCHAR NOT NULL REFERENCES simulation.components(component_id) ON DELETE CASCADE,
    units_planned INT NOT NULL,
    component_required_per_unit INT DEFAULT 1,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    priority VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Purchase Orders
CREATE TABLE IF NOT EXISTS simulation.purchase_orders (
    po_id VARCHAR PRIMARY KEY,
    component_id VARCHAR NOT NULL REFERENCES simulation.components(component_id) ON DELETE CASCADE,
    supplier_id VARCHAR NOT NULL REFERENCES simulation.suppliers(supplier_id) ON DELETE CASCADE,
    quantity INT NOT NULL,
    expected_delivery TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total_value NUMERIC(12,2) NOT NULL,
    approval_threshold NUMERIC(12,2) DEFAULT 150000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Supplier Messages
CREATE TABLE IF NOT EXISTS simulation.supplier_messages (
    message_id VARCHAR PRIMARY KEY,
    supplier_id VARCHAR NOT NULL REFERENCES simulation.suppliers(supplier_id) ON DELETE CASCADE,
    po_id VARCHAR,
    direction VARCHAR NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject VARCHAR NOT NULL,
    body TEXT NOT NULL,
    message_status VARCHAR NOT NULL DEFAULT 'delivered',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. RFQs
CREATE TABLE IF NOT EXISTS simulation.rfqs (
    rfq_id VARCHAR PRIMARY KEY,
    component_id VARCHAR NOT NULL REFERENCES simulation.components(component_id) ON DELETE CASCADE,
    requested_quantity INT NOT NULL,
    required_delivery_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. RFQ Quotes
CREATE TABLE IF NOT EXISTS simulation.rfq_quotes (
    quote_id VARCHAR PRIMARY KEY,
    rfq_id VARCHAR NOT NULL REFERENCES simulation.rfqs(rfq_id) ON DELETE CASCADE,
    supplier_id VARCHAR NOT NULL REFERENCES simulation.suppliers(supplier_id) ON DELETE CASCADE,
    quantity_available INT NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    delivery_days INT NOT NULL,
    expedite_available BOOLEAN DEFAULT FALSE,
    expedite_fee NUMERIC(10,2) DEFAULT 0,
    quote_valid_hours INT DEFAULT 24,
    accepted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Approvals
CREATE TABLE IF NOT EXISTS simulation.approvals (
    approval_id VARCHAR PRIMARY KEY,
    action_type VARCHAR NOT NULL,
    estimated_cost NUMERIC(12,2) NOT NULL,
    approval_threshold NUMERIC(12,2) DEFAULT 150000,
    approval_required BOOLEAN NOT NULL,
    approval_status VARCHAR NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Shipment Tracking
CREATE TABLE IF NOT EXISTS simulation.shipment_tracking (
    tracking_id VARCHAR PRIMARY KEY,
    po_id VARCHAR NOT NULL REFERENCES simulation.purchase_orders(po_id) ON DELETE CASCADE,
    supplier_claim VARCHAR NOT NULL,
    tracking_status VARCHAR NOT NULL,
    last_movement TIMESTAMP WITH TIME ZONE,
    tracking_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Disruptions
CREATE TABLE IF NOT EXISTS simulation.disruptions (
    disruption_id VARCHAR PRIMARY KEY,
    disruption_type VARCHAR NOT NULL,
    component_id VARCHAR NOT NULL REFERENCES simulation.components(component_id) ON DELETE CASCADE,
    po_id VARCHAR,
    production_order_id VARCHAR,
    severity VARCHAR NOT NULL,
    description TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    detected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Simulation Events
CREATE TABLE IF NOT EXISTS simulation.simulation_events (
    event_id VARCHAR PRIMARY KEY,
    event_type VARCHAR NOT NULL,
    event_time INT NOT NULL,
    description TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    executed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. ERP Updates
CREATE TABLE IF NOT EXISTS simulation.erp_updates (
    update_id VARCHAR PRIMARY KEY,
    entity_type VARCHAR NOT NULL,
    entity_id VARCHAR NOT NULL,
    action VARCHAR NOT NULL,
    previous_value JSONB DEFAULT '{}'::jsonb,
    new_value JSONB DEFAULT '{}'::jsonb,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Audit Trail
CREATE TABLE IF NOT EXISTS simulation.audit_trail (
    audit_id VARCHAR PRIMARY KEY,
    disruption_id VARCHAR NOT NULL,
    detected_disruption TEXT NOT NULL,
    data_sources_checked JSONB DEFAULT '[]'::jsonb,
    messages_sent JSONB DEFAULT '[]'::jsonb,
    messages_received JSONB DEFAULT '[]'::jsonb,
    alternatives_considered JSONB DEFAULT '[]'::jsonb,
    calculations JSONB DEFAULT '{}'::jsonb,
    decision TEXT NOT NULL,
    decision_reason TEXT NOT NULL,
    erp_updates JSONB DEFAULT '[]'::jsonb,
    escalations JSONB DEFAULT '[]'::jsonb,
    remaining_risks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Simulation State
CREATE TABLE IF NOT EXISTS simulation.simulation_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    simulation_time INT NOT NULL DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'running',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
