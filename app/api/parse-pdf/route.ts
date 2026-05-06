import { NextRequest } from 'next/server';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import { resolvePDFApiKey } from '@/lib/server/provider-config';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { requireCurrentUser } from '@/lib/server/auth';
import { getFileBufferForUser, saveDataUrlForUser } from '@/lib/server/file-storage';
import { MAX_PDF_CONTENT_CHARS } from '@/lib/constants/generation';
const log = createLogger('Parse PDF');
type ParsedPdfImage = NonNullable<NonNullable<ParsedPdfContent['metadata']>['pdfImages']>[number];

export async function POST(req: NextRequest) {
  let pdfFileName: string | undefined;
  let resolvedProviderId: string | undefined;
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as { fileId?: string };

    if (!body.fileId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, '缺少 PDF 文件');
    }

    const storedPdf = await getFileBufferForUser(body.fileId, user);
    if (!storedPdf || storedPdf.file.contentType !== 'application/pdf') {
      return apiError('INVALID_REQUEST', 400, 'PDF 文件不存在');
    }

    const mineruApiKey = resolvePDFApiKey('mineru-cloud');
    const effectiveProviderId: PDFProviderId = 'mineru-cloud';
    pdfFileName = storedPdf.file.filename;
    resolvedProviderId = effectiveProviderId;

    const config = {
      providerId: effectiveProviderId,
      apiKey: mineruApiKey,
    };

    // Parse PDF using the provider system
    const result = await parsePDF(config, storedPdf.buffer);

    const rawPdfImages: ParsedPdfImage[] =
      result.metadata?.pdfImages?.length
        ? result.metadata.pdfImages
        : result.images.map((src, index) => ({
            id: `img_${index + 1}`,
            src,
            pageNumber: 1,
          }));

    const pdfImages = [];
    for (const image of rawPdfImages) {
      if (!image.src) continue;
      const saved = await saveDataUrlForUser(
        user._id,
        image.src,
        `${image.id}.png`,
        'pdf-image',
        {
          sourcePdfId: body.fileId,
          pageNumber: image.pageNumber,
          imageId: image.id,
        },
      );
      pdfImages.push({
        id: image.id,
        src: '',
        pageNumber: image.pageNumber || 1,
        description: image.description,
        width: image.width,
        height: image.height,
        storageId: saved.id,
      });
    }

    // Add file metadata
    const originalTextLength = result.text.length;
    const resultWithMetadata: ParsedPdfContent = {
      ...result,
      text:
        originalTextLength > MAX_PDF_CONTENT_CHARS
          ? result.text.substring(0, MAX_PDF_CONTENT_CHARS)
          : result.text,
      images: [],
      metadata: {
        ...result.metadata,
        pageCount: result.metadata?.pageCount ?? 0, // Ensure pageCount is always a number
        fileName: storedPdf.file.filename,
        fileSize: storedPdf.file.size,
        originalTextLength,
        imageMapping: undefined,
        pdfImages,
      },
    };

    return apiSuccess({ data: resultWithMetadata });
  } catch (error) {
    log.error(
      `PDF parsing failed [provider=${resolvedProviderId ?? 'unknown'}, file="${pdfFileName ?? 'unknown'}"]:`,
      error,
    );
    return apiError('PARSE_FAILED', 500, 'PDF 解析失败，请稍后再试。');
  }
}
