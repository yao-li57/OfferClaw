import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await fetch(`${BACKEND_URL}/api/session/${params.id}/messages`, {
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const res = await fetch(`${BACKEND_URL}/api/session/${params.id}`, { method: 'DELETE' });
  const data = await res.json();
  return NextResponse.json(data);
}
