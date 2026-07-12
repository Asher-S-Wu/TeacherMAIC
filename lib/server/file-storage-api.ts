import { apiError } from '@/lib/server/api-response';
import { FileStorageError } from '@/lib/server/file-storage';

export function fileStorageApiError(error: unknown, fallbackMessage: string) {
  const status =
    error instanceof FileStorageError
      ? error.status
      : error instanceof Error &&
          'status' in error &&
          typeof error.status === 'number'
        ? error.status
        : 500;
  const message =
    status >= 500 && !(error instanceof FileStorageError)
      ? fallbackMessage
      : error instanceof Error
        ? error.message
        : fallbackMessage;
  return apiError(
    status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
    status,
    message || fallbackMessage,
  );
}
