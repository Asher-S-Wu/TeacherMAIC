export type PDFProviderId = 'mineru-cloud';

export interface PDFProviderConfig {
  id: PDFProviderId;
  name: string;
  requiresApiKey: boolean;
  icon?: string;
  features: string[];
}

export interface PDFParserConfig {
  providerId: PDFProviderId;
  apiKey?: string;
}

export interface ParsedPdfContent {
  text: string;
  images: string[];
  tables?: Array<{
    page: number;
    data: string[][];
    caption?: string;
  }>;
  formulas?: Array<{
    page: number;
    latex: string;
    position?: { x: number; y: number; width: number; height: number };
  }>;
  layout?: Array<{
    page: number;
    type: 'title' | 'text' | 'image' | 'table' | 'formula';
    content: string;
    position?: { x: number; y: number; width: number; height: number };
  }>;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    pageCount: number;
    parser?: string;
    processingTime?: number;
    taskId?: string;
    imageMapping?: Record<string, string>;
    pdfImages?: Array<{
      id: string;
      src: string;
      pageNumber: number;
      description?: string;
      width?: number;
      height?: number;
      storageId?: string;
    }>;
    [key: string]: unknown;
  };
}
