import { useEffect, useState } from 'react';

export const DATA_CHANGED_EVENT = 'campusfind:data-changed';

/**
 * Returns a number that increases every time new data arrives from the shared database.
 * Screens add it to their load effect so they refresh themselves without remounting.
 */
export function useDataVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, []);

  return version;
}
