/**
 * Account file storage helpers backed by Vercel Public Blob.
 */

import type { PutBlobResult } from '@vercel/blob';
import { upload } from '@vercel/blob/client';

export interface StoredAccountFile {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  kind: string;
}

function safePathPart(value: string): string {
  return (
    value
      .split(/[/\\]/)
      .pop()
      ?.trim()
      .replace(/[^\w.\-\u4e00-\u9fa5]+/g, '-')
      .slice(0, 120) || 'file'
  );
}

function makeUploadPath(filename: string): string {
  return `client-${crypto.randomUUID()}-${safePathPart(filename)}`;
}

export async function uploadAccountBlob(
  blob: Blob,
  filename: string,
  kind: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredAccountFile> {
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const contentType = file.type || 'application/octet-stream';

  const uploaded = (await upload(makeUploadPath(filename), file, {
    access: 'public',
    contentType,
    handleUploadUrl: '/api/files/upload',
    multipart: file.size > 5 * 1024 * 1024,
    clientPayload: JSON.stringify({
      kind,
      filename,
      size: file.size,
      contentType,
    }),
  })) as PutBlobResult;

  const response = await fetch('/api/files/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blob: uploaded,
      filename,
      contentType,
      size: file.size,
      kind,
      metadata,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || '文件保存失败');
  }

  return data.file as StoredAccountFile;
}

export async function storePdfBlob(file: File): Promise<string> {
  const saved = await uploadAccountBlob(file, file.name, 'pdf');
  return saved.id;
}

export async function cleanupOldImages(_hoursOld: number = 24): Promise<void> {}
