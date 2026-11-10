import { createFetchBudget, FETCH_HANDOFF_AT } from './fetchBudget.js';

export function simulateSixtyCalls() {
  const budget = createFetchBudget();
  let completed = 0;
  let handedOffAt = -1;
  for (let call = 0; call < 60; call += 1) {
    try { budget.assert(); completed += 1; }
    catch (error: any) { handedOffAt = error.used; break; }
  }
  if (completed !== FETCH_HANDOFF_AT || handedOffAt !== FETCH_HANDOFF_AT) throw new Error(`Expected handoff at ${FETCH_HANDOFF_AT}; completed=${completed}, handedOffAt=${handedOffAt}`);
  return { pass: true, completed, handedOffAt };
}

export const FETCH_BUDGET_SIMULATION = simulateSixtyCalls();
