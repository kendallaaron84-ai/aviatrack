import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  return NextResponse.json({ ok: true, message: 'Google Sheets sync is deprecated and stubbed out.' });
}