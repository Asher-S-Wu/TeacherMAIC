import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireCurrentUser } from '@/lib/server/auth';
import {
  getAllowedContentTypes,
  getMaximumSizeInBytes,
  registerUploadedBlobForUser,
} from '@/lib/server/file-storage';

interface UploadPayload {
  kind?: string;
  filename?: string;
  size?: number;
  contentType?: string;
  userId?: string;
}

function parsePayload(payload?: string | null): UploadPayload {
  if (!payload) return {};
  try {
    return JSON.parse(payload) as UploadPayload;
  } catch {
    return {};
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const user = await requireCurrentUser();
        const payload = parsePayload(clientPayload);
        const kind = payload.kind || 'file';

        return {
          allowedContentTypes: getAllowedContentTypes(kind),
          maximumSizeInBytes: getMaximumSizeInBytes(kind),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ...payload, userId: user._id.toString() }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parsePayload(tokenPayload);
        if (!payload.userId || !ObjectId.isValid(payload.userId)) {
          throw new Error('上传信息不完整');
        }
        const kind = payload.kind || 'file';
        const filename = payload.filename || blob.pathname.split('/').pop() || 'file';
        const contentType = blob.contentType || payload.contentType || 'application/octet-stream';
        const size = payload.size || 0;

        await registerUploadedBlobForUser(
          new ObjectId(payload.userId),
          blob,
          filename,
          contentType,
          size,
          kind,
        );
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '文件上传失败' },
      { status: 400 },
    );
  }
}
