<div align="center">

<!-- Animated gradient banner -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0ea5e9,50:7c3aed,100:06b6d4&height=180&section=header&text=seed42&fontSize=72&fontColor=ffffff&fontAlignY=35&desc=Supply%20Chain%20Disruption%20Control%20Agent&descAlignY=60&descSize=22&animation=fadeIn" width="100%" />

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white&style=for-the-badge)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.28-000000?logo=fastify&logoColor=white&style=for-the-badge)](https://fastify.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.4-1C3C3C?logo=langchain&logoColor=white&style=for-the-badge)](https://langchain-ai.github.io/langgraphjs/)
[![Groq LLM](https://img.shields.io/badge/Groq-LLM-F55036?style=for-the-badge)](https://groq.com)
[![Neon PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-00E599?logo=postgresql&logoColor=white&style=for-the-badge)](https://neon.tech)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.12-FF6B6B?logo=redis&logoColor=white&style=for-the-badge)](https://bullmq.io/)
[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol-7C3AED?style=for-the-badge)](https://modelcontextprotocol.io)
[![MIT License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

> **seed42** is a hackathon-winning autonomous agent that monitors, reasons over, and recovers from supply chain disruptions — entirely without human intervention, until business rules require escalation.

</div>

---

## ⚡ What It Does

When a supplier emails that a shipment is delayed, seed42 doesn't just log it — it **acts**:

```
📬  Inbound Email Arrives
        │
        ▼
🧠  Groq LLM extracts signal (PO, component, delay days, intent)
        │
        ▼
📊  Live DB → inventory coverage, production deadlines, shortfall
        │
        ▼
🔍  Market scan → compare alternate suppliers (price, lead time, quality, certs)
        │
        ▼
⚖️  Rules engine → negotiate / execute / escalate (budget threshold check)
        │
        ▼
✅  Auto-creates PO + payment  OR  sends clarification  OR  briefs human
        │
        ▼
📋  Full audit trail written to DB
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          seed42 System                            │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐ │
│  │  Gmail Push  │    │  REST API    │    │    MCP Server       │ │
│  │  Webhook     │    │  (Fastify)   │    │  (stdio / HTTP)     │ │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬──────────┘ │
│         │                   │                       │             │
│         └──────────┬─────────┘                      │             │
│                    ▼                                │             │
│           ┌─────────────────┐                       │             │
│           │   Orchestrator   │◄──────────────────────┘             │
│           │   (LangGraph)    │                                     │
│           └────────┬─────────┘                                     │
│                    │                                               │
│      ┌─────────────┼──────────────┐                               │
│      ▼             ▼              ▼                               │
│  ┌────────┐  ┌──────────┐  ┌────────────────┐                   │
│  │  Groq  │  │ Recovery │  │  Escalation    │                   │
│  │  LLM   │  │  Engine  │  │   + Audit      │                   │
│  └────────┘  └────┬─────┘  └───────┬────────┘                   │
│                   │                │                              │
│                   ▼                ▼                              │
│          ┌────────────────────────────────────┐                  │
│          │     Neon PostgreSQL (simulation)    │                  │
│          │  inventory · POs · suppliers ·      │                  │
│          │  production · tracking · audit      │                  │
│          └────────────────────────────────────┘                  │
│                                                                  │
│  ┌──────────────────────────────────────────────┐               │
│  │   Next.js Ops Desk  (frontend/)               │               │
│  │   Inventory · Approvals · Contacts ·           │               │
│  │   Quotations · Agent Runs · MCP Config         │               │
│  └──────────────────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧱 Core Modules

| Module | Path | Purpose |
|---|---|---|
| **Disruption Controller** | `src/agent/disruptionController.ts` | End-to-end: email → LLM → DB → suppliers → Groq brief |
| **Orchestrator** | `src/agent/orchestrator.ts` | LangGraph loop: parse → ERP snapshot → rules → execute/negotiate/escalate |
| **Crew** | `src/agent/crew.ts` | Runs shortage detection across all components concurrently |
| **Escalation** | `src/agent/escalation.ts` | Budget threshold guards and rule-based decision engine |
| **Audit** | `src/agent/audit.ts` | Records every decision step with full context |
| **Recovery Engine** | `src/sim/recovery.ts` | Best-supplier picker with cert + cost + lead-time constraints |
| **MCP Server** | `src/mcp/` | Exposes 7 tools over stdio or HTTP for Claude/Cursor |
| **Gmail Ingest** | `src/mail/gmail.ts` | Pub/Sub push webhook → full agent pipeline |
| **LLM Parser** | `src/llm/parser.ts` | Groq-powered raw email → structured JSON signal |
| **LLM Reasoner** | `src/llm/reasoner.ts` | Groq multi-supplier comparison + decision brief |
| **Ops Desk** | `frontend/` | Next.js dashboard — all simulation data in one place |

---

## 🚀 Quick Start

### Prerequisites

- Node.js v20+ (tested on v22)
- [Neon PostgreSQL](https://neon.tech) free instance
- [Groq API key](https://console.groq.com)

### Installation

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd seed42
npm install

# 2. Configure environment
cp .env.example .env
# → fill in DATABASE_URL, GROQ_API_KEY, and optionally RESEND_API_KEY

# 3. Initialize DB schema + seed golden scenario
npm run db:init

# 4. Start backend API
npm run dev          # → http://localhost:3000

# 5. Start Ops Desk frontend (separate terminal)
npm run dev:web      # → http://localhost:3001
```

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://USER:PASS@ep-xxx.region.neon.tech/neondb?sslmode=require
GROQ_API_KEY=gsk_...

# Optional
PORT=3000
HOST=0.0.0.0
RESEND_API_KEY=re_...          # Real email delivery via Resend
GMAIL_TOPIC=projects/xxx/...   # Gmail Pub/Sub push topic
AGENT_COVERAGE_DAYS=7          # Inbox lookback window (days)
```

---

## 🗄️ Database Scripts

```bash
npm run db:init      # Create schema + seed golden scenario (first-time setup)
npm run db:seed      # Re-seed golden scenario data only
npm run db:reset     # Full reset back to clean golden state
```

### Golden Scenario (pre-seeded)

| Entity | Detail |
|---|---|
| **COMP-104** (Motor Driver IC) | 390 usable units · 90/day usage → **4.3 days coverage** |
| **PO-7712** | 1,000 units from SUP-21 · status `delayed` · 5-day delay |
| **PROD-882** | 700 Smart Controller Units · deadline 2026-09-06 · priority `high` |
| **Suppliers** | 5 alternate suppliers with varying price, lead time, quality & certs |
| **Tracking contradiction** | SUP-21 claims "dispatched" but tracking shows `label_created_no_pickup` |
| **Approval threshold** | ₹150,000 (autonomous) / above = human gate |

---

## 📡 REST API Reference

All endpoints are Zod-validated. All responses are structured JSON.

### Health & System

```bash
GET  /health                     # System health + limit signals (mem, DB, keys)
GET  /api                        # Full endpoint map
```

### Inventory

```bash
GET  /inventory                              # All SKUs
GET  /inventory/:component_id               # Single component + coverage calc
POST /inventory/:component_id/stock         # Adjust current / usable stock
```

### Purchase Orders

```bash
GET  /purchase-orders                        # All POs  (filter: ?status=delayed)
GET  /purchase-orders/:po_id                # Single PO
```

### Suppliers & Contacts

```bash
GET    /suppliers?component_id=COMP-104     # Suppliers for a component
POST   /suppliers                           # Add new contact
PATCH  /suppliers/:supplier_id             # Update name / email / active status

# Messaging
POST /suppliers/:supplier_id/message       # Send email to a supplier
GET  /supplier-messages?direction=inbound  # Inbound or outbound message history
```

**Example — message a supplier:**
```bash
curl -X POST http://localhost:3000/suppliers/SUP-21/message \
  -H "Content-Type: application/json" \
  -d '{
    "po_id": "PO-7712",
    "subject": "Revised ETA on PO-7712",
    "body": "Port congestion was noted. Can you confirm the revised delivery date?"
  }'
```

### RFQ & Quotes

```bash
POST /rfq                                    # Create Request for Quote
GET  /rfqs                                   # All RFQs
GET  /rfq/:rfq_id/quotes                    # Quotes for one RFQ
GET  /rfq/quotes                            # All quotes across all RFQs
POST /rfq/quotes/:quote_id/accept           # Accept a specific quote
```

**Example — create RFQ:**
```bash
curl -X POST http://localhost:3000/rfq \
  -H "Content-Type: application/json" \
  -d '{
    "component_id": "COMP-104",
    "requested_quantity": 600,
    "required_delivery_date": "2026-09-06T00:00:00Z"
  }'
```

### Approvals

```bash
GET  /approvals                              # All approval records
POST /approval/check                        # Check if a cost needs a human gate
POST /approvals/:approval_id/action         # Human: approve or reject
```

**Auto-approve (under ₹150k threshold):**
```bash
curl -X POST http://localhost:3000/approval/check \
  -H "Content-Type: application/json" \
  -d '{"action_type": "emergency_purchase", "estimated_cost": 120000}'
# → {"approval_required": false}
```

**Requires human approval (above threshold):**
```bash
curl -X POST http://localhost:3000/approval/check \
  -H "Content-Type: application/json" \
  -d '{"action_type": "emergency_purchase", "estimated_cost": 168000}'
# → {"approval_required": true, "approval_reason": "Cost exceeds autonomous threshold of ₹150,000"}
```

### Disruptions & Simulation

```bash
GET  /disruptions                           # Active disruptions
POST /disruptions/inject                    # Inject a disruption event
GET  /simulation/state                      # Current clock + scenario status
POST /simulation/advance                    # Advance simulation clock N steps
POST /simulation/reset                      # Restore golden scenario
POST /simulation/inject-test               # Hidden eval scenarios
  # test_type: erp_mismatch | demand_spike | expedite_revoked | priority_change
```

**Inject a disruption:**
```bash
curl -X POST http://localhost:3000/disruptions/inject \
  -H "Content-Type: application/json" \
  -d '{
    "disruption_type": "supplier_delay",
    "component_id": "COMP-104",
    "severity": "high",
    "description": "Port congestion delaying incoming shipment"
  }'
```

**Advance simulation clock:**
```bash
curl -X POST http://localhost:3000/simulation/advance \
  -H "Content-Type: application/json" \
  -d '{"steps": 2}'
```

### Tracking

```bash
GET /tracking/:po_id                        # Shipment status + contradiction flag
```

The agent uses this to **challenge supplier claims**. If a supplier reports "dispatched" but tracking shows `label_created_no_pickup`, the agent flags the contradiction, marks supplier reliability risk, and sources elsewhere.

### Audit Trail

```bash
GET  /audit/:disruption_id                 # Full audit for a disruption (DIS-001, etc.)
POST /audit                                 # Manually record an audit event
```

### ERP & Config

```bash
POST  /erp/update                           # Log any ERP record change
GET   /config                              # All business rule config values
PATCH /config/:key                         # Update a rule (e.g. approval_threshold)
POST  /ingest/sync                         # Sync CSV data files into DB
```

### Recovery Engine

```bash
POST /recovery/evaluate                     # Score recovery options (read-only)
POST /recovery/execute                      # Evaluate + choose best supplier + create PO
```

---

## 🤖 AI Agent Endpoints

```bash
# Full autonomous email pipeline (Groq LLM + DB + supplier comparison)
POST /agent/process-email
  Body: { email_body, subject?, from_email? }

# Evaluate any disruption by component/PO/delay directly
POST /agent/evaluate
  Body: { component_id?, po_id?, reported_delay_days?, email_body? }

# Run full shortage crew across all components
POST /agent/run
  Body: { component_id? }

# Live SSE stream of real-time agent events
GET  /agent/events/stream

# All past agent runs with event timelines
GET  /agent/runs

# Mail plan + Gmail boundary status
GET  /agent/mail-status
```

**Full autonomous email flow:**
```bash
curl -X POST http://localhost:3000/agent/process-email \
  -H "Content-Type: application/json" \
  -d '{
    "email_body": "Due to port congestion PO-7712 delivery is delayed by 7 days.",
    "subject": "Delay Notification - PO-7712",
    "from_email": "supplier21@example.com"
  }'
```

Response includes:
- **Extracted signal** (LLM-parsed: PO, component, delay, intent, classification)
- **Inventory & buffer analysis** (usable stock, days of coverage, shortfall)
- **Multi-supplier market comparison** (price diffs, expedite options, cert checks)
- **Groq reasoning + recommended action** (confidence, rationale, risks)

---

## 🤖 MCP Server (Claude / Cursor / Windsurf Integration)

seed42 exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so any MCP-compatible LLM client can directly operate the supply chain.

### Available Tools

| Tool | What It Does |
|---|---|
| `list_inventory` | All SKUs: warehouse, usable stock, days of coverage |
| `update_inventory` | Write stock levels (same validator as the web desk) |
| `list_approvals` | Pending / approved / rejected human gates |
| `decide_approval` | Approve or reject an `approval_id` (no invented payments) |
| `list_suppliers` | Contacts + scores, filterable by `component_id` |
| `list_quotations` | All RFQ quotes in the simulation |
| `list_supplier_messages` | Inbound or outbound supplier mail rows |

### Connect Locally — Cursor / Windsurf

```jsonc
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "seed42-operations": {
      "command": "node",
      "args": ["--import", "tsx/esm", "src/mcp/index.ts"],
      "cwd": "/path/to/seed42",
      "env": { "NODE_OPTIONS": "--no-warnings" }
    }
  }
}
```

### Connect to Live Cloud — Claude Desktop

```jsonc
// %APPDATA%\Claude\claude_desktop_config.json
{
  "mcpServers": {
    "seed42-cloud": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://seed42-agent-production.up.railway.app/mcp"]
    }
  }
}
```

### Browser Inspector

```bash
npx -y @modelcontextprotocol/inspector https://seed42-agent-production.up.railway.app/mcp
```

```bash
# Run locally
npm run mcp:stdio    # stdio mode (Cursor/Claude)
npm run mcp:http     # HTTP mode
npm run mcp:check    # Self-check tool registration
```

---

## 🖥️ Ops Desk (Frontend)

A **Next.js 15** control panel at `frontend/` — one tab per domain:

| Tab | What You See |
|---|---|
| 🏠 **Home** | Live simulation clock, active disruptions, recent agent runs |
| 📦 **Inventory** | Editable stock grid with days-of-coverage colour warnings |
| ✅ **Approvals** | Pending human gates — approve or reject with one click, triggers crew resume |
| 👥 **Contacts** | Supplier directory — add, edit, see reliability & quality scores |
| 💬 **Quotations** | RFQ quotes with inline accept button |
| ✉️ **Sent Mail** | All outbound supplier messages sent by the agent |
| 📜 **History** | Inbound email log |
| 🤖 **Agents** | Per-run timeline: events, decisions, ERP actions, payment records |
| 🔌 **MCP** | Copy-paste config for Cursor, Claude Desktop, or browser inspector |

```bash
npm run dev:web      # Start frontend dev server
npm run build:web    # Production build
```

---

## 🧠 AI Pipeline Deep-Dive

### Step 1 — Email Parsing (Groq)

`src/llm/parser.ts` — raw email text → structured `ParsedEmailSignal`:

```json
{
  "affected_po_id": "PO-7712",
  "component_id": "COMP-104",
  "reported_delay_days": 7,
  "disruption_cause": "Port congestion",
  "classification": "delayed-with-date",
  "deal_intent": "delay",
  "summary": "SUP-21 reports 7-day delay on PO-7712 due to port congestion"
}
```

### Step 2 — Disruption Controller (10-step autonomous flow)

`src/agent/disruptionController.ts`:

1. Parse email **or** accept direct API parameters
2. Resolve PO + component from DB
3. Fetch component details + required certifications
4. Calculate inventory metrics: usable stock · daily usage · days of coverage · shortfall
5. Find affected production orders and compute required quantity
6. Look up baseline supplier price
7. Query all market alternatives with price diffs, expedite options, cert checks
8. Read approval threshold from config table
9. Generate **Groq reasoning brief** (structured recommendation with rationale)
10. Return complete `DisruptionReportOutput`

### Step 3 — Orchestrator (LangGraph loop)

`src/agent/orchestrator.ts` — Inbound email → ERP snapshot → rules → action:

```
negotiate  →  Send clarification email back to supplier
execute    →  Accept quote + create PO + record simulated payment
escalate   →  Create approval request + brief human with decision context
```

### Step 4 — Groq Reasoning Output

```json
{
  "recommended_action": "execute_emergency_po",
  "chosen_supplier_id": "SUP-42",
  "chosen_supplier_name": "Western Components Ltd",
  "estimated_cost": 81600,
  "approval_required": false,
  "confidence": "high",
  "rationale": "SUP-42 meets ISO-9001 certification, delivers in 4 days (before 4.3-day stockout), at ₹136/unit. Original supplier tracking shows contradiction — label created but no pickup. Expedited option available at ₹93,600 if standard delivery slips.",
  "remaining_risks": [
    "SUP-42 reliability score 0.81 — monitor closely",
    "Expedite fee adds ₹12,000 if standard delivery is further delayed"
  ]
}
```

---

## 🎯 Evaluation Criteria

| Criterion | Weight | How seed42 Handles It |
|---|---:|---|
| Production Continuity | 35% | Automatic alternate sourcing before stockout; split-order support |
| Cost Control | 20% | Approval threshold enforced; cheapest certified supplier selected |
| Supplier Risk Handling | 15% | Tracking contradiction detection; cert verification; reliability scoring |
| Tool Efficiency | 10% | Each tool called with purpose; no blind sequential iteration |
| Recovery & Replanning | 10% | LangGraph loop re-evaluates on new signals; hidden test injection supported |
| Audit Trail | 10% | Every step recorded: signal → data → alternatives → decision → ERP |

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v22 · TypeScript 5.5 · ESM modules |
| **API Server** | Fastify 4.28 + `@fastify/cors` |
| **Validation** | Zod 3.23 (all request bodies + query params) |
| **AI / LLM** | Groq (`llama-3.3-70b-versatile`) via LangChain + `@langchain/groq` |
| **Agent Framework** | LangGraph 1.4 (`@langchain/langgraph`) |
| **Database** | Neon PostgreSQL (serverless) + `pg` driver |
| **ORM / Migrations** | Prisma 5.20 |
| **Job Queues** | BullMQ 5.12 + IORedis |
| **MCP Protocol** | `@modelcontextprotocol/sdk` 1.30 |
| **Email** | Resend (outbound) + Gmail Pub/Sub (inbound webhook) |
| **Frontend** | Next.js 15 · React 19 · Vanilla CSS |
| **Testing** | Vitest 1.6 + supertest |
| **Deployment** | Railway (backend) + Vercel (frontend) |

---

## 🧪 Testing

```bash
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npm run mcp:check     # Self-check MCP server tool registration
```

---

## 📁 Project Structure

```
seed42/
├── src/
│   ├── agent/
│   │   ├── disruptionController.ts  # 10-step autonomous disruption flow
│   │   ├── orchestrator.ts          # LangGraph email → action loop
│   │   ├── crew.ts                  # Multi-component shortage runner
│   │   ├── escalation.ts            # Budget guard + decision rules
│   │   ├── audit.ts                 # Decision recording
│   │   ├── supplier.ts              # Recovery + deal risk collection
│   │   ├── simulation.ts            # ERP snapshot loader
│   │   └── bus.ts                   # SSE event bus
│   ├── llm/
│   │   ├── parser.ts                # Groq email → ParsedEmailSignal
│   │   └── reasoner.ts              # Groq multi-supplier reasoning brief
│   ├── sim/                         # Simulation data layer (one file per domain)
│   │   ├── inventory.ts
│   │   ├── purchaseOrders.ts
│   │   ├── suppliers.ts
│   │   ├── production.ts
│   │   ├── rfq.ts
│   │   ├── approval.ts
│   │   ├── tracking.ts
│   │   ├── messaging.ts
│   │   ├── events.ts                # Disruption injection + sim clock
│   │   ├── recovery.ts              # Recovery evaluation + execution
│   │   ├── erp.ts
│   │   ├── config.ts
│   │   └── agentStore.ts            # Agent runs + payments
│   ├── api/
│   │   └── routes.ts                # All 40+ Fastify route handlers
│   ├── mail/
│   │   ├── gmail.ts                 # Gmail Pub/Sub webhook
│   │   └── deliver.ts               # Mailbox planning
│   ├── mcp/
│   │   ├── index.ts                 # MCP server (stdio + HTTP)
│   │   └── selfcheck.ts
│   ├── audit/
│   │   └── trail.ts
│   ├── ingest/
│   │   └── sync.ts                  # CSV → DB sync
│   ├── config/
│   │   └── env.ts
│   └── index.ts                     # Server bootstrap
├── frontend/                        # Next.js Ops Desk
│   └── app/
│       ├── desk.tsx                 # Full dashboard (9 tabs)
│       ├── globals.css
│       └── layout.tsx
├── prisma/                          # Prisma schema + migrations
├── data/                            # CSV seed files
├── tests/                           # Vitest test suites
├── .env.example                     # Environment variable template
└── package.json
```

---

## 🌐 Live Deployment

| Service | URL |
|---|---|
| Backend API | `https://seed42-agent-production.up.railway.app` |
| MCP Endpoint | `https://seed42-agent-production.up.railway.app/mcp` |
| API Root | `https://seed42-agent-production.up.railway.app/api` |

---

## 📋 License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0ea5e9,50:7c3aed,100:06b6d4&height=100&section=footer&animation=fadeIn" width="100%" />

**Built for [Hackers Occupied Pune](https://hop.dev) · Team seed42**

*The agent doesn't just alert. It acts.*

</div>

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
