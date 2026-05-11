/**
 * PDF Parsing Provider Implementation
 *
 * Factory pattern for routing PDF parsing requests to appropriate provider implementations.
 * Follows the same architecture as lib/ai/providers.ts for consistency.
 *
 * Currently Supported Providers:
 * - MinerU Cloud: Advanced cloud service with OCR, formula, and table extraction
 *
 * HOW TO ADD A NEW PROVIDER:
 *
 * 1. Add provider ID to PDFProviderId in lib/pdf/types.ts
 *    Example: | 'tesseract-ocr'
 *
 * 2. Add provider configuration to lib/pdf/constants.ts
 *    Example:
 *    'tesseract-ocr': {
 *      id: 'tesseract-ocr',
 *      name: 'Tesseract OCR',
 *      requiresApiKey: false,
 *      icon: '/tesseract.svg',
 *      features: ['text', 'images', 'ocr']
 *    }
 *
 * 3. Implement provider function in this file
 *    Pattern: async function parseWithXxx(config, pdfBuffer): Promise<ParsedPdfContent>
 *    - Accept PDF as Buffer
 *    - Extract text, images, tables, formulas as needed
 *    - Return unified format:
 *      {
 *        text: string,               // Markdown or plain text
 *        images: string[],           // Base64 data URLs
 *        metadata: {
 *          pageCount: number,
 *          parser: string,
 *          ...                       // Provider-specific metadata
 *        }
 *      }
 *
 *    Example:
 *    async function parseWithTesseractOCR(
 *      config: PDFParserConfig,
 *      pdfBuffer: Buffer
 *    ): Promise<ParsedPdfContent> {
 *      const { createWorker } = await import('tesseract.js');
 *
 *      // Convert PDF pages to images
 *      const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
 *      const numPages = pdf.numPages;
 *
 *      const texts: string[] = [];
 *      const images: string[] = [];
 *
 *      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
 *        // Render page to canvas/image
 *        const page = await pdf.getPage(pageNum);
 *        const viewport = page.getViewport({ scale: 2.0 });
 *        const canvas = createCanvas(viewport.width, viewport.height);
 *        const context = canvas.getContext('2d');
 *        await page.render({ canvasContext: context, viewport }).promise;
 *
 *        // OCR the image
 *        const worker = await createWorker('eng+chi_sim');
 *        const { data: { text } } = await worker.recognize(canvas.toBuffer());
 *        texts.push(text);
 *        await worker.terminate();
 *
 *        // Save image
 *        images.push(canvas.toDataURL());
 *      }
 *
 *      return {
 *        text: texts.join('\n\n'),
 *        images,
 *        metadata: {
 *          pageCount: numPages,
 *          parser: 'tesseract-ocr',
 *        },
 *      };
 *    }
 *
 * 4. Add i18n translations in lib/i18n.ts
 *    providerTesseractOCR: { zh: 'Tesseract OCR', en: 'Tesseract OCR' }
 *
 * 5. Update features in constants.ts to reflect parser capabilities
 *    features: ['text', 'images', 'ocr'] // OCR-capable
 *
 * Provider Implementation Patterns:
 *
 * Pattern 1: Remote API (like MinerU)
 * - Upload PDF or provide URL
 * - Create task and get task ID
 * - Poll for completion (with timeout)
 * - Download results (text, images, metadata)
 * - Parse and convert to unified format
 *
 * Pattern 2: OCR-based Parser (Tesseract, Google Vision)
 * - Render PDF pages to images
 * - Send images to OCR service
 * - Collect text from all pages
 * - Combine with layout analysis if available
 * - Return combined text and original images
 *
 * Metadata Recommendations:
 * - pageCount: Number of pages in PDF
 * - parser: Provider ID for debugging
 * - processingTime: Time taken (auto-added)
 * - taskId/jobId: For async providers (useful for troubleshooting)
 * - Custom fields: imageMapping, pdfImages, tables, formulas, etc.
 *
 * Error Handling:
 * - Validate API key if requiresApiKey is true
 * - Throw descriptive errors for missing configuration
 * - For async providers, handle timeout and polling errors
 * - Log warnings for non-critical failures (e.g., single page errors)
 * - Always include provider name in error messages
 */

import type { PDFParserConfig } from './types';
import type { ParsedPdfContent } from '@/lib/pdf/types';
import { PDF_PROVIDERS } from './constants';
import { parseWithMinerUCloud } from './mineru-cloud';

/**
 * Parse PDF using the server-selected provider.
 */
export async function parsePDF(
  config: PDFParserConfig,
  pdfBuffer: Buffer,
): Promise<ParsedPdfContent> {
  const provider = PDF_PROVIDERS[config.providerId];
  if (!provider) {
    throw new Error(`Unknown PDF provider: ${config.providerId}`);
  }

  // Validate API key if required
  if (provider.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for PDF provider: ${config.providerId}`);
  }

  const startTime = Date.now();

  const result = await parseWithMinerUCloud(config, pdfBuffer);

  // Add processing time to metadata
  if (result.metadata) {
    result.metadata.processingTime = Date.now() - startTime;
  }

  return result;
}

/**
 * Get current PDF parser configuration from settings store
 * Note: This function should only be called in browser context
 */
export async function getCurrentPDFConfig(): Promise<PDFParserConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentPDFConfig() can only be called in browser context');
  }

  // Dynamic import to avoid circular dependency
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { pdfProviderId } = useSettingsStore.getState();

  return {
    providerId: pdfProviderId,
  };
}

// Re-export from constants for convenience
export { getAllPDFProviders, getPDFProvider } from './constants';
