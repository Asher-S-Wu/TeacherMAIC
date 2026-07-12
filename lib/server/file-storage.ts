import { constants as fsConstants } from 'node:fs';
import {
  access,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, extname, isAbsolute, posix, resolve, sep } from 'node:path';
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

export interface UploadSessionResult {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

export interface UploadSessionInput {
  filename: string;
  contentType: string;
  size: number;
  kind: string;
  metadata?: Record<string, unknown>;
}

export interface StoredFileSource {
  doc: AccountFileDoc;
  absolutePath: string;
  size: number;
  modifiedAt: Date;
}

interface UploadManifest {
  uploadId: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  kind: string;
  metadata: Record<string, unknown>;
  chunkSize: number;
  totalChunks: number;
  createdAt: string;
}

export class FileStorageError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const UPLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const COPY_BUFFER_SIZE = 1024 * 1024;
let lastUploadCleanupAt = 0;

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

export function normalizeContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
}

export function assertFileAllowed(kind: string, contentType: string, size: number): void {
  const normalizedType = normalizeContentType(contentType);
  if (!getAllowedContentTypes(kind).includes(normalizedType)) {
    throw new FileStorageError('文件类型不支持');
  }
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new FileStorageError('文件大小不正确');
  }
  if (size > getMaximumSizeInBytes(kind)) {
    throw new FileStorageError('文件过大', 413);
  }
}

function getStorageRoot(): string {
  const configured = process.env.FILE_STORAGE_ROOT?.trim();
  if (!configured) {
    throw new FileStorageError('缺少 FILE_STORAGE_ROOT 环境变量', 500);
  }
  if (!isAbsolute(configured)) {
    throw new FileStorageError('FILE_STORAGE_ROOT 必须是绝对路径', 500);
  }
  return resolve(configured);
}

function resolveStoragePath(storageKey: string): string {
  if (!storageKey || isAbsolute(storageKey)) {
    throw new FileStorageError('文件存储路径不正确', 500);
  }
  const root = getStorageRoot();
  const absolutePath = resolve(root, storageKey);
  if (absolutePath === root || !absolutePath.startsWith(`${root}${sep}`)) {
    throw new FileStorageError('文件存储路径越界', 500);
  }
  return absolutePath;
}

function safeName(name: string): string {
  const raw = name.split(/[/\\]/).pop()?.trim() || 'file';
  return raw.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '-').slice(0, 120) || 'file';
}

function safeKind(kind: string): string {
  return kind.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'file';
}

function safeExtension(filename: string): string {
  const extension = extname(safeName(filename)).toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : '';
}

function makeStorageKey(userId: ObjectId, kind: string, filename: string): string {
  return posix.join(
    'account-files',
    userId.toString(),
    safeKind(kind),
    `${randomUUID()}${safeExtension(filename)}`,
  );
}

function toStoredFile(doc: AccountFileDoc): StoredFileResult {
  return {
    id: doc._id.toString(),
    url: `/api/files/${doc._id.toString()}`,
    name: doc.filename,
    type: doc.contentType,
    size: doc.size,
    kind: doc.kind,
  };
}

function dataUrlToBuffer(
  dataUrl: string,
  maximumBytes: number,
): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new FileStorageError('图片内容格式不正确');
  }
  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  if (estimatedBytes > maximumBytes) {
    throw new FileStorageError('文件过大', 413);
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function assertMetadata(metadata: Record<string, unknown>): void {
  if (JSON.stringify(metadata).length > 64 * 1024) {
    throw new FileStorageError('文件附加信息过大');
  }
}

async function ensureStorageDirectories(): Promise<void> {
  const root = getStorageRoot();
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new FileStorageError('文件存储根路径不是目录', 500);
  }
  await access(root, fsConstants.R_OK | fsConstants.W_OK);
  await Promise.all([
    mkdir(resolveStoragePath('account-files'), { recursive: true }),
    mkdir(resolveStoragePath('.uploads'), { recursive: true }),
  ]);
}

