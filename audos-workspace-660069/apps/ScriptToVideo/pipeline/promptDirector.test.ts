import { directPrompt, scrubProviderPrompt, validatePromptDirectorOutput } from './promptDirector';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export function runPromptDirectorTests(): void {
  for (const modelId of ['openrouter/bytedance/seedance-2.5', 'kling-3.0-omni', 'gemini-omni-1.1-flash']) {
    const output = directPrompt({
      modelId,
      duration: modelId.includes('seedance') ? 15 : 8,
      sceneIndex: 1,
      anchor: 'MAYA — short black hair, amber jacket, brass compass; rain-blue station platform',
      style: 'stylised stop-motion animation with tactile paper textures',
      beats: modelId.includes('seedance')
        ? [{ start: 0, end: 4, text: 'Medium shot; MAYA lifts the compass; slow push-in; warm practical light.' }, { start: 4, end: 9, text: 'Close shot; MAYA turns toward the train; tracking camera; platform stays stable.' }, { start: 9, end: 15, text: 'Wide shot; MAYA boards; camera freezes at the door; rain remains steady.' }]
        : [{ start: 0, end: 4, text: 'Medium shot; MAYA lifts the compass; slow push-in.' }, { start: 4, end: 8, text: 'Wide shot; MAYA boards; camera locks off.' }],
      references: ['maya-cast-sheet'],
      previousFinalState: 'MAYA at frame left, compass raised, cool rain backlight',
    });
    assert(validatePromptDirectorOutput(output, modelId.includes('seedance') ? 15 : 8).length === 0, `${modelId} prompt must validate`);
    assert(output.prompt.includes('0-4s:'), `${modelId} prompt must expose editable timecodes`);
    assert(output.prompt.includes('MAYA — short black hair'), `${modelId} prompt must repeat the fixed anchor`);
    assert(output.prompt.includes('STYLE: stylised stop-motion animation'), `${modelId} prompt must lead each shot with the selected style`);
    assert(!/photorealistic|hyper-realistic|weight, inertia|natural lighting/i.test(output.prompt), `${modelId} prompt must strip realism filler for stylised work`);
    for (const line of output.prompt.split('\n').filter((value) => /\d+-\d+s:/.test(value))) {
      assert(line.trim().split(/\s+/).length <= 86, `${modelId} shot prompt must stay near the 40-80 word target`);
    }
    assert(Boolean(output.why), `${modelId} prompt must explain why it is structured this way`);
  }

  const sports = directPrompt({
    modelId: 'openrouter/bytedance/seedance-2.5',
    duration: 10,
    sceneIndex: 1,
    anchor: 'A basketball guard in a black jersey, ball at the right hip',
    style: 'bold graphic sports film',
    beats: [{ start: 0, end: 10, text: 'The guard gathers for a jump shot and scores; camera tracks from courtside.' }],
    references: [],
    previousFinalState: 'athlete crouched at the arc, right hand on the ball at hip height',
  });
  assert(sports.prompt.includes('MOTION:'), 'sports prompts must carry a visible motion clause');
  assert(/knees bend.*wrist snaps.*ball arcs.*net/i.test(sports.prompt), 'basketball motion must describe body mechanics and ball path');
  assert(!/\b(?:realism|realistic|photorealistic|hyper-realistic|gravity|inertia|physics-accurate)\b/i.test(sports.prompt), 'sports provider prompts must not contain banned terms');
  assert(sports.prompt.includes('ball at hip height'), 'sports continuity must preserve the previous ball position');

  const nonSports = directPrompt({
    modelId: 'openrouter/bytedance/seedance-2.5',
    duration: 8,
    sceneIndex: 0,
    anchor: 'A ceramic mug beside a notebook on a quiet desk',
    style: 'soft watercolor illustration',
    beats: [{ start: 0, end: 8, text: 'Steam curls upward while the camera eases closer.' }],
    references: [],
  });
  assert(!nonSports.prompt.includes('MOTION:'), 'non-sports prompts must not receive sports motion filler');
  assert(!/\b(?:realism|realistic|photorealistic|hyper-realistic|gravity|inertia|physics-accurate)\b/i.test(nonSports.prompt), 'non-sports provider prompts must not contain banned terms');
  assert(scrubProviderPrompt('Natural motion, true-to-life movement, realistic gravity').match(/natural motion|true-to-life movement/gi)?.length === 1, 'cleanup must retain at most one natural-camera phrase');
}
