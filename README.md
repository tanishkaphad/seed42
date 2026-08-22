# Team seed42 - Supply Chain Simulation Environment

PostgreSQL-backed simulated supply chain environment using **Neon PostgreSQL**, **Fastify**, **TypeScript**, **Zod**, and **BullMQ**.

---

## 1. Quick Start

### Prerequisites
- Node.js v20+ (tested on Node.js v22)
- Neon PostgreSQL database instance (Get a free database from [neon.tech](https://neon.tech))

### Installation
```bash
# 1. Clone repository and navigate to folder
cd seed42

# 2. Install dependencies
npm install

# 3. Create .env from template
cp .env.example .env
```

Set your `DATABASE_URL` in `.env`:
```env
DATABASE_URL=postgresql://USER:PASSWORD@ep-xyz.region.neon.tech/neondb?sslmode=require
PORT=3000
HOST=0.0.0.0
```

---

## 2. Database Initialization & Seeding

```bash
# Initialize schema and seed the Golden Scenario
npm run db:init

# Reseed golden scenario at any time
npm run db:seed

# Reset simulation state back to clean golden state
npm run db:reset
```

---

## 3. Running the Server

```bash
# Start development server
npm run dev

# Or start standard production server
npm start
```

The server will start at `http://localhost:3000`.

---

## 4. Running Automated Tests

```bash
npm test
```

---

## 5. REST API Endpoints & Example Curl Commands

### Health Check
```bash
curl http://localhost:3000/health
```

### Inventory & Days of Coverage
```bash
# Get all inventory
curl http://localhost:3000/inventory

# Get COMP-104 inventory and coverage
curl http://localhost:3000/inventory/COMP-104
```

### Purchase Orders
```bash
# Get all purchase orders
curl http://localhost:3000/purchase-orders

# Get delayed PO-7712
curl http://localhost:3000/purchase-orders/PO-7712
```

### Suppliers & Capabilities
```bash
# Filter suppliers for component COMP-104
curl "http://localhost:3000/suppliers?component_id=COMP-104"
```

### Production Schedule
```bash
curl http://localhost:3000/production-schedule
```

### Supplier Communication
```bash
curl -X POST http://localhost:3000/suppliers/SUP-21/message \
  -H "Content-Type: application/json" \
  -d '{
    "po_id": "PO-7712",
    "subject": "Delay on PO-7712",
    "body": "Can you provide the revised estimated arrival date?"
  }'
```

### Request for Quotes (RFQ)
```bash
curl -X POST http://localhost:3000/rfq \
  -H "Content-Type: application/json" \
  -d '{
    "component_id": "COMP-104",
    "requested_quantity": 600,
    "required_delivery_date": "2026-09-06T00:00:00Z"
  }'
```

### Autonomous Approval Check
```bash
# Check cost within threshold (auto-approved)
curl -X POST http://localhost:3000/approval/check \
  -H "Content-Type: application/json" \
  -d '{
    "action_type": "emergency_purchase",
    "estimated_cost": 120000
  }'

# Check cost above threshold (requires human approval)
curl -X POST http://localhost:3000/approval/check \
  -H "Content-Type: application/json" \
  -d '{
    "action_type": "emergency_purchase",
    "estimated_cost": 168000
  }'
```

### Shipment Tracking & Contradiction Verification
```bash
curl http://localhost:3000/tracking/PO-7712
```

### Disruptions
```bash
# List active disruptions
curl http://localhost:3000/disruptions

# Inject a new disruption
curl -X POST http://localhost:3000/disruptions/inject \
  -H "Content-Type: application/json" \
  -d '{
    "disruption_type": "supplier_delay",
    "component_id": "COMP-104",
    "severity": "high",
    "description": "Port congestion delaying incoming shipment"
  }'
```

### Advance Simulation Clock
```bash
curl -X POST http://localhost:3000/simulation/advance \
  -H "Content-Type: application/json" \
  -d '{
    "steps": 2
  }'
```

### Reset Simulation
```bash
curl -X POST http://localhost:3000/simulation/reset
```

### Audit Trail
```bash
# View audit records for disruption
curl http://localhost:3000/audit/DIS-001
```
