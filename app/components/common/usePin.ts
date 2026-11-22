"use client";

import { useCallback, useState } from "react";

// A pinned reading belongs to the scope it was pinned in (a year, a traveller):
// it shows only there, with no extra render when the scope changes.
export function usePin(scope: string) {
  const [pin, setPin] = useState<{ scope: string; key: string | null }>({ scope, key: null });
  const pinned = pin.scope === scope ? pin.key : null;
  const setPinned = useCallback((key: string | null) => setPin({ scope, key }), [scope]);
  return [pinned, setPinned] as const;
}
