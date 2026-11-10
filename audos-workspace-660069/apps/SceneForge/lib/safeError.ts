/**
 * Customer-safe error text for SceneForge. Raw pipeline errors can echo the
 * script, a model prompt, generated code or a stack trace; those are logged to
 * the console only and replaced with short human copy.
 */

const CODE_HINTS: RegExp[] = [
  /```/,
  /\bimport\s+[\w{*]/,
  /\bexport\s+(?:default|const|function|interface|type)\b/,
  /\bfunction\s*[\w$]*\s*\(/,
  /=>\s*[{(]/,
  /<\/?[A-Za-z][\w.]*(?:\s[^<>]*)?\/?>/,
  /\b(?:const|let|var)\s+[\w$]+\s*=/,
  /\breturn\s*[<({[]/,
  /^\s*at\s+\S+\s+\(?\S+:\d+/m,
  /\.(?:tsx?|jsx?|mjs|cjs):\d+/,
  /\{\s*"[^"]{1,40}"\s*:/,
  /[{};]\s*\n/,
  /\b(?:system prompt|you are an? \w+|return only|respond with json)\b/i,
  /^\s*(?:act|scene)\s+\d+\b.*\d:\d\d/im,
  /^\s*(?:shot|camera|audio|ends on)\s*:/im,
  /\b\w+ says:\s*[“"]/,
  /\b(?:undefined|null) is not\b|\bCannot read propert/i,
  /\b(?:SyntaxError|TypeError|ReferenceError|RangeError)\b/,
];

/** Credentials, provider internals, URLs, file paths and network/runtime error text. */
const TECHNICAL_HINTS: RegExp[] = [
  /\bsk-[A-Za-z0-9_*-]{4,}/,
  /\*{5,}/,
  /\b(?:x-api-key|api[ _-]?keys?|bearer\s+\S+|access[ _-]?token|secret[ _-]?key|client[ _-]?secret|authorization header)\b/i,
  /\bproxy (?:failed|error)\b/i,
  /\bhttps?:\/\/\S+/i,
  /(?:^|[\s("'`=])\.{0,2}\/?(?:[\w.@-]+\/){2,}[\w.@-]+/,
  /\b[A-Za-z]:\\\S+/,
  /\b[\w-]+(?:\.[\w-]+)*\.(?:tsx?|jsx?|mjs|cjs|py|json|ya?ml|toml|sh|md|map)\b/i,
  /\b(?:codex|node_modules|webpack|esbuild|stack ?trace|traceback)\b/i,
  /\bat\s+[\w$.<>]+\s*\(/,
  /\b(?:fetch failed|failed to fetch|NetworkError|AbortError|socket hang up|ECONN[A-Z]+|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|unexpected token|unexpected end of json|JSON\.parse|is not a function|is not defined|is not iterable)\b/i,
  /\b(?:HTTP|status(?: code)?)\s*[45]\d\d\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\byou are (?:claude|gpt|chatgpt|gemini|opus|sonnet|sceneforge|acting)\b|\bacting as an? \w+|\b(?:senior|expert|autonomous) (?:remotion|video|vision) (?:editor|coder|reviewer)\b/i,
];

const SANITIZE_INPUT_LIMIT = 600;

/** Short copy for a scene or panel that failed to render. */
export const SCENE_RENDER_FALLBACK = 'Something went wrong rendering this scene.';

/** True when the text contains code, a stack trace, a prompt, a credential, a URL or a file path. */
export function looksTechnical(raw: unknown): boolean {
  try {
    const text = String(raw ?? '');
    return CODE_HINTS.some((pattern) => pattern.test(text)) || TECHNICAL_HINTS.some((pattern) => pattern.test(text));
  } catch {
    return true;
  }
}

const STEP_COPY: Record<string, string> = {
  voicing: 'We couldn’t create the voice track for this video.',
  avatar: 'We couldn’t finish the avatar video.',
  transcribe: 'We couldn’t line up the captions with the voice.',
  direct: 'The editor couldn’t plan this video.',
  assets: 'Some visuals for this video couldn’t be created.',
  code: 'The motion graphics couldn’t be put together.',
  drafts: 'The style previews couldn’t be rendered.',
  draft_pick: 'The style previews couldn’t be rendered.',
  final_render: 'The final video couldn’t be rendered.',
  portrait_finish: 'The vertical version couldn’t be rendered.',
  qa: 'The quality check couldn’t finish.',
};

const logged = new Set<string>();