async function writeAll(handle: FileHandle, data: Buffer): Promise<void> {
  let offset = 0;
  while (offset < data.length) {
    const { bytesWritten } = await handle.write(data, offset, data.length - offset, null);
    if (bytesWritten <= 0) {
      throw new FileStorageError('文件写入中断', 500);
    }
    offset += bytesWritten;
  }
}

async function writeWebStreamToFile(
  stream: ReadableStream<Uint8Array>,
  absolutePath: string,
  maximumBytes: number,
): Promise<number> {
  await mkdir(dirname(absolutePath), { recursive: true });
  const handle = await open(absolutePath, 'wx');
  const reader = stream.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        throw new FileStorageError('文件过大', 413);
      }
      await writeAll(handle, Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    await handle.sync();
    return total;
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    await handle.close();
  }
}

async function copyFileIntoHandle(sourcePath: string, target: FileHandle): Promise<number> {
  const source = await open(sourcePath, 'r');
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_SIZE);
  let total = 0;
  try {
    while (true) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      await writeAll(target, buffer.subarray(0, bytesRead));
      total += bytesRead;
    }
    return total;
  } finally {
    await source.close();
  }
}

async function createFileRecord(
  userId: ObjectId,
  storageKey: string,
  filename: string,
  contentType: string,
  size: number,
  kind: string,
  metadata: Record<string, unknown>,
): Promise<StoredFileResult> {
  const { db } = await getMongo();
  const now = new Date();
  const doc: AccountFileDoc = {
    _id: new ObjectId(),
    userId,
    kind: safeKind(kind),
    filename: safeName(filename),
    contentType: normalizeContentType(contentType),
    size,
    storageKey,
    metadata,
    createdAt: now,
    updatedAt: now,
  };
  await getCollections(db).accountFiles.insertOne(doc);
  return toStoredFile(doc);
}

async function commitTemporaryFile(
  userId: ObjectId,
  temporaryPath: string,
  filename: string,
  contentType: string,
  size: number,
  kind: string,
  metadata: Record<string, unknown>,
): Promise<StoredFileResult> {
  const storageKey = makeStorageKey(userId, kind, filename);
  const finalPath = resolveStoragePath(storageKey);
  await mkdir(dirname(finalPath), { recursive: true });
  await rename(temporaryPath, finalPath);
  try {
    return await createFileRecord(
      userId,
      storageKey,
      filename,
      contentType,
      size,
      kind,
      metadata,
    );
  } catch (error) {
    await rm(finalPath, { force: true });
    throw error;
  }
}

function uploadUserKey(userId: ObjectId): string {
  return posix.join('.uploads', userId.toString());
}

function uploadSessionKey(userId: ObjectId, uploadId: string): string {
  if (!/^[0-9a-f-]{36}$/.test(uploadId)) {
    throw new FileStorageError('上传任务编号不正确');
  }
  return posix.join(uploadUserKey(userId), uploadId);
}

function uploadSessionPath(userId: ObjectId, uploadId: string): string {
  return resolveStoragePath(uploadSessionKey(userId, uploadId));
}

async function readUploadManifest(userId: ObjectId, uploadId: string): Promise<UploadManifest> {
  const manifestPath = resolve(uploadSessionPath(userId, uploadId), 'manifest.json');
  let manifest: UploadManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as UploadManifest;
  } catch {
    throw new FileStorageError('上传任务不存在', 404);
  }
  if (manifest.userId !== userId.toString() || manifest.uploadId !== uploadId) {
    throw new FileStorageError('上传任务不存在', 404);
  }
  return manifest;
}

async function cleanupExpiredUploads(): Promise<void> {
  const now = Date.now();
  if (now - lastUploadCleanupAt < CLEANUP_INTERVAL_MS) return;

  const uploadsRoot = resolveStoragePath('.uploads');
  const userDirectories = await readdir(uploadsRoot, { withFileTypes: true });
  for (const userDirectory of userDirectories) {
    if (!userDirectory.isDirectory()) continue;
    const userPath = resolve(uploadsRoot, userDirectory.name);
    const sessions = await readdir(userPath, { withFileTypes: true });
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const sessionPath = resolve(userPath, session.name);
      const sessionStat = await stat(sessionPath);
      if (now - sessionStat.mtimeMs > UPLOAD_EXPIRY_MS) {
        await rm(sessionPath, { recursive: true, force: true });
      }
    }
  }
  lastUploadCleanupAt = now;
}

