# Supply Chain Disruption Control Agent — Backend

> **Hackathon MVP** · Node.js · TypeScript · Fastify · PostgreSQL · Prisma · Zod · LangGraph.js (upcoming)

The backend engine for the **Supply Chain Disruption Control Agent** — a system that detects, analyses, and autonomously proposes recovery plans for real-time supply chain disruptions, with a human-in-the-loop governance layer for high-cost or high-risk decisions.

---

## 🧠 Core Architecture Principle

```
LLM proposes → Constraint Engine decides → ERP executes (or blocks)
```

The LLM **never has authority** to approve or execute procurement actions directly.
Every proposed action is validated through the **deterministic Constraint Engine** before any state change occurs.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v20+ |
| Language | TypeScript (strict, ES2022/NodeNext) |
| Web Framework | Fastify v5 |
| Database | PostgreSQL via Prisma ORM |
| Validation | Zod |
| Agent Framework | LangGraph.js *(upcoming)* |
| Real-time Events | Server-Sent Events / SSE *(upcoming)* |
| Test Runner | Vitest |

---

## 📁 Project Structure

```
backend/
├── prisma/
│   └── schema.prisma             # 9 domain models (suppliers, inventory, orders, etc.)
├── src/
│   ├── config/
│   │   └── env.ts                # Zod-validated environment variables
│   ├── db/
│   │   ├── prisma.ts             # Prisma singleton client
│   │   └── seed.ts               # Deterministic scenario seed (COMP-104 / PO-7712 disruption)
│   ├── engine/                   # ⚙️  Deterministic Constraint Engine (pure TS, no LLM)
│   │   ├── constraintEngine.ts   # Public API — import only this in agent nodes
│   │   ├── inventoryCalculator.ts
│   │   ├── supplierValidator.ts
│   │   ├── budgetValidator.ts
│   │   ├── recoveryValidator.ts
│   │   └── types.ts
│   ├── tools/                    # 🔧 Agent-callable tools (all Zod-typed)
│   │   ├── index.ts              # Public tool exports
│   │   ├── inventoryTools.ts     # checkInventory()
│   │   ├── supplierTools.ts      # getSupplier(), findAlternativeSuppliers()
│   │   ├── trackingTools.ts      # verifyTracking()  ← contradiction detection
│   │   ├── productionTools.ts    # checkProductionSchedule(), updateProductionRisk()
│   │   ├── procurementTools.ts   # calculateRecoveryPlan(), validateRecoveryPlan(),
│   │   │                         #   checkBudget(), createPurchaseOrder()
│   │   └── auditTools.ts         # writeAuditLog()
│   ├── agent/                    # LangGraph.js state machines (upcoming)
│   ├── audit/                    # Audit service helpers (upcoming)
│   ├── routes/
│   │   ├── index.ts              # API router registry
│   │   ├── health.route.ts       # GET /api/health
│   │   └── demo.route.ts         # GET /api/demo/state · POST /api/demo/reset
│   ├── services/                 # Simulated ERP & verification services (upcoming)
│   ├── types/
│   │   └── index.ts              # Shared API response types
│   ├── utils/                    # Utility helpers (upcoming)
│   ├── app.ts                    # Fastify app (CORS, error handler, routes)
│   └── server.ts                 # Entry point — starts server + graceful shutdown
├── tests/
│   ├── inventoryCalculator.test.ts
│   ├── supplierValidator.test.ts
│   ├── budgetValidator.test.ts
│   ├── recoveryValidator.test.ts
│   └── tools.test.ts             # All 11 agent tools (Prisma mocked)
├── .env.example
├── docker-compose.yml            # One-command local PostgreSQL
├── vitest.config.mts
├── tsconfig.json
└── package.json
```

---

## 🛠️ Prerequisites

- **Node.js** `v20+`
- **PostgreSQL** — local, Docker, or hosted (Supabase / Neon / Render)
- **Docker** *(optional)* — for the one-command database setup

---

## ⚙️ Getting Started

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/supply_chain_db?schema=public"
CORS_ORIGIN="http://localhost:3000,http://localhost:5173"
LOG_LEVEL="info"
```

### 3. Start PostgreSQL

**Option A — Docker (recommended):**
```bash
docker compose up -d
```

**Option B — Existing PostgreSQL:** Update `DATABASE_URL` in `.env` with your connection string.

### 4. Push schema & generate Prisma client

```bash
npm run prisma:push
npm run prisma:generate
```

### 5. Seed the demo scenario

```bash
npm run db:seed
```

This populates the full disruption scenario: `PO-7712`, `COMP-104`, `PROD-882`, all 4 suppliers, tracking events, and the initial audit log.

### 6. Start the development server

```bash
npm run dev
```

Server starts at `http://localhost:3001`.

