import { ObjectId } from 'mongodb';
import { del, get, put, type PutBlobResult } from '@vercel/blob';
import { getCollections, getMongo, type AccountFileDoc, type UserDoc } from '@/lib/server/mongodb';
import type { ImageMapping, PdfImage } from '@/lib/types/generation';

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
const PDF_TYPES = ['application/pdf'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export const FILE_LIMITS = {
  pdf: 50 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  media: 200 * 1024 * 1024,
} as const;

export function getAllowedContentTypes(kind: string): string[] {
  if (kind === 'pdf') return PDF_TYPES;
  if (kind === 'image' || kind === 'pdf-image' || kind === 'poster') return IMAGE_TYPES;
  if (kind === 'audio') return AUDIO_TYPES;
  if (kind === 'video') return VIDEO_TYPES;
  if (kind === 'media') return [...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES];
  return [...PDF_TYPES, ...IMAGE_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES];
}

export function getMaximumSizeInBytes(kind: string): number {
  if (kind === 'pdf') return FILE_LIMITS.pdf;
  if (kind === 'image' || kind === 'pdf-image' || kind === 'poster') return FILE_LIMITS.image;
  if (kind === 'audio') return FILE_LIMITS.audio;
  return FILE_LIMITS.media;
}

export function assertFileAllowed(kind: string, contentType: string, size: number): void {
  const normalizedType = normalizeContentType(contentType);
  const allowed = getAllowedContentTypes(kind);
  if (!allowed.includes(normalizedType)) {
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

function makePathname(userId: ObjectId, kind: string, filename: string): string {
  return `account-files/${userId.toString()}/${kind}/${Date.now()}-${safeName(filename)}`;
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

function isSuperAdmin(email: string): boolean {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return !!adminEmail && email.trim().toLowerCase() === adminEmail;
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

  const pathname = makePathname(userId, kind, filename);
  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType: normalizedType,
    addRandomSuffix: true,
  });

  return createFileRecord(userId, blob, filename, normalizedType, buffer.length, kind, metadata);
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
  const size = Number(response.headers.get('content-length') || 0);
  if (size > 0) assertFileAllowed(kind, resolvedType, size);

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
    filename,
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

export async function getReadableFileForUser(fileId: string, user: UserDoc) {
  if (!ObjectId.isValid(fileId)) return null;

  const { db } = await getMongo();
  const c = getCollections(db);
  const file = await c.accountFiles.findOne({ _id: new ObjectId(fileId) });
  if (!file) return null;

  const ownsFile = file.userId.toString() === user._id.toString();
  if (!ownsFile && !isSuperAdmin(user.email)) {
    return null;
  }

  const result = await get(file.pathname, { access: 'public' });
  if (result?.statusCode !== 200 || !result.stream) {
    return null;
  }

  return {
    file,
    blob: result.blob,
    stream: result.stream,
  };
}

export async function getFileBufferForUser(
  fileId: string,
  user: UserDoc,
): Promise<{ buffer: Buffer; file: AccountFileDoc } | null> {
  const result = await getReadableFileForUser(fileId, user);
  if (!result) return null;

  const response = new Response(result.stream);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    file: result.file,
  };
}

export async function loadImageMappingForUser(
  images: PdfImage[] | undefined,
  user: UserDoc,
): Promise<ImageMapping> {
  const mapping: ImageMapping = {};
  if (!images?.length) return mapping;

  for (const image of images) {
    if (!image.storageId) continue;
    const stored = await getFileBufferForUser(image.storageId, user);
    if (!stored) {
      throw new Error('参考图片读取失败');
    }
    mapping[image.id] =
      `data:${stored.file.contentType};base64,${stored.buffer.toString('base64')}`;
  }

  return mapping;
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
