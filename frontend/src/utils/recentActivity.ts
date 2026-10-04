import { RecentActivityItem } from '../types';

const STORAGE_KEY = 'rpdf_recent_history';

export function getRecentActivities(): RecentActivityItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addRecentActivity(item: Omit<RecentActivityItem, 'id' | 'timestamp'>): void {
  try {
    const current = getRecentActivities();
    const newItem: RecentActivityItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
      ...item
    };
    // Simpan maksimal 5 riwayat terakhir
    const updated = [newItem, ...current.filter(i => i.fileName !== item.fileName)].slice(0, 5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('rpdf_recent_update'));
  } catch (e) {
    console.error('Failed to save recent activity:', e);
  }
}

export function clearRecentActivities(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('rpdf_recent_update'));
  } catch (e) {
    console.error('Failed to clear recent activities:', e);
  }
}
