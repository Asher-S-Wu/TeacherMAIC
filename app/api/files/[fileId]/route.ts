import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { readStoredFileForUser } from '@/lib/server/file-storage';
import { fileStorageApiError } from '@/lib/server/file-storage-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ByteRange {
  start: number;
  end: number;
}

function parseRange(rangeHeader: string, size: number): ByteRange | null {
  if (!rangeHeader.startsWith('bytes=') || rangeHeader.includes(',')) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size <= 0) return null;
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  const parsedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(parsedEnd) ||
    start < 0 ||
    start >= size ||
    parsedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(parsedEnd, size - 1) };
}

function contentDisposition(filename: string): string {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function serveFile(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> },
  includeBody: boolean,
) {
  try {
    const user = await requireCurrentUser();
    const { fileId } = await context.params;
    const storedFile = await readStoredFileForUser(user._id, fileId);
    if (!storedFile) {
      return apiError('INVALID_REQUEST', 404, '文件不存在');
    }

    const etag = `"${fileId}-${storedFile.size}-${storedFile.modifiedAt.getTime()}"`;
    const baseHeaders = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': contentDisposition(storedFile.doc.filename),
      'Content-Type': storedFile.doc.contentType,
      ETag: etag,
      'Last-Modified': storedFile.modifiedAt.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
    });

    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: baseHeaders });
    }

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      const range = parseRange(rangeHeader, storedFile.size);
      if (!range) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${storedFile.size}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
      baseHeaders.set('Content-Length', String(range.end - range.start + 1));
      baseHeaders.set('Content-Range', `bytes ${range.start}-${range.end}/${storedFile.size}`);
      const body = includeBody
        ? (Readable.toWeb(
            createReadStream(storedFile.absolutePath, { start: range.start, end: range.end }),
          ) as ReadableStream<Uint8Array>)
        : null;
      return new Response(body, { status: 206, headers: baseHeaders });
    }

    baseHeaders.set('Content-Length', String(storedFile.size));
    const body = includeBody
      ? (Readable.toWeb(createReadStream(storedFile.absolutePath)) as ReadableStream<Uint8Array>)
      : null;
    return new Response(body, { status: 200, headers: baseHeaders });
  } catch (error) {
    return fileStorageApiError(error, '读取文件失败');
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  return serveFile(req, context, true);
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  return serveFile(req, context, false);
}
