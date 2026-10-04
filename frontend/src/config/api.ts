/**
 * Konfigurasi API Base URL Dinamis (Environment Variable atau Fallback Lokal)
 * Di Vercel: disetel melalui VITE_API_BASE_URL (misal: https://rpdf-backend.onrender.com)
 * Di Lokal: jika kosong, menggunakan proxy dev Vite (/api) atau 'http://localhost:8000'
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || ''
).replace(/\/$/, '');

/**
 * Memastikan path endpoint mendapatkan prefix API_BASE_URL yang tepat
 * @param path Endpoint path, contoh: '/api/convert' atau URL absolut 'https://...'
 */
export function getApiUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
