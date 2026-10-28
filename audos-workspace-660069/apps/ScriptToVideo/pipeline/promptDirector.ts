import { capabilityFor } from '../v2Contracts';
import type { TimecodedBeat } from './bigScenePlanner';

export interface PromptDirectorInput {
  modelId: string;
  duration: number;
  sceneIndex: number;
  anchor: string;
  /** User-selected visual style. Leads every shot; sports are also detected from it. */
  style?: string;
  beats: TimecodedBeat[];
  references: string[];
  previousFinalState?: string;
  dialogue?: Array<{ speaker: string; tone: string; line: string; start: number; end: number }>;
}
export interface PromptDirectorOutput {
  prompt: string;
  beats: TimecodedBeat[];
  references: string[];
  negative: string | null;
  notes: string[];
  why: string;
}

export const BANNED_PROVIDER_PROMPT_TERMS = /\b(?:hyper[- ]?realistic|photorealistic|realism|realistic|gravity|inertia|physics(?:[- ]accurate)?|weight|natural lighting)\b/gi;
const NATURAL_CAMERA_PHRASE = /\b(?:natural motion|true-to-life movement)\b/gi;
const SPORTS: Array<{ id: string; pattern: RegExp; motion: string }> = [
  { id: 'basketball', pattern: /\b(?:basketball|jump shot|layup|dunk|hoop|free throw|dribbl(?:e|ing))\b/i, motion: 'knees bend, hips extend, wrist snaps; ball arcs and drops through the net' },
  { id: 'golf', pattern: /\b(?:golf|golfer|tee shot|fairway|putt(?:ing)?|clubhead)\b/i, motion: 'hips turn, pressure shifts to front foot, club strikes through; ball launches with backspin' },
  { id: 'soccer', pattern: /\b(?:soccer|footballer|football pitch|penalty kick|goalkeeper|striker)\b/i, motion: 'plant foot lands, kicking hip turns; ball spins toward the target' },
  { id: 'tennis', pattern: /\b(?:tennis|tennis serve|forehand|backhand|racket|racquet)\b/i, motion: 'feet set, torso rotates, racket meets ball; follow-through carries across the body' },
  { id: 'baseball', pattern: /\b(?:baseball|pitcher|batter|home run|batting|pitching)\b/i, motion: 'front foot plants, hips rotate, bat meets ball; follow-through finishes high' },
  { id: 'boxing', pattern: /\b(?:boxing|boxer|punch|jab|cross|uppercut|boxing ring)\b/i, motion: 'rear foot drives, hips rotate, fist lands; guard returns immediately' },
  { id: 'running', pattern: /\b(?:running (?:race|track|athlete)|runner|jogger|sprint|sprinter|marathon|track race)\b/i, motion: 'foot lands beneath the hips, arms counter-swing, stride drives forward' },
  { id: 'sports', pattern: /\b(?:athlete|sports?)\b/i, motion: 'feet plant, hips turn, contact lands cleanly, follow-through carries the motion' },
];

export function detectSportsContent(value: string): string | null {
  return SPORTS.find((sport) => sport.pattern.test(String(value || '')))?.id || null;
}

export function sportsMotionClause(sport: string | null): string {
  return SPORTS.find((entry) => entry.id === sport)?.motion || '';
}

/** Final provider boundary: remove rejection-prone abstractions without
 * touching concrete body/ball action, timecodes, dialogue, or continuity. */
export function scrubProviderPrompt(value: string): string {
  return String(value || '').split('\n').map((line) => {
    let naturalPhraseSeen = false;
    return line
      .replace(BANNED_PROVIDER_PROMPT_TERMS, '')
      .replace(NATURAL_CAMERA_PHRASE, (phrase) => {
        if (naturalPhraseSeen) return '';
        naturalPhraseSeen = true;
        return phrase;
      })
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/([,;])\s*\1+/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }).filter(Boolean).join('\n');
}

function capWords(value: string, max = 80): string {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ').replace(/[,:;\-]+$/, '')}.`;
}

/** Keep each shot concise and provider-safe. The style parameter remains for
 * API compatibility; rejection-prone terms are never allowed downstream. */
export function polishShotPrompt(value: string, _style = '', maxWords = 80): string {
  return capWords(scrubProviderPrompt(value).replace(/\s+/g, ' ').trim(), maxWords);
}

