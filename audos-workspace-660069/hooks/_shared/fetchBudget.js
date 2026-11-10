/** Shared server-function fetch budget guard.
 * Platform limit is 50; Vidverge hands off at 40 so saving and dispatching have room.
 */
export const FETCH_HANDOFF_AT = 40;

export function createFetchBudget(limit = FETCH_HANDOFF_AT) {
  let used = 0;
  const assert = (needed = 1) => {
    const count = Math.max(1, Math.ceil(Number(needed) || 1));
    if (used + count > limit) {
      const error = new Error(`FETCH_BUDGET_HANDOFF:${used}:${count}:${limit}`);
      error.code = 'FETCH_BUDGET_HANDOFF';
      error.used = used;
      error.needed = count;
      error.limit = limit;
      throw error;
    }
    used += count;
    return used;
  };
  return {
    assert,
    remaining: () => Math.max(0, limit - used),
    used: () => used,
    canStart: (needed = 1) => used + Math.max(1, Math.ceil(Number(needed) || 1)) <= limit,
    isTemporary: (error) => error?.code === 'FETCH_BUDGET_HANDOFF' || /Maximum fetch calls|timed? out|5.?minute/i.test(String(error?.message || error || '')),
  };
}

export function wrapFetchBudget(budget, fetchImpl) {
  return (...args) => { budget.assert(1); return fetchImpl(...args); };
}

export function wrapDbBudget(budget, db) {
  return new Proxy(db, { get(target, key) { const value = target[key]; if (typeof value !== 'function') return value; return (...args) => { budget.assert(1); return value.apply(target, args); }; } });
}
