-- ============================================================
-- 03_scenarios.sql
-- Scenario injection and testing procedures
-- ============================================================

-- SCENARIO 1: Supplier Delay (Standard)
-- Supplier SUP-21 reports 5-7 days delay on PO-7712
-- Status: already seeded in Golden Scenario

-- SCENARIO 2: Stale Inventory Correction
-- Inventory discrepancy: Current stock is 800 but usable stock is reduced to 390
-- To inject:
-- UPDATE simulation.inventory SET current_stock = 800, usable_stock = 390, daily_usage = 90 WHERE component_id = 'COMP-104';

-- SCENARIO 3: Adversarial Supplier Claim
-- SUP-21 claims dispatched, but tracking shows label_created_no_pickup
-- Status: seeded in Golden Scenario (shipment_tracking table)

-- SCENARIO 4: Quality Constraint
-- Budget Electronics (SUP-18) is cheap (110) & fast (3 days) but only has ISO-9001, missing Automotive-Grade
-- Status: seeded in supplier_components table

-- SCENARIO 5: Approval Required
-- Emergency procurement exceeding 150,000 threshold
-- Autonomous execution must be blocked and approval requested

-- SCENARIO 6: High-Pressure Production
-- PROD-882 deadline approaches, requires expedited shipping or split orders