function beatLine(beat: TimecodedBeat, input: PromptDirectorInput, sport: string | null): string {
  const dialogue = input.dialogue?.find((line) => line.start < beat.end && line.end > beat.start);
  const spoken = dialogue ? ` [${dialogue.speaker}: ${dialogue.tone}]: "${dialogue.line}"` : '';
  const style = polishShotPrompt(input.style || input.anchor, '', 14);
  const motion = sport ? `MOTION: ${sportsMotionClause(sport)}.` : '';
  const action = polishShotPrompt(`${input.anchor}. ${beat.text}${spoken}`, '', sport ? 38 : 58);
  return capWords(`${beat.start}-${beat.end}s: STYLE: ${style}. ${motion} ${action}`, 80);
}

export function directPrompt(input: PromptDirectorInput): PromptDirectorOutput {
  const capability = capabilityFor(input.modelId);
  if (!capability) throw new Error(`Unknown Prompt Director model: ${input.modelId}.`);
  const adapter = capability.promptFamily;
  const sportsContext = [input.anchor, input.style || '', ...input.beats.map((beat) => beat.text)].join(' ');
  const sport = detectSportsContent(sportsContext);
  const beats = adapter === 'kling-3' && input.beats.length > 6
    ? Array.from({ length: 6 }, (_, index) => {
        const startIndex = Math.floor(index * input.beats.length / 6);
        const endIndex = Math.floor((index + 1) * input.beats.length / 6);
        const group = input.beats.slice(startIndex, Math.max(startIndex + 1, endIndex));
        return { start: group[0].start, end: group[group.length - 1].end, text: group.map((beat) => beat.text).join(' Then ') };
      })
    : input.beats;
  const opening = input.sceneIndex > 0 && input.previousFinalState
    ? `CONTINUITY: Begin from ${polishShotPrompt(input.previousFinalState, input.style)}. Input: ${capability.continuityMode}.`
    : `ANCHOR: ${polishShotPrompt(input.anchor, input.style)}.`;
  const beatLines = beats.map((beat, index) => {
    const label = adapter === 'kling-3' ? `SHOT ${index + 1} — ` : '';
    return `${label}${beatLine(beat, input, sport)}`;
  });
  const referenceLine = input.references.length
    ? adapter === 'kling-3'
      ? `REFERENCES: ${input.references.map((reference, index) => `@image_${index + 1}=${reference}`).join('; ')}`
      : `REFERENCES: ${input.references.join('; ')}`
    : '';
  const audioLine = capability.nativeAudio ? 'AUDIO: preserve named dialogue; add only scene-appropriate ambience and restrained SFX/music.' : '';
  const negative = capability.supportsNegativePrompt ? 'identity drift, wardrobe changes, warped anatomy, unstable background, unreadable text, watermark' : null;
  const inlineAvoid = !capability.supportsNegativePrompt ? 'AVOID IN PROMPT: identity drift, wardrobe changes, warped anatomy, unstable background, unreadable text, watermark.' : '';
  const prompt = scrubProviderPrompt([opening, referenceLine, ...beatLines, audioLine, inlineAvoid].filter(Boolean).join('\n'));
  const output: PromptDirectorOutput = {
    prompt,
    beats: beats.map((beat) => ({ ...beat })),
    references: input.references.slice(0, capability.maxReferences),
    negative,
    notes: [`${capability.label} adapter: ${adapter}.`, capability.continuityMode === 'video-reference' ? 'Carry the previous clip as video reference.' : capability.continuityMode === 'last-frame' ? 'Carry the previous clip final frame.' : 'No continuity media input.'],
    why: `${capability.label} gets one ${input.duration}s generation containing ${beats.length} timecoded beat${beats.length === 1 ? '' : 's'}; the anchor and continuity instruction reduce identity drift.`,
  };
  const errors = validatePromptDirectorOutput(output, input.duration);
  if (errors.length) throw new Error(errors.join(' '));
  return output;
}

export function validatePromptDirectorOutput(output: PromptDirectorOutput, duration: number): string[] {
  const errors: string[] = [];
  let cursor = 0;
  for (const beat of output.beats) {
    if (beat.start !== cursor || beat.end <= beat.start) errors.push(`Beat starting ${beat.start}s is not contiguous.`);
    cursor = beat.end;
    if (!output.prompt.includes(`${beat.start}-${beat.end}s:`)) errors.push(`Prompt is missing ${beat.start}-${beat.end}s timecode.`);
  }
  if (cursor !== duration) errors.push(`Prompt beats cover ${cursor}s, expected ${duration}s.`);
  if (!output.prompt.trim()) errors.push('Prompt is empty.');
  return errors;
}