async function createServerTemporaryDirectory(userId: ObjectId): Promise<string> {
  await ensureStorageDirectories();
  const absolutePath = resolveStoragePath(
    posix.join(uploadUserKey(userId), `server-${randomUUID()}`),
  );
  await mkdir(resolveStoragePath(uploadUserKey(userId)), { recursive: true });
  await mkdir(absolutePath, { recursive: false });
  return absolutePath;
}

export async function getStorageHealth(): Promise<{
  freeBytes: number;
  totalBytes: number;
}> {
  await ensureStorageDirectories();
  const filesystem = await statfs(getStorageRoot());
  return {
    freeBytes: filesystem.bavail * filesystem.bsize,
    totalBytes: filesystem.blocks * filesystem.bsize,
  };
}

export async function saveDataUrlForUser(
  userId: ObjectId,
  dataUrl: string,
  filename: string,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredFileResult> {
  const { buffer, contentType } = dataUrlToBuffer(dataUrl, getMaximumSizeInBytes(kind));
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
  assertMetadata(metadata);
  const temporaryDirectory = await createServerTemporaryDirectory(userId);
  const temporaryPath = resolve(temporaryDirectory, 'payload.part');
  try {
    await writeFile(temporaryPath, buffer, { flag: 'wx' });
    return await commitTemporaryFile(
      userId,
      temporaryPath,
      filename,
      contentType,
      buffer.length,
      kind,
      metadata,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
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
    throw new FileStorageError('不允许跳转的媒体地址');
  }
  if (!response.ok || !response.body) {
    throw new FileStorageError(`远程媒体读取失败：${response.status}`, 502);
  }

  const resolvedType = normalizeContentType(response.headers.get('content-type') || contentType);
  const maximumBytes = getMaximumSizeInBytes(kind);
  const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  assertFileAllowed(kind, resolvedType, Number.isFinite(contentLength) ? contentLength : 0);
  assertMetadata(metadata);

  const temporaryDirectory = await createServerTemporaryDirectory(userId);
  const temporaryPath = resolve(temporaryDirectory, 'payload.part');
  try {
    const actualSize = await writeWebStreamToFile(response.body, temporaryPath, maximumBytes);
    assertFileAllowed(kind, resolvedType, actualSize);
    return await commitTemporaryFile(
      userId,
      temporaryPath,
      filename,
      resolvedType,
      actualSize,
      kind,
      metadata,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function createUploadSessionForUser(
  userId: ObjectId,
  input: UploadSessionInput,
): Promise<UploadSessionResult> {
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new FileStorageError('文件大小不正确');
  }
  assertFileAllowed(input.kind, input.contentType, input.size);
  assertMetadata(input.metadata || {});
  await ensureStorageDirectories();
  await cleanupExpiredUploads();

  const uploadId = randomUUID();
  const sessionPath = uploadSessionPath(userId, uploadId);
  const totalChunks = Math.ceil(input.size / UPLOAD_CHUNK_SIZE);
  const manifest: UploadManifest = {
    uploadId,
    userId: userId.toString(),
    filename: safeName(input.filename),
    contentType: normalizeContentType(input.contentType),
    size: input.size,
    kind: safeKind(input.kind),
    metadata: input.metadata || {},
    chunkSize: UPLOAD_CHUNK_SIZE,
    totalChunks,
    createdAt: new Date().toISOString(),
  };
  await mkdir(resolveStoragePath(uploadUserKey(userId)), { recursive: true });
  await mkdir(sessionPath, { recursive: false });
  try {
    await writeFile(resolve(sessionPath, 'manifest.json'), JSON.stringify(manifest), {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    await rm(sessionPath, { recursive: true, force: true });
    throw error;
  }
  return { uploadId, chunkSize: UPLOAD_CHUNK_SIZE, totalChunks };
}

export async function writeUploadChunkForUser(
  userId: ObjectId,
  uploadId: string,
  chunkIndex: number,
  body: ReadableStream<Uint8Array>,
): Promise<void> {
  const manifest = await readUploadManifest(userId, uploadId);
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= manifest.totalChunks) {
    throw new FileStorageError('上传分片编号不正确');
  }
  const expectedSize =
    chunkIndex === manifest.totalChunks - 1
      ? manifest.size - manifest.chunkSize * (manifest.totalChunks - 1)
      : manifest.chunkSize;
  const chunkPath = resolve(uploadSessionPath(userId, uploadId), `${chunkIndex}.part`);
  try {
    const actualSize = await writeWebStreamToFile(body, chunkPath, expectedSize);
    if (actualSize !== expectedSize) {
      throw new FileStorageError('上传分片大小不正确');
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new FileStorageError('上传分片已经存在', 409);
    }
    await rm(chunkPath, { force: true });
    throw error;
  }
}

export async function completeUploadSessionForUser(
  userId: ObjectId,
  uploadId: string,
): Promise<StoredFileResult> {
  const manifest = await readUploadManifest(userId, uploadId);
  const sessionPath = uploadSessionPath(userId, uploadId);
  const assembledPath = resolve(sessionPath, 'assembled.part');
  let target: FileHandle;
  try {
    target = await open(assembledPath, 'wx');
  } catch (error) {
    await rm(sessionPath, { recursive: true, force: true });
    throw error;
  }
  let assembledSize = 0;
  try {
    for (let index = 0; index < manifest.totalChunks; index += 1) {
      const chunkPath = resolve(sessionPath, `${index}.part`);
      const chunkStat = await stat(chunkPath);
      const expectedSize =
        index === manifest.totalChunks - 1
          ? manifest.size - manifest.chunkSize * (manifest.totalChunks - 1)
          : manifest.chunkSize;
      if (chunkStat.size !== expectedSize) {
        throw new FileStorageError(`上传分片 ${index} 不完整`);
      }
      assembledSize += await copyFileIntoHandle(chunkPath, target);
      await rm(chunkPath, { force: true });
    }
    await target.sync();
  } catch (error) {
    await target.close();
    await rm(sessionPath, { recursive: true, force: true });
    throw error;
  }
  await target.close();

  if (assembledSize !== manifest.size) {
    await rm(sessionPath, { recursive: true, force: true });
    throw new FileStorageError('上传文件大小不完整');
  }

  try {
    const result = await commitTemporaryFile(
      userId,
      assembledPath,
      manifest.filename,
      manifest.contentType,
      assembledSize,
      manifest.kind,
      manifest.metadata,
    );
    await rm(sessionPath, { recursive: true, force: true });
    return result;
  } catch (error) {
    await rm(sessionPath, { recursive: true, force: true });
    throw error;
  }
}

export async function cancelUploadSessionForUser(
  userId: ObjectId,
  uploadId: string,
): Promise<void> {
  await readUploadManifest(userId, uploadId);
  await rm(uploadSessionPath(userId, uploadId), { recursive: true, force: true });
}

export async function readStoredFileForUser(
  userId: ObjectId,
  fileId: string,
): Promise<StoredFileSource | null> {
  if (!ObjectId.isValid(fileId)) return null;
  const { db } = await getMongo();
  const doc = await getCollections(db).accountFiles.findOne({
    _id: new ObjectId(fileId),
    userId,
  });
  if (!doc) return null;
  const absolutePath = resolveStoragePath(doc.storageKey);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new FileStorageError('文件存储内容不正确', 500);
  }
  return {
    doc,
    absolutePath,
    size: fileStat.size,
    modifiedAt: fileStat.mtime,
  };
}

export async function deleteAccountFilesForUser(userId: ObjectId): Promise<void> {
  await ensureStorageDirectories();
  await Promise.all([
    rm(resolveStoragePath(posix.join('account-files', userId.toString())), {
      recursive: true,
      force: true,
    }),
    rm(resolveStoragePath(uploadUserKey(userId)), { recursive: true, force: true }),
  ]);
  const { db } = await getMongo();
  await getCollections(db).accountFiles.deleteMany({ userId });
}
