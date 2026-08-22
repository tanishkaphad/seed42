'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const fmt = (x?: string | null) =>
  x ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(x)) : '—';

type Tab = 'home' | 'inventory' | 'approvals' | 'contacts' | 'quotations' | 'sent' | 'history' | 'agents' | 'mcp';

const MCP_TOOLS = [
  { name: 'list_inventory', does: 'Read every SKU, warehouse, usable stock, and days of coverage from Neon.' },
  { name: 'update_inventory', does: 'Write current/usable stock through the same validator the desk uses.' },
  { name: 'list_approvals', does: 'Show pending, approved, and rejected human gates.' },
  { name: 'decide_approval', does: 'Approve or reject an existing approval_id (never invents payment).' },
  { name: 'list_suppliers', does: 'List contacts and scores; optional filter by component_id.' },
  { name: 'list_quotations', does: 'List RFQ quotes stored in the simulation.' },
  { name: 'list_supplier_messages', does: 'List inbound or outbound supplier mail rows.' },
];

const MCP_CONFIG = {
  mcpServers: {
    'seed42-operations': {
      command: 'node',
      args: ['--import', 'tsx/esm', 'src/mcp/index.ts'],
      cwd: 'C:\\AAYUSH\\5_College\\Projects\\seed42',
      env: { NODE_OPTIONS: '--no-warnings' },
    },
  },
};

function McpConfigBlock() {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(MCP_CONFIG, null, 2);
  return (
    <div style={{ position: 'relative', marginBottom: 28 }}>
      <pre style={{
        background: 'var(--ink)', color: '#d7fa4a', padding: '20px 24px',
        fontSize: 12, lineHeight: 1.7, overflowX: 'auto', margin: 0,
        fontFamily: 'var(--mono)',
      }}>{text}</pre>
      <button
        type="button"
        style={{
          position: 'absolute', top: 12, right: 12,
          background: copied ? 'var(--acid)' : 'transparent',
          border: '1px solid var(--acid)', color: copied ? 'var(--ink)' : 'var(--acid)',
          padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)',
          transition: '.2s',
        }}
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}


function badgeKind(x: string) {
  const t = String(x || 'unknown');
  if (/approved|accepted|sent|delivered|healthy|active|compliant|simulated_paid|execute/i.test(t)) return 'good';
  if (/pending|warning|open|review|waiting/i.test(t)) return 'warn';
  if (/rejected|critical|failed|escalat/i.test(t)) return 'bad';
  return 'neutral';
}

