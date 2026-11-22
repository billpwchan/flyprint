// Calls to the site's own API from the browser: JSON in and out, an error
// code instead of a throw, so a screen can say what went wrong in its language.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function call<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<Result<T>> {
  try {
    const response = await fetch(path, {
      method: init.method ?? (init.body || init.form ? "POST" : "GET"),
      headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: (data as { error?: string }).error ?? "server", status: response.status };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "network", status: 0 };
  }
}

// After signing in or out the whole page loads again, so every screen reads
// the new reader's flights.
export const reload = (to = "/") => window.location.assign(to);