---

## 📡 API Endpoints

### Health Check
```http
GET /api/health
```
```json
{ "status": "ok", "service": "supply-chain-agent" }
```

### Scenario State *(for frontend visualization)*
```http
GET /api/demo/state
```

Returns the complete scenario graph:
- Active disruption & contradiction details
- PO-7712 supplier claim vs carrier tracking mismatch
- Inventory coverage metrics (COMP-104)
- Production order status (PROD-882)
- Supplier eligibility matrix with ISO-9001 flags
- Business rule parameters

### Reset Demo Database
```http
POST /api/demo/reset
```

Wipes and reseeds all tables to the initial deterministic state. Useful for restarting demos.

### Run Disruption Agent (Full Workflow)
```http
POST /api/agent/run
Content-Type: application/json

{
  "purchaseOrderId": "PO-7712",
  "supplierId": "SUP-21",
  "componentId": "COMP-104",
  "claimedDelayDays": 5
}
```

Executes the complete 10-node LangGraph agent flow and returns the full run result with audit trail and tool call log.

### Resume Agent After Human Approval
```http
POST /api/agent/resume
Content-Type: application/json

{
  "purchaseOrderId": "PO-7712",
  "supplierId": "SUP-21",
  "componentId": "COMP-104",
  "claimedDelayDays": 5,
  "humanApprovalId": "appr_123"
}
```

### Real-Time Agent Event Stream (SSE for Frontend)
```http
GET /api/agent/events/:disruptionId
```
*Connects the Next.js frontend to a live Server-Sent Events stream. Replays historical events and broadcasts real-time agent actions, tool calls, and governance decisions without leaking internal chain-of-thought.*

**Supported Event Types:**
- `DISRUPTION_DETECTED` · `INVENTORY_CHECK` · `PRODUCTION_RISK`
- `SUPPLIER_VERIFICATION` · `SUPPLIER_REJECTED` · `ALTERNATIVE_FOUND`
- `RECOVERY_PLAN_CREATED` · `CONSTRAINT_CHECK` · `CONSTRAINT_FAILED`
- `APPROVAL_REQUIRED` · `APPROVAL_GRANTED` · `PURCHASE_ORDER_CREATED`
- `OUTCOME_VERIFIED` · `DISRUPTION_MITIGATED`

---

### Human-in-the-Loop Approvals

#### List All Approvals
```http
GET /api/approvals?status=PENDING
```

#### Get Approval Request Details
```http
GET /api/approvals/:id
```

Returns the full operational context payload (disruption summary, line stoppage risk, carrier contradiction details, recovery plan, constraint violations, and overage amount).

#### Explicitly Approve Recovery Plan
```http
POST /api/approvals/:id/approve
Content-Type: application/json

{
  "userName": "Operations Manager",
  "notes": "Emergency authorization granted due to line stoppage risk."
}
```
*Triggers ERP execution, creates the Purchase Order, marks the disruption RESOLVED, and logs an immutable audit event.*

#### Explicitly Reject Recovery Plan
```http
POST /api/approvals/:id/reject
Content-Type: application/json

{
  "userName": "Operations Manager",
  "notes": "Cost exceeds tolerance; rescheduling assembly line."
}
```
*Marks the plan REJECTED and creates an audit log entry.*

---

## 🎬 Demo Scenario

The seed data models a realistic, high-stakes supply chain disruption:

| Element | Value |
|---|---|
| Component | `COMP-104` — High-Frequency Micro-Controller Module |
| Current Stock | 420 units |
| Daily Burn Rate | 100 units/day |
| Usable Coverage | **4.2 days** |
| Production Order | `PROD-882` — ECU Assembly Line A |
| Required Quantity | **700 units** |
| Deadline | **4 days** |
| Units Deficit | **280 units** |
| Purchase Order | `PO-7712` via `SUP-21` (Global Components Ltd) |
| Supplier Claim | *"Shipment dispatched, will be delayed by 5 days"* |
| Carrier Reality | `NO_LABEL_CREATED` — cargo never picked up |

### Supplier Matrix

| Code | Name | ISO-9001 | Capacity | Lead Time | Reliability | Unit Price | Eligible? |
|---|---|---|---|---|---|---|---|
| `SUP-21` | Global Components Ltd | ✅ | 0 | 5 days | 0.82 | $120 | ❌ No capacity |
| `SUP-42` | Rapid Components | ✅ | 300 | 1 day | 0.96 | $260 | ✅ Expensive |
| `SUP-18` | CheapParts Mfg | ❌ | 600 | 1 day | 0.88 | $85 | ❌ Not certified |
| `SUP-37` | Certified Components Co | ✅ | 500 | 3 days | 0.91 | $145 | ✅ Recommended |

