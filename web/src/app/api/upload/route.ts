import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '未收到文件' }, { status: 400 });

  const filename = file.name;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  let text = '';

  if (filename.toLowerCase().endsWith('.pdf')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      text = result.text.trim();
    } catch (err) {
      return NextResponse.json({ error: `PDF 解析失败: ${(err as Error).message}` }, { status: 500 });
    }
  } else {
    text = new TextDecoder('utf-8').decode(buffer);
  }

  if (!text) return NextResponse.json({ error: '文件内容为空' }, { status: 400 });

  return NextResponse.json({ filename, text });
}
