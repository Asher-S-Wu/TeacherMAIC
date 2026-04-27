/**
 * Account file storage helpers.
 *
 * Files are uploaded to MongoDB GridFS through /api/files. The browser does
 * not keep account data in IndexedDB.
 */

function base64ToBlob(base64DataUrl: string): Blob {
  const parts = base64DataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const base64Data = parts[1];
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([uint8Array], { type: mimeType });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadBlob(blob: Blob, filename: string, kind: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', new File([blob], filename, { type: blob.type || 'application/octet-stream' }));
  formData.append('kind', kind);

  const response = await fetch('/api/files', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || '文件上传失败');
  }
  return data.file.id as string;
}

export async function storeImages(
  images: Array<{ id: string; src: string; pageNumber?: number }>,
): Promise<string[]> {
  const storedIds: string[] = [];

  for (const img of images) {
    const blob = base64ToBlob(img.src);
    const fileId = await uploadBlob(blob, `${img.id}.png`, 'pdf-image');
    storedIds.push(`${img.id}:${fileId}`);
  }

  return storedIds;
}

export async function loadImageMapping(imageIds: string[]): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};

  for (const storageId of imageIds) {
    const separatorIndex = storageId.indexOf(':');
    const originalId = separatorIndex > 0 ? storageId.slice(0, separatorIndex) : storageId;
    const fileId = separatorIndex > 0 ? storageId.slice(separatorIndex + 1) : storageId;
    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`);
    if (!response.ok) {
      throw new Error(`文件读取失败：${fileId}`);
    }
    const blob = await response.blob();
    mapping[originalId] = await blobToBase64(blob);
  }

  return mapping;
}

export async function cleanupSessionImages(_sessionId: string): Promise<void> {}

export async function cleanupOldImages(_hoursOld: number = 24): Promise<void> {}

export async function getImageStorageSize(): Promise<number> {
  return 0;
}

export async function storePdfBlob(file: File): Promise<string> {
  return uploadBlob(file, file.name, 'pdf');
}

export async function loadPdfBlob(key: string): Promise<Blob | null> {
  const response = await fetch(`/api/files/${encodeURIComponent(key)}`);
  if (!response.ok) return null;
  return response.blob();
}
