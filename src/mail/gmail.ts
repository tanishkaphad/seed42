import { env } from '../config/env.js';
import { processInboundEmail } from '../agent/orchestrator.js';

export function gmailBoundaryStatus() {
  const configured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
  return {
    configured,
    mode: configured ? 'gmail_watch_ready' : 'simulation_fallback',
    topic: env.GMAIL_PUBSUB_TOPIC || null,
    note: configured
      ? 'OAuth present. Configure Gmail watch + Pub/Sub to POST /webhooks/gmail.'
      : 'No Google OAuth. Ingest via /inbound-email or Resend webhook until Gmail watch is set up.',
  };
}

async function gmailAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) throw new Error(data.error || 'Gmail token refresh failed');
  return data.access_token;
}

function decodePart(payload: any): { from: string; subject: string; text: string } {
  const headers = Object.fromEntries((payload?.headers || []).map((h: any) => [String(h.name).toLowerCase(), h.value]));
  const walk = (p: any): string => {
    if (!p) return '';
    if (p.mimeType === 'text/plain' && p.body?.data) {
      return Buffer.from(p.body.data, 'base64url').toString('utf8');
    }
    return (p.parts || []).map(walk).join('\n');
  };
  return {
    from: headers.from || '',
    subject: headers.subject || '',
    text: walk(payload) || Buffer.from(payload?.body?.data || '', 'base64url').toString('utf8'),
  };
}

export async function ingestGmailPush(raw: any) {
  const status = gmailBoundaryStatus();
  if (!status.configured) {
    return { gmail: status, result: await processInboundEmail(raw) };
  }

  const encoded = raw?.message?.data || raw?.data;
  let messageId = raw?.messageId || raw?.gmail_message_id;
  if (encoded && typeof encoded === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      messageId = decoded.emailId || decoded.historyId || messageId;
    } catch {
      /* keep messageId */
    }
  }
  if (!messageId) {
    return { gmail: status, result: await processInboundEmail(raw) };
  }

  const token = await gmailAccessToken();
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail fetch failed (${res.status})`);
  const msg = await res.json();
  const parsed = decodePart(msg.payload);
  return { gmail: status, result: await processInboundEmail(parsed) };
}
