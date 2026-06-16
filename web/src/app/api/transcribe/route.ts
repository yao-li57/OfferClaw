import { NextRequest, NextResponse } from 'next/server';

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? '';
const LLM_API_KEY = process.env.LLM_API_KEY ?? '';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '未收到音频文件' }, { status: 400 });

  if (!LLM_BASE_URL || !LLM_API_KEY) {
    return NextResponse.json({ error: '未配置转录服务（LLM_BASE_URL / LLM_API_KEY）' }, { status: 500 });
  }

  const upstream = new FormData();
  upstream.append('file', file);
  upstream.append('model', 'voxtral-mini-4b-realtime');
  upstream.append('language', 'zh');

  let res: Response;
  try {
    res = await fetch(`${LLM_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LLM_API_KEY}` },
      body: upstream,
    });
  } catch (err) {
    return NextResponse.json({ error: `无法连接转录服务: ${(err as Error).message}` }, { status: 502 });
  }

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `转录服务返回错误 ${res.status}: ${body}` }, { status: 502 });
  }

  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: data.text ?? '' });
}
