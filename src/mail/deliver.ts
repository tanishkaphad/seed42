import { env } from '../config/env.js';

export type MailboxPlan =
  | { mode: 'simulated'; intended: string }
  | { mode: 'live'; to: string; intended: string };

function looksLikeExampleMailbox(email: string) {
  return /@(example\.com|example\.org|test\.local)$/i.test(email);
}

export function planMailbox(intended: string, audience: 'user' | 'supplier' = 'supplier'): MailboxPlan {
  if (audience === 'user') {
    const to = env.MAIL_TO.trim();
    if (!to || !env.RESEND_API_KEY.trim()) return { mode: 'simulated', intended: to || intended };
    return { mode: 'live', to, intended: to };
  }
  if (env.MAIL_SEND_TO_CONTACTS && env.RESEND_API_KEY.trim() && intended && !looksLikeExampleMailbox(intended)) {
    return { mode: 'live', to: intended, intended };
  }
  const to = env.MAIL_TO.trim();
  if (!to || !env.RESEND_API_KEY.trim()) return { mode: 'simulated', intended };
  return { mode: 'live', to, intended };
}

export async function deliverLiveEmail(input: {
  intended: string;
  subject: string;
  body: string;
  audience?: 'user' | 'supplier';
}): Promise<{ delivered: boolean; status: string; id?: string }> {
  const audience = input.audience || 'supplier';
  const plan = planMailbox(input.intended, audience);
  if (plan.mode !== 'live') {
    return { delivered: false, status: 'simulated' };
  }

  const text =
    audience === 'user' || plan.to === plan.intended
      ? input.body
      : `Intended supplier mailbox: ${plan.intended}\n\n${input.body}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [plan.to],
      subject: input.subject,
      text,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    return { delivered: false, status: `live_failed:${data.message || res.status}` };
  }
  return { delivered: true, status: 'sent_live', id: data.id };
}
