import { del, put, type PutBlobResult } from '@vercel/blob';
import { ObjectId } from 'mongodb';
import { getCollections, getMongo, type AccountFileDoc } from '@/lib/server/mongodb';

export interface StoredFileResult {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  kind: string;
}

export interface RegisteredBlobInput {
  pathname: string;
  url: string;
  downloadUrl?: string;
  contentType?: string;
  etag?: string;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export const FILE_LIMITS = {
  image: 20 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  media: 200 * 1024 * 1024,
} as const;

export function getAllowedContentTypes(kind: string): string[] {
  if (kind === 'image' || kind === 'poster') return IMAGE_TYPES;
  if (kind === 'audio') return AUDIO_TYPES;
  if (kind === 'video') return VIDEO_TYPES;
  if (kind === 'media') return [...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES];
  return [...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES];
}

export function getMaximumSizeInBytes(kind: string): number {
  if (kind === 'image' || kind === 'poster') return FILE_LIMITS.image;
  if (kind === 'audio') return FILE_LIMITS.audio;
  return FILE_LIMITS.media;
}

export function assertFileAllowed(kind: string, contentType: string, size: number): void {
  const normalizedType = normalizeContentType(contentType);
  if (!getAllowedContentTypes(kind).includes(normalizedType)) {
    throw new Error('文件类型不支持');
  }
  if (size > getMaximumSizeInBytes(kind)) {
    throw new Error('文件过大');
  }
}

export function normalizeContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

function safeName(name: string): string {
  const raw = name.split(/[/\\]/).pop()?.trim() || 'file';
  return raw.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '-').slice(0, 120) || 'file';
}

function safeKind(kind: string): string {
  return kind.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'file';
}

function makePathname(userId: ObjectId, kind: string, filename: string): string {
  return `account-files/${userId.toString()}/${safeKind(kind)}/${Date.now()}-${safeName(filename)}`;
}

function toStoredFile(doc: AccountFileDoc): StoredFileResult {
  return {
    id: doc._id.toString(),
    url: doc.url,
    name: doc.filename,
    type: doc.contentType,
    size: doc.size,
    kind: doc.kind,
  };
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('图片内容格式不正确');
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

export async function saveDataUrlForUser(
  userId: ObjectId,
  dataUrl: string,
  filename: string,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredFileResult> {
  const { buffer, contentType } = dataUrlToBuffer(dataUrl);
  return saveBufferForUser(userId, buffer, filename, contentType, kind, metadata);
}

export async function saveBufferForUser(
  userId: ObjectId,
  buffer: Buffer,
  filename: string,
  contentType: string,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredFileResult> {
  assertFileAllowed(kind, contentType, buffer.length);
  const normalizedType = normalizeContentType(contentType);
  const blob = await put(makePathname(userId, kind, filename), buffer, {
    access: 'public',
    contentType: normalizedType,
    addRandomSuffix: true,
  });

  return createFileRecord(
    userId,
    blob,
    filename,
    normalizedType,
    buffer.length,
    kind,
    metadata,
  );
}

export async function saveRemoteFileForUser(
  userId: ObjectId,
  sourceUrl: string,
  filename: string,
  contentType: string,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredFileResult> {
  const response = await fetch(sourceUrl, { redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('不允许跳转的媒体地址');
  }
  if (!response.ok || !response.body) {
    throw new Error(`远程媒体读取失败：${response.status}`);
  }

  const resolvedType = normalizeContentType(response.headers.get('content-type') || contentType);
  const contentLength = response.headers.get('content-length');
  const parsedSize = contentLength ? Number.parseInt(contentLength, 10) : 0;
  const size = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 0;
  assertFileAllowed(kind, resolvedType, size);

  const blob = await put(makePathname(userId, kind, filename), response.body, {
    access: 'public',
    contentType: resolvedType,
    addRandomSuffix: true,
  });

  return createFileRecord(userId, blob, filename, resolvedType, size, kind, metadata);
}

export async function registerUploadedBlobForUser(
  userId: ObjectId,
  blob: RegisteredBlobInput,
  filename: string,
  contentType: string,
  size: number,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredFileResult> {
  assertFileAllowed(kind, contentType, size);
  const normalizedType = normalizeContentType(contentType);

  const { db } = await getMongo();
  const c = getCollections(db);
  const now = new Date();
  const doc: AccountFileDoc = {
    _id: new ObjectId(),
    userId,
    kind,
    filename: safeName(filename),
    contentType: normalizeContentType(blob.contentType || normalizedType),
    size,
    pathname: blob.pathname,
    url: blob.url,
    downloadUrl: blob.downloadUrl,
    etag: blob.etag,
    metadata,
    createdAt: now,
    updatedAt: now,
  };

  await c.accountFiles.updateOne(
    { pathname: blob.pathname },
    { $setOnInsert: doc },
    { upsert: true },
  );
  const saved = await c.accountFiles.findOne({ pathname: blob.pathname });
  if (!saved) {
    throw new Error('文件登记失败');
  }
  if (saved.userId.toString() !== userId.toString()) {
    throw new Error('文件不属于当前账号');
  }
  return toStoredFile(saved);
}

async function createFileRecord(
  userId: ObjectId,
  blob: PutBlobResult,
  filename: string,
  contentType: string,
  size: number,
  kind: string,
  metadata: Record<string, unknown>,
): Promise<StoredFileResult> {
  return registerUploadedBlobForUser(
    userId,
    blob,
    filename,
    blob.contentType || contentType,
    size,
    kind,
    metadata,
  );
}

export async function deleteAccountFilesForUser(userId: ObjectId): Promise<void> {
  const { db } = await getMongo();
  const c = getCollections(db);
  const files = await c.accountFiles.find({ userId }).toArray();
  if (files.length > 0) {
    await del(files.map((file) => file.url));
  }
  await c.accountFiles.deleteMany({ userId });
}
