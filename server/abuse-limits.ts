// Bound expensive password operations, including queued work. No unbounded promises.
export function passwordWorkLimiter(concurrency = 2, maxQueued = 4) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function passwordWork<T>(work: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      if (waiting.length >= maxQueued)
        throw Object.assign(Error("Password service busy; try again shortly"), {
          status: 429,
        });
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      // Transfer the slot directly so new callers cannot jump the queue.
      if (next) next();
      else active--;
    }
  };
}

// Fixed one-minute windows. Keys are client digests, scopes are record IDs,
// never submitted bearer tokens. Summaries are emitted on the next invalid
// request after a window ends; no timers or per-attempt database writes.
export function invalidLinkBudget(now = () => Date.now()) {
  let until = 0,
    reported = 0,
    suppressed = 0;
  const clients = new Map<string, Set<string>>();
  return {
    take(client: string, revokedCodeId?: string) {
      const time = now();
      let summary = 0;
      if (time >= until) {
        summary = suppressed;
        until = time + 60000;
        reported = summary ? 1 : 0;
        suppressed = 0;
        clients.clear();
      }
      const scopes = clients.get(client) ?? new Set<string>();
      const scope = revokedCodeId ?? "unknown";
      const allowed = reported < 20 && scopes.size < 3 && !scopes.has(scope);
      if (allowed) {
        reported++;
        scopes.add(scope);
        clients.set(client, scopes);
      } else suppressed = Math.min(Number.MAX_SAFE_INTEGER, suppressed + 1);
      return { allowed, summary };
    },
    reset() {
      until = reported = suppressed = 0;
      clients.clear();
    },
  };
}
