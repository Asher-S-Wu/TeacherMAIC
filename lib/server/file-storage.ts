import { Readable } from 'stream';
import { ObjectId } from 'mongodb';
import { getMongo } from '@/lib/server/mongodb';
import type { UserDoc } from '@/lib/server/mongodb';
import { isSuperAdminEmail } from '@/lib/server/auth';

export interface StoredFileResult {
  id: string;
  url: string;
}

export async function saveFileForUser(
  userId: ObjectId,
  file: File,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredFileResult> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return saveBufferForUser(
    userId,
    buffer,
    file.name || `${kind}-${Date.now()}`,
    file.type || 'application/octet-stream',
    kind,
    metadata,
  );
}

export async function saveBufferForUser(
  userId: ObjectId,
  buffer: Buffer,
  filename: string,
  contentType: string,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredFileResult> {
  const { bucket } = await getMongo();
  const uploadStream = bucket.openUploadStream(filename, {
    contentType,
    metadata: {
      ...metadata,
      userId: userId.toString(),
      kind,
      createdAt: new Date().toISOString(),
    },
  });

  await new Promise<void>((resolve, reject) => {
    Readable.from(buffer).pipe(uploadStream).on('error', reject).on('finish', resolve);
  });

  const id = uploadStream.id.toString();
  return {
    id,
    url: `/api/files/${id}`,
  };
}

export async function getReadableFileForUser(fileId: string, user: UserDoc) {
  if (!ObjectId.isValid(fileId)) return null;

  const { db, bucket } = await getMongo();
  const _id = new ObjectId(fileId);
  const file = await db.collection<{
    _id: ObjectId;
    filename: string;
    contentType?: string;
    length: number;
    metadata?: { userId?: string };
  }>('files.files').findOne({ _id });

  if (!file) return null;

  const ownsFile = file.metadata?.userId === user._id.toString();
  if (!ownsFile && !isSuperAdminEmail(user.email)) {
    return null;
  }

  return {
    file,
    stream: bucket.openDownloadStream(_id),
  };
}
