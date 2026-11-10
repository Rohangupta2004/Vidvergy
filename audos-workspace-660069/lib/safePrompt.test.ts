import { isProviderRefusal } from './safePrompt';

export function runSafePromptRegression() {
  const refusals = ['moderation blocked', 'content_policy', 'celebrity likeness refused'];
  if (!refusals.every((message) => isProviderRefusal(new Error(message)))) throw new Error('A provider refusal was not classified.');
  if (isProviderRefusal(new Error('network timeout'))) throw new Error('A transport error was misclassified as policy.');
  return { pass: true };
}

export const SAFE_PROMPT_REGRESSION = runSafePromptRegression();
