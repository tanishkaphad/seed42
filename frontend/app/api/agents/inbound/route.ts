import { NextRequest, NextResponse } from 'next/server';
import { runLangChainInbound } from '@/lib/agents/crew';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = await runLangChainInbound({
      from: body.from,
      subject: body.subject,
      text: body.text,
    });
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
