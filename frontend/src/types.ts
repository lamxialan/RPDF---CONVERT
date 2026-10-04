export type ActiveTab = 'document' | 'image' | 'merge' | 'compress' | 'remove-bg';

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
