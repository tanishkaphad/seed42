import { NextRequest, NextResponse } from 'next/server';
import { runLangChainCrew } from '@/lib/agents/crew';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await runLangChainCrew(body.component_id);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
