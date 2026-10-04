export type ActiveTab = 'document' | 'image' | 'remove-bg' | 'pdf-tools' | 'merge' | 'compress';

export type PdfToolMode =
  | 'to-docx'
  | 'split'
  | 'merge'
  | 'compress'
  | 'protect'
  | 'unlock'
  | 'watermark'
  | 'page-numbers'
  | 'images-to-pdf'
  | 'pdf-to-images'
  | 'organize'
  | 'edit-sign';

export interface PdfAnnotation {
  id: string;
  page: number; // 1-indexed
  type: 'text' | 'signature' | 'image' | 'whiteout' | 'highlight' | 'rect' | 'circle' | 'line' | 'arrow' | 'strikeout' | 'underline' | 'link' | 'form' | 'stamp' | 'freehand';
  x: number;
  y: number;
  width: number;
  height: number;
  page_width: number;
  page_height: number;
  text?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikeout?: boolean;
  imageData?: string;
  url?: string;
  checked?: boolean;
  formType?: 'text' | 'multiline' | 'dropdown' | 'radio' | 'checkbox' | 'signature';
  stampText?: string;
  points?: Array<{ x: number; y: number }>;
}

export interface RecentActivityItem {
  id: string;
  fileName: string;
  operation: string;
  timestamp: number;
  downloadUrl: string;
  fileSize?: number;
}

export type ConversionStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  sourceExt: string;
  targetFormat: string;
  availableTargets: string[];
  status: ConversionStatus;
  progress: number;
  errorMessage?: string;
  downloadUrl?: string;
  convertedBlob?: Blob;
  jobId?: string;
  previewUrl?: string;
}

export interface SupportedFormatMap {
  [sourceExt: string]: string[];
}

export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'txt'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'svg'];

// Target konversi khusus Dokumen
export const DOCUMENT_TARGETS: SupportedFormatMap = {
  pdf: ['docx', 'xlsx', 'pptx', 'txt'],
  docx: ['pdf'],
  xlsx: ['pdf'],
  pptx: ['pdf'],
  txt: ['pdf'],
};

// Target konversi khusus Gambar
export const IMAGE_TARGETS: SupportedFormatMap = {
  png: ['jpg', 'webp', 'svg', 'pdf'],
  jpg: ['png', 'webp', 'svg', 'pdf'],
  jpeg: ['png', 'webp', 'svg', 'pdf'],
  webp: ['png', 'jpg', 'svg', 'pdf'],
  heic: ['jpg', 'png', 'webp', 'pdf'],
  svg: ['png', 'jpg', 'webp', 'pdf'],
};
