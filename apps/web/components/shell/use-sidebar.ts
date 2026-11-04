'use client';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dayari-sidebar-collapsed';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount so the server and first client render agree.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      /* storage unavailable — the preference just will not persist */
    }
  }, [collapsed]);

  return { collapsed, toggle: () => setCollapsed((value) => !value) };
}
