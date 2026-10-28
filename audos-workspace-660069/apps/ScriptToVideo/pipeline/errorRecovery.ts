export type GenerationErrorClass = 'content-policy' | 'bad-prompt' | 'reference-image' | 'rate-limit' | 'timeout' | 'provider-outage' | 'auth-credential' | 'insufficient-credits' | 'cast-approval' | 'unknown';
export interface RecoveryDecision {
  category: GenerationErrorClass;
  retryable: boolean;
  action: 'soften-prompt' | 'simplify-scene' | 'adjust-references' | 'backoff' | 'switch-model' | 'stop';
  backoffMs: number;
  customerMessage: string;
  founderDiagnosis: string;
}

function generationErrorText(raw: unknown): string {
  if (raw instanceof Error) return [raw.name, raw.message, (raw as any).code, (raw as any).status].filter(Boolean).join(' ').toLowerCase();
  if (typeof raw === 'string') return raw.toLowerCase();
  try { return JSON.stringify(raw ?? '').toLowerCase(); } catch { return String(raw || '').toLowerCase(); }
}

export function classifyGenerationError(raw: unknown): GenerationErrorClass {
  const text = generationErrorText(raw);
  if (/cast_approval_required|approve every retained character|confirm that this script needs no cast/.test(text)) return 'cast-approval';
  if (/\b(?:no_credentials|workspace_token_invalid|not_a_workspace_member)\b|\bhttp[_ -]?(?:401|403)\b|\bstatus[:= ]+(?:401|403)\b/.test(text)) return 'auth-credential';
  if (/\binsufficient_credits\b|\bhttp[_ -]?402\b|\bstatus[:= ]+402\b/.test(text)) return 'insufficient-credits';
  if (/\bopenrouter_key_limit\b|key limit exceeded|provider budget reached/.test(text)) return 'provider-outage';
  if (/moderation|content.policy|safety|likeness|blocked/.test(text)) return 'content-policy';
  if (/reference|image.*invalid|mime|dimension|\bface\b/.test(text)) return 'reference-image';
  if (/\b429\b|\brate_limited\b|rate.?limit|retry-after/.test(text)) return 'rate-limit';
  if (/timeout|timed out|expired|took too long/.test(text)) return 'timeout';
  if (/\b(?:502|503|504)\b|\bhttp[_ -]?500\b|\bstatus[:= ]+500\b|outage|service unavailable|upstream/.test(text)) return 'provider-outage';
  if (/prompt|unsupported field|invalid request|too long/.test(text)) return 'bad-prompt';
  return 'unknown';
}

export function recoveryDecision(raw: unknown, attempt: number, allowFallback: boolean): RecoveryDecision {
  const category = classifyGenerationError(raw);
  const rawText = raw instanceof Error ? `${raw.name}: ${raw.message}` : typeof raw === 'string' ? raw : (() => { try { return JSON.stringify(raw ?? 'Unknown provider error'); } catch { return String(raw || 'Unknown provider error'); } })();
  const boundedAttempt = Math.max(1, Math.min(3, Math.round(attempt || 1)));
  const terminalCategories: GenerationErrorClass[] = ['auth-credential', 'insufficient-credits', 'cast-approval'];
  const terminal = boundedAttempt >= 3 || terminalCategories.includes(category);
  const action: RecoveryDecision['action'] = terminal
    ? allowFallback && boundedAttempt >= 3 && !terminalCategories.includes(category) ? 'switch-model' : 'stop'
    : category === 'content-policy' ? 'soften-prompt'
      : category === 'reference-image' ? 'adjust-references'
        : category === 'bad-prompt' ? 'simplify-scene'
          : 'backoff';
  return {
    category,
    retryable: action !== 'stop',
    action,
    backoffMs: action === 'backoff' ? [2_000, 8_000, 24_000][boundedAttempt - 1] : 0,
    customerMessage: /openrouter_key_limit|key limit exceeded|provider budget reached/i.test(rawText) ? 'Provider budget reached. This film stays paused; retry on the selected model later or create a separate Omni version.' : category === 'insufficient-credits' ? 'You do not have enough Vidverge credits. Add credits, then retry.' : category === 'auth-credential' ? 'Your workspace session could not be verified. Refresh and retry.' : category === 'cast-approval' ? 'Approve every retained cast sheet, or confirm that no cast is needed, before Start.' : category === 'rate-limit' ? 'The provider is rate-limited. Wait for the stated retry time, then retry this scene.' : category === 'provider-outage' ? 'The provider is temporarily unavailable. This film stays paused; retry later or create a separate Omni version.' : action === 'stop' ? 'This scene could not be repaired after three safe attempts. Check the refund status shown for this attempt.' : 'The provider refused this attempt. Review the technical details before another paid attempt.',
    founderDiagnosis: `class=${category}; attempt=${boundedAttempt}; action=${action}; raw_provider_error=${rawText}`,
  };
}

export function preserveTimecodesWhileSoftening(prompt: string): string {
  return String(prompt || '').split('\n').map((line) => {
    const match = line.match(/^(\s*(?:SHOT\s+\d+\s+—\s+)?\d+(?:\.\d+)?-\d+(?:\.\d+)?s:\s*)(.*)$/i);
    if (!match) return line;
    const softened = match[2]
      .replace(/\b(?:blood|gore|graphic injury|weapon|violent attack)\b/gi, 'non-graphic dramatic tension')
      .replace(/\b(?:celebrity|famous person)\b/gi, 'fictional adult performer');
    return match[1] + softened;
  }).join('\n');
}