### Business Rules

- ISO-9001 certification: **mandatory** (hard block)
- Autonomous recovery budget: **$150,000** (above = human approval required)

---

## ⚙️ Constraint Engine

Located in [`src/engine/`](src/engine/). All rule enforcement is **pure TypeScript** — no LLM involvement.

| Function | Rule Enforced |
|---|---|
| `calculateInventoryCoverage()` | Stock ÷ burn rate → days of coverage |
| `validateSupplier()` | ISO-9001 mandatory · capacity ≥ required · reliability ≥ 0.80 |
| `validateBudget()` | Cost ≤ $150k → autonomous · Cost > $150k → human approval |
| `validateRecoveryPlan()` | Orchestrates all rules across multi-supplier plans |

**Canonical output format:**
```json
{
  "allowed": false,
  "requiresHumanApproval": true,
  "violations": [
    {
      "rule": "AUTONOMOUS_BUDGET",
      "message": "Recovery cost ($182,000.00) exceeds the autonomous execution limit ($150,000.00). Human approval is required."
    }
  ]
}
```

---

## 🔧 Agent Tools

Located in [`src/tools/`](src/tools/). All tools are Zod-typed with validated inputs and outputs.

| Tool | Description |
|---|---|
| `checkInventory(componentId)` | Stock level, burn rate, days of coverage |
| `checkProductionSchedule(componentId)` | BOM-linked production orders + risk level |
| `getSupplier(supplierId)` | Full supplier profile + eligibility annotation |
| `findAlternativeSuppliers(componentId, qty)` | All active suppliers with feasibility flags |
| `verifyTracking(purchaseOrderId)` | Carrier tracking + **contradiction detection** |
| `calculateRecoveryPlan(...)` | Generate candidate plans *(propose only — no approval)* |
| `validateRecoveryPlan(plan)` | **Calls Constraint Engine** — determines if plan is allowed |
| `checkBudget(cost)` | Deterministic $150k threshold check |
| `createPurchaseOrder(plan)` | Simulated ERP execution — **hard-gated by engine or human approval** |
| `updateProductionRisk(orderId, status)` | Updates production order status in DB |
| `writeAuditLog(event)` | Persists structured audit record |

### `createPurchaseOrder` Safety Gate

```
engine.allowed = true  → PO created ✅
engine.allowed = false + requiresHumanApproval = true + valid humanApprovalRequestId → PO created ✅
anything else → BLOCKED ❌
```

The LLM cannot bypass this check by passing arbitrary values.

---

## 🧪 Testing

```bash
npm test            # Run all tests once
npm run test:watch  # Watch mode
```

**Test results:**

```
✓ tests/inventoryCalculator.test.ts   (9 tests)
✓ tests/supplierValidator.test.ts     (6 tests)
✓ tests/budgetValidator.test.ts       (6 tests)
✓ tests/recoveryValidator.test.ts     (8 tests)
✓ tests/tools.test.ts                (24 tests)
✓ tests/agent.test.ts                 (5 tests)
✓ tests/approvals.test.ts            (13 tests)
✓ tests/events.test.ts                (5 tests)

Tests  76 passed (76)
```

---

## 📜 npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with live reload (tsx watch) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run start` | Run compiled production build |
| `npm test` | Run all Vitest unit tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run db:seed` | Seed deterministic demo scenario |
| `npm run prisma:generate` | Regenerate Prisma Client |
| `npm run prisma:validate` | Validate `schema.prisma` |
| `npm run prisma:push` | Sync schema to PostgreSQL (dev) |
| `npm run prisma:migrate` | Run migrations (production) |

---

## 🗄️ Database Models

| Model | Purpose |
|---|---|
| `suppliers` | Supplier profiles, ISO-9001 flag, pricing, capacity, reliability |
| `inventory` | SKU stock levels, safety thresholds, daily burn rate |
| `purchase_orders` | PO records with supplier claims and tracking links |
| `production_orders` | Manufacturing schedule with BOM references |
| `tracking_events` | Carrier-side events (including `NO_LABEL_CREATED`) |
| `disruption_events` | Identified disruptions with severity and impact scores |
| `recovery_plans` | Agent-proposed mitigation plans |
| `audit_logs` | Immutable action ledger with reasoning and state diffs |
| `approval_requests` | Human-in-the-loop governance records |

---

## 🔜 Next Steps (Upcoming Increments)

- [ ] LangGraph.js agent graph (state machine, nodes, edges)
- [ ] SSE endpoint for real-time agent event streaming
- [ ] Human approval REST endpoints (`POST /api/approvals/:id/approve`)
- [ ] Simulated ERP supplier verification service
- [ ] Agent memory / disruption context persistence
