import { callHook } from './workspace';

export type SafePromptInput = { prompt: string; ownedBrandNames?: string[]; inputMediaUrls?: string[]; mode?: 'copilot' | 'autopilot' };
export type SafePromptResult = { prompt: string; flagged: string[]; changed: boolean };
export type GenerationModel = { id: string; provider: string };

function token(): string { return String((window as any).__workspaceDb?.token || ''); }
function jsonText(value: string): any { return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
async function llmJson(system: string, user: string): Promise<any> {
  const workspaceToken = token();
  if (!workspaceToken) throw new Error('Workspace AI access is not ready.');
  const response = await fetch('/proxy/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-DB-Token': workspaceToken }, body: JSON.stringify({ model: 'gpt-6.1-sol', reasoning_effort: 'medium', max_completion_tokens: 6000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error?.message || data?.error || 'Prompt safety check failed.'));
  return jsonText(String(data?.choices?.[0]?.message?.content || '{}'));
}

export async function makePromptSafe(input: SafePromptInput): Promise<SafePromptResult> {
  const result = await llmJson('You rewrite media-generation prompts without changing their intended story or action. Remove real public-figure names, copyrighted characters, graphic violence, sexual wording, and third-party brands or logos unless the brand appears in ownedBrandNames. Use generic visual descriptions instead. Keep camera, timing, subject, product and motion details. Return JSON {prompt:string, flagged:string[]}.', JSON.stringify({ prompt: input.prompt, ownedBrandNames: input.ownedBrandNames || [] }));
  const prompt = String(result.prompt || input.prompt).trim();
  return { prompt, flagged: Array.isArray(result.flagged) ? result.flagged.map(String).slice(0, 20) : [], changed: prompt !== input.prompt.trim() };
}

export function isProviderRefusal(error: unknown): boolean {
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error || '');
  return /moderation|safety|policy|blocked|prohibited|likeness|celebrity|copyright|content[_ -]?filter|provider_policy/i.test(value);
}
async function rewriteAfterRefusal(prompt: string, reason: string): Promise<string> {
  const result = await llmJson('Rewrite the supplied media prompt once so it avoids the provider refusal while preserving the same safe meaning, action, camera and product. Never return the identical prompt. Return JSON {prompt:string}.', JSON.stringify({ prompt, refusalReason: reason }));
  const next = String(result.prompt || '').trim();
  if (!next || next === prompt) throw new Error('The refused prompt could not be safely rewritten.');
  return next;
}
async function logBlock(app: string, model: GenerationModel, message: string, terms: string[] = []) {
  try { await callHook('vv-job-failure', { app, provider: model.provider, model: model.id, errorClass: 'provider_policy', message, blockedTerms: terms }); } catch { /* logging never masks the generation error */ }
}

export async function generateWithSafePrompt<T>(options: {
  app: string;
  prompt: SafePromptInput;
  models: GenerationModel[];
  generate: (model: GenerationModel, prompt: string) => Promise<T>;
  refund?: () => Promise<void>;
}): Promise<{ result: T; model: GenerationModel; prompt: string; rewrites: number }> {
  if (!options.models.length) throw new Error('No compatible generation model is available.');
  const safe = await makePromptSafe(options.prompt);
  let lastError: unknown = null;
  for (const model of options.models) {
    let prompt = safe.prompt;
    try { return { result: await options.generate(model, prompt), model, prompt, rewrites: safe.changed ? 1 : 0 }; }
    catch (error) {
      lastError = error;
      if (!isProviderRefusal(error)) throw error;
      await logBlock(options.app, model, String(error instanceof Error ? error.message : error), safe.flagged);
    }
    try {
      prompt = await rewriteAfterRefusal(prompt, String(lastError instanceof Error ? lastError.message : lastError));
      return { result: await options.generate(model, prompt), model, prompt, rewrites: safe.changed ? 2 : 1 };
    } catch (error) {
      lastError = error;
      if (!isProviderRefusal(error)) throw error;
      await logBlock(options.app, model, String(error instanceof Error ? error.message : error), safe.flagged);
    }
  }
  if (options.refund) await options.refund();
  throw new Error('Every compatible model refused this request. Remove the flagged person, logo, character or sensitive detail and try again.');
}
