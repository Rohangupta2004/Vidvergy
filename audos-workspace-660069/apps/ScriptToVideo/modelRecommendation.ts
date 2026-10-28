import type { VideoModelConfig } from './pipeline/videoModelService';

export interface ModelScore {
  model: VideoModelConfig;
  score: number;
  reasons: string[];
  signals: { dialogue: boolean; characters: number; motion: boolean; longTake: boolean; duration: number };
}

const preferred = ['seedance-2.5', 'kling-3.0-omni', 'kling-3.0', 'seedance-2.0', 'kling-2.6', 'kling-2.5-turbo', 'runway-gen4.5', 'omni-1.1-flash', 'runway-gen4-turbo'];

export function scoreVideoModels(models: VideoModelConfig[], input: { script: string; duration: number; charactersSpeak?: boolean; referenceCount?: number }): ModelScore[] {
  const script = String(input.script || '');
  const dialogue = input.charactersSpeak === true || /(?:dialogue|says?|speaks?|voice|“|”|"[^"\n]{2,}")/i.test(script);
  const characters = Math.max(Number(input.referenceCount) || 0, new Set((script.match(/@[a-z0-9_-]+/gi) || []).map((name) => name.toLowerCase())).size);
  const motion = /run|walk|drive|dance|fight|chase|fly|camera|tracking|pan|orbit|push[- ]?in|handheld/i.test(script);
  const duration = Math.max(1, Math.round(Number(input.duration) || 1));
  return models.map((model) => {
    let score = 100 - preferred.indexOf(model.id) * 4;
    const reasons: string[] = [];
    if (model.id === 'seedance-2.5') { score += duration >= 15 ? 28 : 14; reasons.push(`up to ${model.safeMaxDuration}s per coherent generation`); }
    if (model.id === 'kling-3.0-omni') { score += characters >= 2 ? 24 : 12; reasons.push('modern Kling motion with 2–4 recurring-subject references'); }
    if (model.id === 'kling-3.0') { score += motion ? 18 : 8; reasons.push('modern Kling motion and controlled 5s/10s shots'); }
    if (dialogue) {
      if (model.audioSupported) { score += 22; reasons.push('native audio fits dialogue'); }
      else { score -= 30; reasons.push('silent adapter; dialogue needs post audio or another model'); }
    }
    if (characters > model.maxReferenceImages) { score -= 18; reasons.push(`only ${model.maxReferenceImages} image reference${model.maxReferenceImages === 1 ? '' : 's'}`); }
    if (motion && model.provider === 'kling') score += 10;
    if (model.id === 'runway-gen4.5') { score += motion ? 12 : 6; reasons.push('Runway cinematic motion with text or image input'); }
    if (model.imageToVideoOnly) {
      if (characters > 0) reasons.push('requires a seed image for every block');
      else { score -= 140; reasons.push('image-to-video only, but no seed reference is available'); }
    }
    const exactDurationPossible = model.discreteDurations
      ? duration >= 5 && (duration % 10 === 0 || duration % 10 === 5)
      : duration >= Number(model.minDuration || 1);
    if (!exactDurationPossible) { score -= 120; reasons.push(`cannot represent exactly ${duration}s with its legal clip lengths`); }
    if (model.id === 'omni-1.1-flash') { score -= 20; reasons.push('strongest when many references or an existing-video edit are needed'); }
    return { model, score, reasons, signals: { dialogue, characters, motion, longTake: duration > 10, duration } };
  }).sort((a, b) => b.score - a.score || preferred.indexOf(a.model.id) - preferred.indexOf(b.model.id));
}

export function recommendationExplanation(result: ModelScore): string {
  const signal = result.signals;
  return `${result.model.label} scores ${result.score}: ${result.reasons.slice(0, 3).join('; ')}. Script signals: ${signal.dialogue ? 'dialogue' : 'no required dialogue'}, ${signal.characters || 'no'} explicit character reference${signal.characters === 1 ? '' : 's'}, ${signal.motion ? 'strong motion' : 'controlled motion'}, ${signal.duration}s target.`;
}