/** Logs the raw text once per distinct message — console only, never the UI. */
export function logErrorDetails(context: string, raw: unknown): void {
  try {
    const text = raw instanceof Error ? `${raw.message}\n${raw.stack || ''}` : String(raw ?? '');
    if (!text.trim()) return;
    const key = `${context}|${text.slice(0, 500)}`;
    if (logged.has(key)) return;
    logged.add(key);
    if (logged.size > 200) logged.clear();
    console.warn(`[SceneForge] ${context}:`, text);
  } catch {
    /* logging must never break rendering */
  }
}

function words(value: string): string[] {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean);
}

/** True when 7+ consecutive words of `text` also appear in `script`. */
function echoesScript(text: string, script: string | null | undefined): boolean {
  if (!script) return false;
  const target = words(text);
  if (target.length < 7) return false;
  const haystack = ` ${words(script).join(' ')} `;
  for (let i = 0; i + 7 <= target.length; i += 1) {
    if (haystack.includes(` ${target.slice(i, i + 7).join(' ')} `)) return true;
  }
  return false;
}

/** Short, single-paragraph, human text with no code, prompt, stack or script echo. */
export function isSafeErrorText(raw: unknown, options?: { script?: string | null; maxLength?: number }): boolean {
  try {
    const text = String(raw ?? '').trim();
    if (!text) return false;
    if (text.length > (options?.maxLength ?? 220)) return false;
    if ((text.match(/\n/g) || []).length > 1) return false;
    if (looksTechnical(text)) return false;
    if (echoesScript(text, options?.script)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips code fences, technical parentheticals (provider errors, keys) and any
 * line with code, paths, URLs or stack frames, then truncates to `maxLength`.
 * Returns '' when nothing short and human is left, or when the input is long
 * enough to be a dump (script, prompt, generated code).
 */
export function sanitizeErrorText(raw: unknown, options?: { script?: string | null; maxLength?: number }): string {
  try {
    const max = Math.max(40, options?.maxLength ?? 160);
    const source = String(raw ?? '');
    if (!source.trim() || source.length > SANITIZE_INPUT_LIMIT) return '';
    const withoutCode = source.replace(/```[\s\S]*?(?:```|$)/g, '\n').replace(/`[^`\n]*`/g, '');
    if (/^\s*at\s+\S+/m.test(withoutCode) && /\n/.test(withoutCode.trim())) return '';
    const withoutDetail = withoutCode.replace(/\s*\(([^()]*)\)/g, (match, inner: string) => (/[:=]/.test(inner) || looksTechnical(inner) ? '' : match));
    const lines = withoutDetail.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line && !/[:\-–—]$/.test(line) && !looksTechnical(line));
    if (!lines.length || lines.length > 2) return '';
    let text = lines.join(' ').replace(/\s+([,.;!?])/g, '$1').trim();
    if (text.length > max) {
      const sentence = text.match(/^.{12,}?[.!?](?=\s|$)/);
      text = sentence && sentence[0].length <= max ? sentence[0] : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
    }
    if (text.length < 8 || !/\p{L}{3}/u.test(text)) return '';
    return isSafeErrorText(text, { script: options?.script, maxLength: max }) ? text : '';
  } catch {
    return '';
  }
}

/** Returns `raw` when it is safe to show, else its sanitized form, else `fallback` (raw goes to the console). */
export function safeErrorText(raw: unknown, fallback: string, options?: { script?: string | null; maxLength?: number; context?: string }): string {
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  if (isSafeErrorText(text, options)) return text;
  logErrorDetails(options?.context || 'hidden error details', text);
  return sanitizeErrorText(text, { script: options?.script, maxLength: options?.maxLength ?? 220 }) || fallback;
}

export interface FriendlyFailure {
  title: string;
  message: string;
  /** A short provider reason, only when it passed isSafeErrorText. */
  reason: string | null;
}

/** Friendly copy for a failed SceneForge project; the raw stage note is logged, never shown unless it is short and safe. */
export function friendlyFailure(project: { failed_step?: string | null; stage_note?: string | null; script?: string | null; id?: string } | null | undefined): FriendlyFailure {
  const step = String(project?.failed_step || '');
  const raw = String(project?.stage_note || '').trim();
  if (raw) logErrorDetails(`step "${step || 'unknown'}" failed${project?.id ? ` (project ${project.id})` : ''}`, raw);
  const stripped = raw.replace(/^The pipeline stopped at "[^"]{1,40}":\s*/i, '').trim();
  const reason = stripped ? sanitizeErrorText(stripped, { script: project?.script, maxLength: 180 }) || null : null;
  return {
    title: STEP_COPY[step] || 'Something went wrong while making this video.',
    message: 'Your earlier progress is saved. Press Retry to pick up from this step — you won’t be charged again.',
    reason,
  };
}
