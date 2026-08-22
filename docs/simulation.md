# Supply Chain Simulation Environment Documentation

## Overview
The simulation environment model represents a tier-1 manufacturing and procurement operation with components, warehouses, suppliers, purchase orders, production orders, shipment tracking, RFQs, automated approval checks, and event-driven disruptions.

The simulation connects to **Neon PostgreSQL** and enforces isolation under the `simulation` schema (`simulation.<table_name>`).

## Architecture

```
                    AI AGENT (Future)
                           ↓
                  AGENT TOOL INTERFACE
                           ↓
             FASTIFY REST API (src/api/)
                           ↓
          SIMULATION SERVICE LAYER (src/sim/)
                           ↓
              POSTGRESQL POOL (src/sim/database.ts)
                           ↓
          NEON POSTGRESQL (`simulation` schema)
```

## Schema & Tables (16 Tables)

1. `simulation.components`: Catalog of components with criticality and certification requirements.
2. `simulation.inventory`: Stock levels (`current_stock` vs `usable_stock`), daily usage, safety stock.
3. `simulation.suppliers`: Active suppliers with reliability and quality metrics.
4. `simulation.supplier_components`: Supplier capabilities, unit prices, lead times, MOQ, certifications (`TEXT[]`), expediting.
5. `simulation.production_orders`: Production schedule, product assemblies, unit requirements, deadlines, priority.
6. `simulation.purchase_orders`: In-flight POs, expected delivery, pricing, status (`placed`, `delayed`, `delivered`).
7. `simulation.supplier_messages`: Inbound and outbound communications with classification.
8. `simulation.rfqs`: Request for Quotes with quantity and required delivery date.
9. `simulation.rfq_quotes`: Generated supplier quotes with standard vs expedited pricing.
10. `simulation.approvals`: Autonomous budget checks enforcing the 150,000 threshold.
11. `simulation.shipment_tracking`: Waybill tracking and contradiction detection against supplier claims.
12. `simulation.disruptions`: Registered supply chain disruptions and active alerts.
13. `simulation.simulation_events`: Scheduled state-mutation events triggered by the logical clock.
14. `simulation.erp_updates`: Complete operational audit trail of ERP record modifications.
15. `simulation.audit_trail`: Comprehensive decision trace records for the agent.
16. `simulation.simulation_state`: Integer logical simulation clock (`simulation_time`) and engine state.

## Formulae

- **Days of Coverage**:
  $$\text{Days of Coverage} = \frac{\text{usable\_stock}}{\text{daily\_usage}}$$
  For `COMP-104` with usable stock 390 and daily usage 90:
  $$\frac{390}{90} \approx 4.33\text{ days}$$

## Event Engine Lifecycle

When `/simulation/advance` is called with `{ "steps": N }`:
1. Increments `simulation_time = simulation_time + N`.
2. Queries all unexecuted events in `simulation.simulation_events` where `event_time <= simulation_time`.
3. Executes each event handler (e.g. `inventory_correction`, `demand_spike`, `supplier_delay`).
4. Logs an ERP update record in `simulation.erp_updates`.
5. Marks the event record as `executed = TRUE`.
