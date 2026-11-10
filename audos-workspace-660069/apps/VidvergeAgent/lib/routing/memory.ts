import { callHook } from '../../../../lib/workspace';
import type { RoutingAppId, RoutingCorrection, RoutingDecision } from './playbook';

function inputSummary(value: string): string {
  return value
    .replace(/https?:\/\/[^\s)\]}]+/gi, '[URL]')
    .replace(/\[SCRAPED REFERENCE[\s\S]*$/i, '')
    .replace(/\[Attached file:[\s\S]*$/i, '[attachment]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

async function routing<T = any>(body: Record<string, unknown>): Promise<T> {
  return callHook<T>('verger-routing', body);
}

export async function logRoutingDecision(input: string, decision: RoutingDecision): Promise<void> {
  try { await routing({ op: 'log_decision', input_summary: inputSummary(input), decision }); }
  catch (error) { console.warn('[Verger] routing decision was not saved.', error); }
}

export async function logRoutingOutcome(input: string, decision: RoutingDecision, outcome: 'opened' | 'fallback_handoff' | 'failed'): Promise<void> {
  try { await routing({ op: 'log_outcome', input_summary: inputSummary(input), decision, outcome }); }
  catch (error) { console.warn('[Verger] routing outcome was not saved.', error); }
}

export async function logRoutingCorrection(input: string, decision: RoutingDecision, correctedApp: RoutingAppId): Promise<void> {
  try { await routing({ op: 'log_correction', input_summary: inputSummary(input), decision, corrected_app: correctedApp }); }
  catch (error) { console.warn('[Verger] routing correction was not saved.', error); }
}

export async function loadRecentRoutingCorrections(): Promise<RoutingCorrection[]> {
  try {
    const result = await routing<{ corrections?: RoutingCorrection[] }>({ op: 'recent' });
    return Array.isArray(result?.corrections) ? result.corrections.slice(0, 12) : [];
  } catch (error) {
    console.warn('[Verger] routing preferences were not loaded.', error);
    return [];
  }
}

export async function clearRoutingHistory(): Promise<boolean> {
  try { const result = await routing<{ ok?: boolean }>({ op: 'clear' }); return result?.ok === true; }
  catch { return false; }
}