async function api(path: string, options?: RequestInit) {
  const r = await fetch(path, options);
  const text = await r.text();
  let d: any = {};
  try {
    d = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path} is not the simulation API (got HTML/empty). Start the Fastify server.`);
  }
  if (!r.ok) throw new Error(d.error || d.message || d.details || `${path} ${r.status}`);
  return d;
}

async function settled<T>(path: string, pick: (d: any) => T, fallback: T): Promise<{ value: T; error?: string }> {
  try {
    return { value: pick(await api(path)) };
  } catch (e: any) {
    return { value: fallback, error: e.message };
  }
}

export default function Desk() {
  const [tab, setTab] = useState<Tab>('home');
  const [toast, setToast] = useState('');
  const [sim, setSim] = useState({ status: 'CONNECTING', time: '—' });
  const [mailLine, setMailLine] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [invFilter, setInvFilter] = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [selectedInbox, setSelectedInbox] = useState<any | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<any | null>(null);
  const [lcBriefs, setLcBriefs] = useState<{ agent: string; brief: string }[]>([]);
  const [lcForRun, setLcForRun] = useState<string | null>(null);
  const [formError, setFormError] = useState({ rfq: '', contact: '', inbound: '' });
  const [loadError, setLoadError] = useState('');
  const rfqRef = useRef<HTMLDialogElement>(null);
  const contactRef = useRef<HTMLDialogElement>(null);
  const inboundRef = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const ping = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const load = useCallback(async () => {
    // ponytail: allSettled so a missing /agent/* on a stale API does not wipe inventory
    const [i, a, s, q, o, n, st, r, mail] = await Promise.all([
      settled('/sim/inventory', (d) => d.inventory || [], []),
      settled('/sim/approvals', (d) => d.approvals || [], []),
      settled('/sim/suppliers', (d) => d.suppliers || [], []),
      settled('/sim/rfq/quotes', (d) => d.quotes || [], []),
      settled('/sim/supplier-messages?direction=outbound', (d) => d.messages || [], []),
      settled('/sim/supplier-messages?direction=inbound', (d) => d.messages || [], []),
      settled('/sim/simulation/state', (d) => d, null),
      settled('/sim/agent/runs', (d) => d.runs || [], []),
      settled('/sim/agent/mail-status', (d) => d, null),
    ]);
    setInventory(i.value);
    setApprovals(a.value);
    setSuppliers(s.value);
    setQuotes(q.value);
    setSent(o.value);
    setInbox(n.value);
    setRuns(r.value);
    if (st.value) setSim({ status: String(st.value.status || 'LIVE').toUpperCase(), time: `DAY ${st.value.simulation_time ?? '—'}` });
    else setSim({ status: 'OFFLINE', time: '—' });
    const mailVal = mail.value as any;
    setMailLine(
      mailVal?.mailbox?.mode === 'live'
        ? `Live mail on. Outbound copies go to ${mailVal.mailbox.to}. Gmail: ${mailVal.gmail?.mode || 'simulation_fallback'}.`
        : mailVal
          ? `Sandbox mail only. Gmail: ${mailVal.gmail?.mode || 'simulation_fallback'}. Add RESEND_API_KEY and MAIL_TO for live reports.`
          : 'Agent mail status unavailable — the API on this port is an older build.'
    );
    setSelectedInbox((prev: any) => prev || n.value?.[0] || null);
    setSelectedRun((prev) => prev || r.value?.[0]?.run_id || null);
    const errs = [i, a, s, q, o, n, st, r, mail].map((x) => x.error).filter(Boolean);
    if (!i.value.length && i.error) {
      setLoadError(`No live data: ${i.error} Start the current API (npm run dev in the repo root).`);
    } else if (errs.length) {
      setLoadError(`Loaded inventory, but some routes failed (${errs[0]}). Point API_ORIGIN at the current Fastify process.`);
    } else {
      setLoadError('');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const stream = new EventSource('/sim/agent/events/stream');
    stream.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.agent === 'audit' || data.agent === 'escalation') {
          ping(`${data.agent}: ${data.message}`);
          load();
        }
      } catch {
        /* ignore keepalives */
      }
    };
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [load, ping]);

  useEffect(() => {
    if (!selectedRun) {
      setRunDetail(null);
      return;
    }
    api(`/sim/agent/runs/${selectedRun}`)
      .then(setRunDetail)
      .catch((e) => ping(e.message));
  }, [selectedRun, ping, runs]);

  const ranked = useMemo(
    () => [...suppliers].sort((a, b) => +b.reliability_score + +b.quality_score - (+a.reliability_score + +a.quality_score)),
    [suppliers]
  );
  const shownInv = inventory.filter((x) =>
    `${x.component_id} ${x.component_name} ${x.warehouse}`.toLowerCase().includes(invFilter.toLowerCase())
  );
  const shownContacts = ranked.filter((x) =>
    `${x.supplier_name} ${x.email} ${x.supplier_id}`.toLowerCase().includes(contactFilter.toLowerCase())
  );
  const shownApprovals = approvals.filter((x) => approvalFilter === 'all' || x.approval_status === approvalFilter);
  const critical = inventory.filter((x) => x.days_of_coverage < 3).length;
  const units = inventory.reduce((s, x) => s + Number(x.usable_stock), 0);

  async function saveStock(id: string, field: 'current_stock' | 'usable_stock', value: number) {
    const row = inventory.find((y) => y.component_id === id);
    if (!row || !Number.isInteger(value) || value < 0) {
      ping('Stock must be a non-negative whole number.');
      return load();
    }
    try {
      await api(`/sim/inventory/${id}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_stock: field === 'current_stock' ? value : row.current_stock,
          usable_stock: field === 'usable_stock' ? value : row.usable_stock,
        }),
      });
      ping('Inventory updated.');
      load();
    } catch (e: any) {
      ping(e.message);
      load();
    }
  }

  async function onRfq(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api('/sim/rfq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component_id: f.get('component_id'),
          requested_quantity: Number(f.get('requested_quantity')),
          required_delivery_date: f.get('required_delivery_date'),
        }),
      });
      rfqRef.current?.close();
      e.currentTarget.reset();
      ping('RFQ created and supplier quotes requested.');
      load();
    } catch (err: any) {
      setFormError((s) => ({ ...s, rfq: err.message }));
    }
  }

  async function onContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api('/sim/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_name: f.get('supplier_name'), email: f.get('email') }),
      });
      contactRef.current?.close();
      e.currentTarget.reset();
      ping('Contact saved.');
      load();
    } catch (err: any) {
      setFormError((s) => ({ ...s, contact: err.message }));
    }
  }

  async function onInbound(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const r = await api('/api/agents/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: f.get('from'), subject: f.get('subject'), text: f.get('text') }),
      });
      inboundRef.current?.close();
      e.currentTarget.reset();
      setLcBriefs(r.briefs || []);
      setLcForRun(r.result?.run_id || null);
      if (r.result?.run_id) setSelectedRun(r.result.run_id);
      ping(`Inbound agent: ${r.result?.status || r.langchain}.`);
      setTab('agents');
      load();
    } catch (err: any) {
      setFormError((s) => ({ ...s, inbound: err.message }));
    }
  }

  function exportCsv() {
    const h = ['Component ID', 'Component Name', 'Warehouse', 'Current Stock', 'Usable Stock', 'Daily Usage', 'Safety Stock', 'Days Coverage'];
    const csv = [h, ...inventory.map((x) => [x.component_id, x.component_name, x.warehouse, x.current_stock, x.usable_stock, x.daily_usage, x.safety_stock, x.days_of_coverage])]
      .map((r) => r.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'inventory.csv' });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pendingApprovals = approvals.filter((x) => x.approval_status === 'pending_human_approval').length;
  const tabs: { id: Tab; icon: string; label: string; count: number; urgent?: boolean }[] = [
    { id: 'home',       icon: '⌂',  label: 'Home',         count: 0 },
    { id: 'inventory',  icon: '▦',  label: 'Inventory',    count: inventory.length },
    { id: 'approvals',  icon: '⏳', label: 'Approvals',    count: approvals.length, urgent: pendingApprovals > 0 },
    { id: 'contacts',   icon: '◎',  label: 'Contacts',     count: suppliers.length },
    { id: 'quotations', icon: '📋', label: 'Quotations',   count: quotes.length },
    { id: 'sent',       icon: '✉',  label: 'Sent',         count: sent.length },
    { id: 'history',    icon: '📥', label: 'Inbox',        count: inbox.length },
    { id: 'agents',     icon: '⚙',  label: 'Agents',       count: runs.length },
    { id: 'mcp',        icon: '⬡',  label: 'MCP',          count: MCP_TOOLS.length },
  ];

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#inventory">
          <span className="brand-mark">S42</span>
          <span>
            SUPPLY
            <br />
            CONTROL ROOM
          </span>
        </a>
        <nav className="topnav" aria-label="Dashboard sections">
          {tabs.map((t) => (
            <button key={t.id} className={`tab${tab === t.id ? ' is-active' : ''}`} type="button" onClick={() => setTab(t.id)}>
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
              {t.count > 0 && <span className={t.urgent ? 'tab-badge urgent' : 'tab-badge'}>{t.count}</span>}
            </button>
          ))}
        </nav>
        <div className="live-status">
          <i />
          <span>{sim.status}</span>
          <span>/</span>
          <span>{sim.time}</span>
        </div>
        <button className="icon-button" type="button" onClick={() => { load(); ping('Refreshing live data…'); }}>
          ↻ <span>Refresh</span>
        </button>
      </header>
      <main>
        <section className={`panel home-panel${tab === 'home' ? ' is-active' : ''}`}>
          <div className="home-hero">
            <div>
              <p className="eyebrow">SEED42 / SUPPLY CHAIN INTELLIGENCE</p>
              <h1>Supply Control Room</h1>
              <p className="home-sub">An autonomous agent desk for managing inventory risk, supplier decisions, and procurement workflows — backed live by Neon PostgreSQL.</p>
              {loadError && <p className="home-alert">{loadError}</p>}
            </div>
            <div className="home-status-box">
              <p className="eyebrow">SYSTEM STATUS</p>
              <div className="home-stat"><span className="home-stat-val">{inventory.length}</span><span>components tracked</span></div>
              <div className="home-stat"><span className="home-stat-val" style={{color: critical > 0 ? 'var(--orange)' : 'var(--green)'}}>{critical}</span><span>critical coverage</span></div>
              <div className="home-stat"><span className="home-stat-val" style={{color: pendingApprovals > 0 ? 'var(--orange)' : 'var(--green)'}}>{pendingApprovals}</span><span>pending approvals</span></div>
              <div className="home-stat"><span className="home-stat-val">{suppliers.length}</span><span>suppliers registered</span></div>
            </div>
          </div>

          <div className="home-section">
            <h2 className="home-h2">Quick Start</h2>
            <p className="home-desc">Two terminals. That&apos;s all you need.</p>
            <div className="home-steps">
              <div className="home-step">
                <span className="home-step-n">01</span>
                <div>
                  <strong>Start the backend API</strong>
                  <p>From the repo root — starts Fastify on port 3002 + connects to Neon DB.</p>
                  <pre className="home-code">npm run dev</pre>
                </div>
              </div>
              <div className="home-step">
                <span className="home-step-n">02</span>
                <div>
                  <strong>Start this dashboard</strong>
                  <p>From the <span className="mono">frontend/</span> folder — starts Next.js on port 3001.</p>
                  <pre className="home-code">cd frontend{`\n`}npm run dev</pre>
                </div>
              </div>
              <div className="home-step">
                <span className="home-step-n">03</span>
                <div>
                  <strong>Open the desk</strong>
                  <p>Navigate to this page. All tabs pull live data automatically.</p>
                  <pre className="home-code">http://localhost:3001</pre>
                </div>
              </div>
            </div>
          </div>

          <div className="home-section">
            <h2 className="home-h2">What each tab does</h2>
            <p className="home-desc">Click any card to jump straight to that section.</p>
            <div className="home-cards">
              {([
                { id: 'inventory'  as Tab, icon: '▦',  title: 'Inventory',     color: 'var(--green)', desc: 'Live Excel-style table of every component. Edit stock values directly in the cell — changes write to Neon instantly. Color-coded coverage badges flag critical SKUs (< 3 days) and export to CSV.' },
                { id: 'approvals'  as Tab, icon: '⏳', title: 'Approvals',     color: 'var(--orange)', desc: 'Human-in-the-loop gate. When the agent wants to place an order above ₹1,50,000 it creates an approval. You Approve or Reject here — the agent only emails the supplier after your go-ahead.' },
                { id: 'contacts'   as Tab, icon: '◎',  title: 'Contacts',      color: '#5b5fcf', desc: 'Supplier directory ranked by reliability and quality score. Top-3 get highlighted cards. Add new supplier mailboxes here so the agent knows where to send RFQs and shortage alerts.' },
                { id: 'quotations' as Tab, icon: '📋', title: 'Quotations',    color: '#0891b2', desc: 'Quotes received from suppliers in response to RFQs. Compare unit price, lead time, and certification status side by side. Hit Accept Quote to lock in the deal and trigger an approval.' },
                { id: 'sent'       as Tab, icon: '✉',  title: 'Sent Emails',   color: '#7c3aed', desc: 'Every email the agent dispatched to a supplier after approval. Click Read on any row to open the full email body in the Inbox tab. Delivery status tracks whether the message was received.' },
                { id: 'history'    as Tab, icon: '📥', title: 'Inbox',         color: '#b45309', desc: 'Inbound supplier messages received by the system. Select any message to read its full body and the decision trace — what the agent saw, what it decided, and which PO it was linked to.' },
                { id: 'agents'     as Tab, icon: '⚙',  title: 'Agents',        color: '#374151', desc: 'Shortage crew runs. Hit Run shortage crew to trigger the autonomous agent loop — it checks inventory, finds alternatives, creates approvals, and logs every step. Inspect the audit trail here.' },
                { id: 'mcp'        as Tab, icon: '⬡',  title: 'MCP',           color: '#1d4ed8', desc: 'Model Context Protocol bridge for Cursor. Paste the server config into Cursor Settings → MCP to give any AI agent in Cursor direct read/write access to this database using the 7 registered tools.' },
              ] as {id:Tab,icon:string,title:string,color:string,desc:string}[]).map((c) => (
                <button key={c.id} className="home-card" type="button" onClick={() => setTab(c.id)}>
                  <span className="home-card-icon" style={{background: c.color}}>{c.icon}</span>
                  <strong>{c.title}</strong>
                  <p>{c.desc}</p>
                  <span className="home-card-cta">Open →</span>
                </button>
              ))}
            </div>
          </div>

          <div className="home-section">
            <h2 className="home-h2">How the agent loop works</h2>
            <div className="home-flow">
              <div><b>1</b><strong>Disruption detected</strong><p>Supplier sends a delay email. The agent ingests it via the Ingest inbound button in Contacts or via Resend webhook.</p></div>
              <div><b>2</b><strong>Inventory checked</strong><p>Agent reads usable stock, daily burn rate, and days of coverage from Neon to assess how urgent the shortage is.</p></div>
              <div><b>3</b><strong>Alternatives sourced</strong><p>Agent queries ranked suppliers, compares prices, lead times, and certifications, then selects the best fallback option.</p></div>
              <div><b>4</b><strong>Human gate</strong><p>If the estimated cost exceeds ₹1,50,000 an approval is created. You approve or reject it in the Approvals tab.</p></div>
              <div><b>5</b><strong>Email sent</strong><p>After approval the agent dispatches the supplier email. It appears in Sent Emails and the full audit trail is in Agents.</p></div>
            </div>
          </div>
        </section>

        <section className={`panel${tab === 'inventory' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE STOCK LEDGER</p>
              <h2>Inventory</h2>
              <p>Directly backed by the operational database. Edit stock values in place.</p>
            </div>
            <div className="toolbar">
              <input type="search" placeholder="Filter components…" value={invFilter} onChange={(e) => setInvFilter(e.target.value)} />
              <button className="button ghost" type="button" onClick={exportCsv}>Export CSV</button>
            </div>
          </div>
          <div className="risk-strip">
            <div><strong>{inventory.length}</strong><span>Tracked components</span></div>
            <div><strong>{critical}</strong><span>Critical coverage</span></div>
            <div><strong>{units.toLocaleString()}</strong><span>Usable units</span></div>
          </div>
          <div className="table-shell">
            <table>
              <thead><tr><th>Component</th><th>Warehouse</th><th>Current</th><th>Usable</th><th>Daily burn</th><th>Safety</th><th>Coverage</th><th>Last sync</th></tr></thead>
              <tbody>
                {shownInv.length ? shownInv.map((x) => {
                  const c = x.days_of_coverage < 3 ? 'bad' : x.days_of_coverage < 7 ? 'warn' : 'good';
                  return (
                    <tr key={x.component_id}>
                      <td><strong>{x.component_name || x.component_id}</strong><br /><span className="mono">{x.component_id}</span></td>
                      <td>{x.warehouse}</td>
                      <td><input className="editable" type="number" min={0} defaultValue={x.current_stock} onBlur={(e) => saveStock(x.component_id, 'current_stock', Number(e.target.value))} /></td>
                      <td><input className="editable" type="number" min={0} defaultValue={x.usable_stock} onBlur={(e) => saveStock(x.component_id, 'usable_stock', Number(e.target.value))} /></td>
                      <td>{x.daily_usage}</td>
                      <td>{x.safety_stock}</td>
                      <td><span className={`badge ${c}`}>{x.days_of_coverage} days</span></td>
                      <td className="mono">{fmt(x.last_updated)}</td>
                    </tr>
                  );
                }) : <tr><td className="empty" colSpan={8}>No records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`panel${tab === 'approvals' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">HUMAN GATE</p>
              <h2>Approvals</h2>
              <p>Actions that require a person’s decision before the agent can proceed.</p>
            </div>
            <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}>
              <option value="all">All decisions</option>
              <option value="pending_human_approval">Needs review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="table-shell">
            <table>
              <thead><tr><th>Request</th><th>Action</th><th>Value</th><th>Reason</th><th>Status</th><th>Created</th><th /></tr></thead>
              <tbody>
                {shownApprovals.length ? shownApprovals.map((x) => (
                  <tr key={x.approval_id}>
                    <td className="mono">{x.approval_id}</td>
                    <td>{x.action_type}</td>
                    <td>{money.format(x.estimated_cost)}</td>
                    <td>{x.reason}</td>
                    <td><span className={`badge ${badgeKind(x.approval_status)}`}>{String(x.approval_status).replaceAll('_', ' ')}</span></td>
                    <td className="mono">{fmt(x.created_at)}</td>
                    <td>
                      {x.approval_status === 'pending_human_approval' && (
                        <>
                          <button className="row-button" type="button" onClick={async () => { await api(`/sim/approvals/${x.approval_id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approved' }) }); ping('Request approved.'); load(); }}>Approve</button>{' '}
                          <button className="row-button" type="button" onClick={async () => { await api(`/sim/approvals/${x.approval_id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rejected' }) }); ping('Request rejected.'); load(); }}>Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                )) : <tr><td className="empty" colSpan={7}>No records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`panel${tab === 'contacts' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">SUPPLIER DIRECTORY</p>
              <h2>Contacts</h2>
              <p>Add supplier mailboxes, then the agent ingests their replies, checks the deal, and reports to you.</p>
            </div>
            <div className="toolbar">
              <input type="search" placeholder="Search suppliers…" value={contactFilter} onChange={(e) => setContactFilter(e.target.value)} />
              <button className="button" type="button" onClick={() => contactRef.current?.showModal()}>Add contact</button>
              <button className="button ghost" type="button" onClick={() => inboundRef.current?.showModal()}>Ingest inbound</button>
            </div>
          </div>
          <div className="supplier-cards">
            {ranked.slice(0, 3).map((x, i) => (
              <article className="supplier-card" key={x.supplier_id}>
                <span className="rank">#{i + 1}</span>
                <b>{x.supplier_name}</b>
                <p>{Math.round(+x.reliability_score * 100)}% reliable / {Math.round(+x.quality_score * 100)}% quality</p>
              </article>
            ))}
          </div>
          <div className="table-shell">
            <table>
              <thead><tr><th>Rank</th><th>Supplier</th><th>Contact</th><th>Reliability</th><th>Quality</th><th>Standing</th></tr></thead>
              <tbody>
                {shownContacts.length ? shownContacts.map((x) => {
                  const n = ranked.indexOf(x) + 1;
                  const standing = n === 1 ? 'Best overall' : n <= 3 ? 'Preferred' : 'Qualified';
                  return (
                    <tr key={x.supplier_id}>
                      <td>#{n}</td>
                      <td><strong>{x.supplier_name}</strong><br /><span className="mono">{x.supplier_id}</span></td>
                      <td>{x.email}</td>
                      <td>{Math.round(+x.reliability_score * 100)}%</td>
                      <td>{Math.round(+x.quality_score * 100)}%</td>
                      <td><span className={`badge ${badgeKind(standing)}`}>{standing}</span></td>
                    </tr>
                  );
                }) : <tr><td className="empty" colSpan={6}>No records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`panel${tab === 'quotations' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">MARKET RESPONSE</p>
              <h2>Quotation Received</h2>
              <p>Supplier quotes are saved against their RFQs and ready for selection.</p>
            </div>
            <button className="button" type="button" onClick={() => rfqRef.current?.showModal()}>New RFQ</button>
          </div>
          <div className="table-shell">
            <table>
              <thead><tr><th>Quote</th><th>RFQ</th><th>Component</th><th>Supplier</th><th>Available</th><th>Unit price</th><th>Lead time</th><th>Compliance</th><th /></tr></thead>
              <tbody>
                {quotes.length ? quotes.map((x) => (
                  <tr key={x.quote_id}>
                    <td className="mono">{x.quote_id}</td>
                    <td className="mono">{x.rfq_id}</td>
                    <td>{x.component_name || x.component_id || '—'}</td>
                    <td>{x.supplier_name}</td>
                    <td>{x.quantity_available}</td>
                    <td>{money.format(x.unit_price)}</td>
                    <td>{x.delivery_days} days</td>
                    <td><span className={`badge ${badgeKind(x.has_required_certification ? 'Compliant' : 'Review')}`}>{x.has_required_certification ? 'Compliant' : 'Review'}</span></td>
                    <td>
                      {x.accepted ? <span className="badge good">Accepted</span> : (
                        <button className="row-button" type="button" onClick={async () => { await api(`/sim/rfq/quotes/${x.quote_id}/accept`, { method: 'POST' }); ping('Quotation accepted.'); load(); }}>Accept quote</button>
                      )}
                    </td>
                  </tr>
                )) : <tr><td className="empty" colSpan={9}>No supplier quotations received yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`panel${tab === 'sent' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">OUTBOUND LOG</p>
              <h2>Sent Emails</h2>
              <p>Agent messages released after the required approval.</p>
            </div>
          </div>
          <div className="table-shell">
            <table>
              <thead><tr><th>To</th><th>Subject</th><th>Reference</th><th>Delivery</th><th>Sent</th><th /></tr></thead>
              <tbody>
                {sent.length ? sent.map((x) => (
                  <tr key={x.message_id}>
                    <td>{x.supplier_name || x.supplier_id}</td>
                    <td><strong>{x.subject}</strong></td>
                    <td className="mono">{x.po_id || '—'}</td>
                    <td><span className={`badge ${badgeKind(x.message_status)}`}>{String(x.message_status).replaceAll('_', ' ')}</span></td>
                    <td className="mono">{fmt(x.sent_at)}</td>
                    <td><button className="row-button" type="button" onClick={() => { setSelectedInbox(x); setTab('history'); }}>Read</button></td>
                  </tr>
                )) : <tr><td className="empty" colSpan={6}>No approved supplier emails have been sent.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`panel${tab === 'history' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">INBOUND DESK</p>
              <h2>Email History</h2>
              <p>Open a supplier message to read its full text and the recorded decision trace.</p>
            </div>
          </div>
          <div className="inbox-layout">
            <div className="inbox-list">
              {inbox.length ? inbox.map((x) => (
                <button key={x.message_id} className={`inbox-item${selectedInbox?.message_id === x.message_id ? ' is-selected' : ''}`} type="button" onClick={() => setSelectedInbox(x)}>
                  <small>{x.supplier_name || x.supplier_id} · {fmt(x.sent_at)}</small>
                  <strong>{x.subject}</strong>
                  <small>{String(x.body || '').slice(0, 80)}…</small>
                </button>
              )) : <div className="empty">No incoming supplier messages.</div>}
            </div>
            <article className="message-detail">
              {selectedInbox ? (
                <>
                  <p className="eyebrow">{selectedInbox.direction} / {selectedInbox.message_id}</p>
                  <h3>{selectedInbox.subject}</h3>
                  <p className="message-meta">{selectedInbox.supplier_name || selectedInbox.supplier_id} · {selectedInbox.po_id || 'No PO reference'} · {fmt(selectedInbox.sent_at)}</p>
                  <div className="message-body">{selectedInbox.body}</div>
                  <section className="trace">
                    <p className="eyebrow">RECORDED DECISION TRACE</p>
                    <h4>Operational context</h4>
                    <p>
                      This view presents saved message facts and audit-ready context, not private model reasoning.
                      {selectedInbox.po_id
                        ? ` This message is linked to purchase order ${selectedInbox.po_id}; review its approval, tracking, and audit records for the evidence trail.`
                        : ' No purchase-order link was stored for this message.'}
                    </p>
                  </section>
                </>
              ) : (
                <>
                  <p className="eyebrow">SELECT A MESSAGE</p>
                  <h3>Inbox detail</h3>
                  <p>Choose an incoming message to inspect its contents and related operational context.</p>
                </>
              )}
            </article>
          </div>
        </section>

        <section className={`panel${tab === 'agents' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">CREW / SHORTAGE LOOP</p>
              <h2>Agents</h2>
              <p>Each row is a real Neon run. The step list below is the audit log. Groq commentary is optional and only shown for the run that produced it.</p>
            </div>
            <button
              className="button"
              type="button"
              onClick={async () => {
                ping('Crew running…');
                try {
                  const r = await api('/api/agents/crew', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                  const runId = r.result?.run_id as string | undefined;
                  setLcBriefs(r.briefs || []);
                  setLcForRun(runId || null);
                  if (runId) setSelectedRun(runId);
                  ping('Shortage crew finished.');
                  load();
                } catch (e: any) {
                  ping(e.message);
                }
              }}
            >
              Run shortage crew
            </button>
          </div>
          <p className="lede" id="mail-status-line">{mailLine}</p>
          <div className="inbox-layout">
            <div className="inbox-list">
              {runs.length ? runs.map((x) => (
                <button key={x.run_id} className={`inbox-item${selectedRun === x.run_id ? ' is-selected' : ''}`} type="button" onClick={() => setSelectedRun(x.run_id)}>
                  <small>{x.status} · {x.component_id || '—'}</small>
                  <strong>{x.run_id}</strong>
                  <small>{x.event_count || 0} steps · {fmt(x.created_at)}</small>
                </button>
              )) : <div className="empty">No crew runs yet.</div>}
            </div>
            <article className="message-detail">
              {runDetail ? (
                <>
                  <p className="eyebrow">{runDetail.run_id || selectedRun}</p>
                  <h3>Crew log</h3>
                  {(lcForRun && lcForRun === selectedRun ? lcBriefs : []).map((b, i) => (
                    <div key={`${b.agent}-${i}`}>
                      <p className="message-meta"><strong>groq note / {b.agent}</strong> (not the ledger)</p>
                      <p className="trace">{b.brief}</p>
                    </div>
                  ))}
                  {(runDetail.events || []).length ? (
                    (runDetail.events || []).map((e: any) => (
                    <div key={e.event_id}>
                      <p className="message-meta"><strong>{e.agent}</strong> · {fmt(e.created_at)}</p>
                      <p className="trace">{e.message}</p>
                    </div>
                    ))
                  ) : (
                    <p className="trace">No audit steps stored for this run.</p>
                  )}
                  {(runDetail.payments || []).map((p: any) => (
                    <p className="message-meta" key={p.payment_id}>
                      <span className={`badge ${badgeKind(p.status)}`}>{p.status}</span> {p.payment_id} · {money.format(p.amount)} · PO {p.po_id || '—'}
                    </p>
                  ))}
                </>
              ) : (
                <>
                  <p className="eyebrow">SELECT A RUN</p>
                  <h3>Crew log</h3>
                  <p>Start a run to watch watcher, sourcer, mailer, and treasurer step through a shortage.</p>
                </>
              )}
            </article>
          </div>
        </section>

        <section className={`panel${tab === 'mcp' ? ' is-active' : ''}`}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">CURSOR / TOOL BRIDGE</p>
              <h2>MCP</h2>
              <p>
                Model Context Protocol is a socket between Cursor and this simulation. It is not a tab that runs Groq.
                The desk talks HTTP to Fastify. Cursor talks stdio to <span className="mono">src/mcp/index.ts</span>, which calls the same Neon helpers as the APIs.
              </p>
            </div>
          </div>
          <div className="risk-strip">
            <div><strong>stdio</strong><span>Cursor default · npm run mcp:stdio</span></div>
            <div><strong>:3333</strong><span>HTTP · npm run mcp:http · /mcp</span></div>
            <div><strong>7</strong><span>Tools · same rules as the desk</span></div>
          </div>
          <div className="mcp-flow" aria-label="How MCP works">
            <div>
              <b>01</b>
              <h3>You ask in Cursor</h3>
              <p>A new agent chat, after seed42-operations is green in Settings → MCP.</p>
            </div>
            <div>
              <b>02</b>
              <h3>Cursor starts the server</h3>
              <p>node + tsx runs src/mcp/index.ts with cwd at the repo root so .env / DATABASE_URL load.</p>
            </div>
            <div>
              <b>03</b>
              <h3>A tool fires</h3>
              <p>list_inventory and friends call src/sim/* — not a second database, not the Next Groq routes.</p>
            </div>
            <div>
              <b>04</b>
              <h3>Neon answers</h3>
              <p>JSON comes back into the chat. Refresh this desk and the same numbers show in Inventory / Approvals / Sent.</p>
            </div>
          </div>
          <p className="lede">Enable it: Cursor Settings → MCP → seed42-operations. Check from a terminal with <span className="mono">npm run mcp:check</span> (expect seven tool names). This browser page cannot turn MCP on; only Cursor can spawn the stdio process.</p>
          <h3 className="mcp-tools-title">Server config</h3>
          <p style={{color:'var(--muted)',marginBottom:12,fontSize:12}}>Paste this into <strong>Cursor Settings → MCP → Edit config</strong> (or <span className="mono">~/.cursor/mcp.json</span>). Replace the path with your actual repo root.</p>
          <McpConfigBlock />
          <h3 className="mcp-tools-title">Tools</h3>
          <div className="supplier-cards mcp-tools">
            {MCP_TOOLS.map((t, i) => (
              <article key={t.name} className="supplier-card">
                <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                <p>{t.does}</p>
                <b className="mono">{t.name}</b>
              </article>
            ))}
          </div>
        </section>
      </main>

      <dialog ref={rfqRef}>
        <form onSubmit={onRfq}>
          <button className="close" type="button" aria-label="Close" onClick={() => rfqRef.current?.close()}>×</button>
          <p className="eyebrow">SOURCE QUOTATIONS</p>
          <h2>Create RFQ</h2>
          <label>Component ID<input name="component_id" required placeholder="COMP-101" /></label>
          <label>Requested quantity<input name="requested_quantity" type="number" min={1} required /></label>
          <label>Required delivery date<input name="required_delivery_date" type="date" required /></label>
          <button className="button" type="submit">Create RFQ</button>
          <p className="form-message">{formError.rfq}</p>
        </form>
      </dialog>
      <dialog ref={contactRef}>
        <form onSubmit={onContact}>
          <button className="close" type="button" aria-label="Close" onClick={() => contactRef.current?.close()}>×</button>
          <p className="eyebrow">ADD CONTACTS</p>
          <h2>Supplier mailbox</h2>
          <label>Name<input name="supplier_name" required placeholder="Western Components Ltd" /></label>
          <label>Email<input name="email" type="email" required placeholder="buyer@supplier.com" /></label>
          <button className="button" type="submit">Save contact</button>
          <p className="form-message">{formError.contact}</p>
        </form>
      </dialog>
      <dialog ref={inboundRef}>
        <form onSubmit={onInbound}>
          <button className="close" type="button" aria-label="Close" onClick={() => inboundRef.current?.close()}>×</button>
          <p className="eyebrow">CONNECTED MAILBOX</p>
          <h2>Ingest inbound</h2>
          <p>Paste a supplier reply, or point Resend inbound to POST /webhooks/inbound-email.</p>
          <label>From<input name="from" type="email" required placeholder="supplier42@example.com" /></label>
          <label>Subject<input name="subject" required placeholder="RE: Shortage cover COMP-104" /></label>
          <label>Body<textarea name="text" required rows={6} placeholder="We confirm the deal for COMP-104. Unit price ₹132. Delivery in 4 days." /></label>
          <button className="button" type="submit">Run inbound agent</button>
          <p className="form-message">{formError.inbound}</p>
        </form>
      </dialog>
      <div className={`toast${toast ? ' show' : ''}`} role="status">{toast}</div>
    </>
  );
}
