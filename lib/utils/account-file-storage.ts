export interface StoredAccountFile {
  id: string;
  url: string;
  name: string;
  type: string;
  size: number;
  kind: string;
}

interface UploadSessionResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || fallbackMessage);
  }
  return data as T;
}

async function cleanupUpload(uploadId: string): Promise<void> {
  const response = await fetch(`/api/file-uploads/${uploadId}`, { method: 'DELETE' });
  await readJsonResponse(response, '清理失败的上传任务时出错');
}

export async function uploadAccountFile(
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
  let uploadId: string | undefined;

  try {
    const createResponse = await fetch('/api/file-uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        contentType,
        size: file.size,
        kind,
        metadata,
      }),
    });
    const created = await readJsonResponse<{ success: true; upload: UploadSessionResponse }>(
      createResponse,
      '创建文件上传任务失败',
    );
    uploadId = created.upload.uploadId;

    for (let index = 0; index < created.upload.totalChunks; index += 1) {
      const start = index * created.upload.chunkSize;
      const end = Math.min(start + created.upload.chunkSize, file.size);
      const chunkResponse = await fetch(
        `/api/file-uploads/${created.upload.uploadId}/chunks/${index}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file.slice(start, end),
        },
      );
      await readJsonResponse(chunkResponse, `上传文件分片 ${index + 1} 失败`);
    }

    const completeResponse = await fetch(
      `/api/file-uploads/${created.upload.uploadId}/complete`,
      { method: 'POST' },
    );
    const completed = await readJsonResponse<{ success: true; file: StoredAccountFile }>(
      completeResponse,
      '完成文件上传失败',
    );
    return completed.file;
  } catch (error) {
    if (uploadId) {
      try {
        await cleanupUpload(uploadId);
      } catch (cleanupError) {
        const uploadMessage = error instanceof Error ? error.message : '文件上传失败';
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : '上传任务清理失败';
        throw new Error(`${uploadMessage}；${cleanupMessage}`);
      }
    }
    throw error;
  }
}
