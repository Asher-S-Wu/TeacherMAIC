import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/server/auth';
import { getReadableFileForUser } from '@/lib/server/file-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('Files API');

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { fileId } = await context.params;
    const result = await getReadableFileForUser(fileId, user);
    if (!result) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const webStream = new ReadableStream({
      start(controller) {
        result.stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        result.stream.on('end', () => controller.close());
        result.stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        result.stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': result.file.contentType || 'application/octet-stream',
        'Content-Length': String(result.file.length),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    log.error('File read failed:', error);
    return NextResponse.json({ error: '文件读取失败' }, { status: 500 });
  }
}
