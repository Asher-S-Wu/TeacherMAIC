import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: '课堂媒体已改为账户文件链接，请使用 /api/files/[fileId]' },
    { status: 404 },
  );
}
