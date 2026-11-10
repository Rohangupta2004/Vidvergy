/**
 * Reference fixture + self-test for the structured script parser.
 * Not imported by the app; run `runScriptFormatSelfTest()` from a dev console
 * or a test harness to check the parser against the Pip water-cycle script.
 */
import { looksStructured, parseStructuredScript, spokenLinesFromStructured, structuredOutline } from './scriptFormat';

const STYLE = 'Cinematic 3D animated film, Pixar-style stylized toon, soft global illumination, subsurface scattering on water, shallow depth of field, rich saturated colors, 16:9.';
const PIP = 'Pip, a small round water droplet with a translucent sky-blue body, big glossy dark eyes, rosy cheeks, a tiny curl of mist on top of his head and short stubby arms, always slightly wobbling like jelly.';

type FixtureScene = { title: string; shot: string; endsOn: string; setting: string; camera: string; audio: string; line: string };

const ACTS: Array<{ title: string; summary: string; scenes: FixtureScene[] }> = [
  {
    title: 'Born in a Cloud',
    summary: 'Pip forms from vapour inside a cloud, makes friends, and grows heavy enough to fall.',
    scenes: [
      { title: 'Born in a cloud', shot: 'Slow push-in through swirling white vapour.', endsOn: 'Pip blinking awake in a soft pocket of cloud.', setting: 'Inside a towering cumulus cloud at sunrise, warm peach light glowing through the mist.', camera: '35mm, slow dolly forward, gentle rack focus onto Pip.', audio: 'Soft wind, a faint crystalline chime as Pip forms.', line: 'Whoa… where am I? Everything is so fluffy!' },
      { title: 'Cloud friends', shot: 'Orbit around Pip as other droplets pop into view.', endsOn: 'Pip surrounded by a ring of smiling droplets.', setting: 'The same cloud interior, dozens of tiny droplets appearing like fireflies.', camera: '28mm, slow 180-degree orbit at Pip\'s eye level.', audio: 'Playful pops and giggles, airy pad underneath.', line: 'Hi everyone! I\'m Pip. Are we all made of water?' },
      { title: 'Getting heavy', shot: 'Static medium shot as droplets merge into Pip.', endsOn: 'A bigger, rounder Pip sinking slightly lower in the cloud.', setting: 'The cloud floor darkening to grey as droplets cluster together.', camera: '50mm, locked-off, subtle downward tilt.', audio: 'Squishy merging sounds, low rumble far away.', line: 'Hey, we keep sticking together. I\'m getting heavier!' },
      { title: 'The cloud darkens', shot: 'Wide pull-back revealing the whole storm cloud.', endsOn: 'Pip clinging to the cloud\'s underside above a green valley.', setting: 'A dark grey storm cloud over rolling green hills, sun hidden.', camera: '24mm, crane up and back, slow.', audio: 'Distant thunder, wind rising.', line: 'Uh-oh. I think the cloud is too full to hold me.' },
      { title: 'Letting go', shot: 'Low-angle close-up as Pip lets go and drops.', endsOn: 'Pip falling headfirst out of frame toward the valley.', setting: 'The underside of the storm cloud, first raindrops streaking down.', camera: '85mm, handheld micro-shake, quick tilt down.', audio: 'A deep breath, then a whoosh of falling air.', line: 'Okay… one, two, three… here I gooo!' },
    ],
  },
  {
    title: 'The Great Fall',
    summary: 'Pip falls as rain, lands on a mountain and rides a stream and a river down to the sea.',
    scenes: [
      { title: 'Falling rain', shot: 'Tracking shot falling alongside Pip through the rain.', endsOn: 'A pine-covered mountainside rushing up toward Pip.', setting: 'Open sky full of falling raindrops, the valley far below.', camera: '24mm, vertical tracking at Pip\'s speed, slight roll.', audio: 'Rushing air, rain patter, excited heartbeat rhythm.', line: 'This is the best ride ever! Wheee!' },
      { title: 'Splash on a leaf', shot: 'Slow-motion close-up of Pip splashing onto a pine needle.', endsOn: 'Pip sliding off the needle tip toward the mossy ground.', setting: 'A wet pine branch on a misty mountainside, raindrops beading everywhere.', camera: '100mm macro, 120fps slow motion, shallow focus.', audio: 'A soft plip, dripping needles, birds starting to sing.', line: 'Boing! Okay, that tickled. Now which way is down?' },
      { title: 'Joining the stream', shot: 'Follow shot as Pip rolls downhill into a trickling stream.', endsOn: 'Pip bobbing on the surface of a narrow stream.', setting: 'Mossy rocks and ferns, a tiny stream winding between them.', camera: '35mm, low ground-level follow, smooth gimbal.', audio: 'Trickling water, crickets, Pip\'s little bounces.', line: 'So many droplets going the same way. Wait for me!' },
      { title: 'Down the river', shot: 'Aerial drone glide over the widening river.', endsOn: 'Pip riding a gentle wave past a river town.', setting: 'A wide blue river through farmland and a small town with red roofs.', camera: 'Drone, high wide glide, slowly descending to water level.', audio: 'Flowing river, distant town bells, cheerful strings.', line: 'Hello, ducks! Hello, boats! The river is so big!' },
      { title: 'Reaching the ocean', shot: 'Wide reveal as the river mouth opens into the sea.', endsOn: 'Pip floating on a calm turquoise ocean swell.', setting: 'A river delta meeting a sparkling turquoise ocean under bright sun.', camera: '21mm, push forward through the river mouth, horizon level.', audio: 'Waves, seagulls, music swelling.', line: 'The ocean! I made it all the way to the sea!' },
    ],
  },
  {
    title: 'Back to the Sky',
    summary: 'The sun warms Pip, he evaporates, rises, cools and becomes part of a new cloud — the cycle begins again.',
    scenes: [
      { title: 'Warm sunshine', shot: 'Slow tilt up from Pip to the blazing sun.', endsOn: 'Pip glowing golden, tiny wisps of steam rising from his head.', setting: 'Open ocean at midday, heat shimmer above gentle waves.', camera: '50mm, slow tilt up then back down to Pip.', audio: 'Calm waves, a warm sustained chord.', line: 'Mmm, the sun feels so warm. I feel… lighter?' },
      { title: 'Evaporation', shot: 'Close-up as Pip turns into shimmering vapour.', endsOn: 'A translucent, misty Pip lifting off the water surface.', setting: 'The ocean surface sparkling, invisible vapour made visible as golden shimmer.', camera: '85mm, locked-off then slow rise with Pip.', audio: 'Soft fizzing shimmer, airy whoosh.', line: 'I\'m floating! I\'m turning into vapour!' },
      { title: 'Rising high', shot: 'Upward crane following Pip into the sky.', endsOn: 'Pip among many vapour friends high above the coastline.', setting: 'Clear blue sky above the coast, the shoreline shrinking below.', camera: '24mm, continuous crane up, slow spin.', audio: 'Rising wind, a hopeful melody building.', line: 'Up, up, up! I can see the whole coast from here!' },
      { title: 'Cooling down', shot: 'Medium shot as frost sparkles form around Pip.', endsOn: 'Pip and friends huddling together into a tiny cloud wisp.', setting: 'High cold air, blue-white light, ice-crystal sparkles drifting.', camera: '50mm, slow push-in, cool colour shift.', audio: 'Crisp tinkling, gentle wind, music softening.', line: 'Brrr, it\'s chilly up here. Let\'s stick together, everyone!' },
      { title: 'Home again', shot: 'Slow pull-back revealing a brand-new cloud at sunset.', endsOn: 'A fluffy new cloud glowing pink, Pip waving from inside.', setting: 'A new cumulus cloud forming over the ocean at sunset, pink and gold light.', camera: '35mm, slow dolly back to a wide hero shot.', audio: 'Warm full orchestra resolving, soft wind.', line: 'Back in a cloud — I\'m home! Let\'s do it all again!' },
    ],
  },
];

function buildPipScript(): string {
  const out: string[] = ['Pip and the Water Cycle — 2:00 animated short', ''];
  let sceneNo = 0;
  ACTS.forEach((act, actIndex) => {
    const actStart = actIndex * 40;
    out.push(`Act ${actIndex + 1} — ${act.title} (${clock(actStart)}–${clock(actStart + 40)})`);
    out.push(act.summary, '');
    act.scenes.forEach((scene) => {
      const start = sceneNo * 8;
      sceneNo += 1;
      out.push(`Scene ${sceneNo} · ${clock(start)}–${clock(start + 8)} · ${scene.title}`);
      out.push(`Shot: ${scene.shot} Ends on: ${scene.endsOn}`);
      out.push(`${STYLE} ${PIP} ${scene.setting}`);
      out.push(`Camera: ${scene.camera}`);
      out.push(`Audio: ${scene.audio}`);
      out.push(`Pip says: "${scene.line}"`, '');
    });
  });
  out.push(
    'Production tips:',
    '- Generate a reference image of Pip first and attach it to every clip.',
    '- Chain the last frame of each clip into the next clip as its first frame.',
    '- Record the voiceover separately and lay it over the cut.',
    '- Add the title card in editing only, never inside a generated clip.',
    '- Use one continuous music track across all 15 scenes.',
    '',
    'Music prompt: Whimsical orchestral score for a Pixar-style short about a water droplet, plucked strings, celesta and soft woodwinds, 96 BPM.',
    '0:00–0:40 — gentle celesta and pizzicato, curious and light',
    '0:40–1:20 — tempo lifts, playful strings and woodwinds for the big ride',
    '1:20–1:52 — warm swelling strings as Pip rises',
    '1:52–2:00 — full orchestra resolves on a soft major chord',
  );
  return out.join('\n');
}

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export const PIP_REFERENCE_SCRIPT = buildPipScript();
export const PIP_CHARACTER_DESCRIPTION = PIP;
export const PIP_STYLE_PREFIX = STYLE;

export interface SelfTestCheck { name: string; ok: boolean; detail?: string }

export function runScriptFormatSelfTest(): { passed: boolean; checks: SelfTestCheck[] } {
  const checks: SelfTestCheck[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok: Boolean(ok), detail });
  const parsed = parseStructuredScript(PIP_REFERENCE_SCRIPT);
  check('Pip script is detected', looksStructured(PIP_REFERENCE_SCRIPT));
  check('Pip script parses', Boolean(parsed));
  if (parsed) {
    check('3 acts', parsed.acts.length === 3, String(parsed.acts.length));
    check('15 scenes', parsed.scenes.length === 15, String(parsed.scenes.length));
    check('runs 0:00–2:00', parsed.start === 0 && parsed.end === 120 && parsed.durationSec === 120, `${parsed.start}-${parsed.end}`);
    const first = parsed.scenes[0];
    check('Scene 1 header', first.index === 1 && first.start === 0 && first.end === 8 && first.title === 'Born in a cloud', JSON.stringify({ i: first.index, s: first.start, e: first.end, t: first.title }));
    check('act titles', parsed.acts.map((act) => act.title).join('|') === 'Born in a Cloud|The Great Fall|Back to the Sky', parsed.acts.map((act) => act.title).join('|'));
    check('act summaries', parsed.acts.every((act) => act.summary.length > 20));
    check('act ranges', parsed.acts.map((act) => `${act.start}-${act.end}`).join(',') === '0-40,40-80,80-120');
    check('5 scenes per act', parsed.acts.every((act) => act.scenes.length === 5));
    check('every scene has Shot', parsed.scenes.every((scene) => scene.shot.length > 5));
    check('Ends on present for every scene', parsed.scenes.every((scene) => scene.endsOn.length > 5));
    check('Shot excludes Ends on', parsed.scenes.every((scene) => !/ends on/i.test(scene.shot)));
    check('style prefix + character verbatim in every prompt', parsed.scenes.every((scene) => scene.prompt.includes(STYLE) && scene.prompt.includes(PIP)));
    check('Camera and Audio lines', parsed.scenes.every((scene) => scene.camera && scene.audio));
    check('one Pip dialogue line per scene', parsed.scenes.every((scene) => scene.dialogue.length === 1 && scene.dialogue[0].speaker === 'Pip'));
    check('continuous timecodes', parsed.warnings.length === 0, parsed.warnings.join(' '));
    check('production tips', parsed.productionTips.length === 5, String(parsed.productionTips.length));
    check('music prompt', /orchestral/i.test(parsed.musicPrompt));
    check('music cues', parsed.musicCues.length === 4 && parsed.musicCues[3].start === 112 && parsed.musicCues[3].end === 120, JSON.stringify(parsed.musicCues.map((cue) => [cue.start, cue.end])));
    const spoken = spokenLinesFromStructured(parsed);
    check('15 spoken lines', spoken.length === 15, String(spoken.length));
    check('spoken text has no production direction', spoken.every((line) => !/Cinematic|Shot:|Camera:|Audio:|Pip says/i.test(line)));
    check('first spoken line', spoken[0] === 'Whoa… where am I? Everything is so fluffy!', spoken[0]);
    const outline = structuredOutline(parsed);
    check('outline is prompt-free and small', JSON.stringify(outline).length < 12000 && !JSON.stringify(outline).includes('Pixar'), String(JSON.stringify(outline).length));
  }

  const variants: Array<[string, string]> = [
    ['markdown headings + bold', PIP_REFERENCE_SCRIPT.replace(/^Act /gm, '## Act ').replace(/^Scene (\d+) · ([^\n]+)$/gm, '**Scene $1 · $2**')],
    ['hyphen ranges + Ends on on its own line', PIP_REFERENCE_SCRIPT.replace(/–/g, '-').replace(/ Ends on: /g, '\nEnds on: ')],
    ['title before timecode', PIP_REFERENCE_SCRIPT.replace(/^Scene (\d+) · ([\d:]+–[\d:]+) · (.+)$/gm, 'Scene $1: $3 ($2)')],
    ['CRLF line endings', PIP_REFERENCE_SCRIPT.replace(/\n/g, '\r\n')],
  ];
  for (const [name, text] of variants) {
    const result = parseStructuredScript(text);
    check(`tolerant: ${name}`, Boolean(result && result.scenes.length === 15 && result.acts.length === 3 && spokenLinesFromStructured(result).length === 15 && result.scenes.every((scene) => scene.endsOn)), result ? `${result.acts.length} acts / ${result.scenes.length} scenes / ${result.scenes[0].title}` : 'null');
  }

  const fallbacks: Array<[string, unknown]> = [
    ['plain spoken script', 'Most golf apps lose players in week one. Here are three retention loops that fix it.'],
    ['empty', ''],
    ['null', null],
    ['one scene only', 'Scene 1 · 0:00–0:08 · Alone\nPip says: "Hi."'],
    ['scene without timecodes', 'Scene 1 · Born in a cloud\nScene 2 · Falling\nPip says: "Hi."'],
    ['reversed range', 'Scene 1 · 0:08–0:00 · Bad\nScene 2 · 0:20–0:10 · Worse'],
    ['garbage', '{{{ ]]] Scene ::: 99:99–xx \u0000 \uFFFF'.repeat(200)],
  ];
  for (const [name, input] of fallbacks) {
    let threw = false;
    let result: unknown = undefined;
    try { result = parseStructuredScript(input as string); } catch { threw = true; }
    check(`falls back: ${name}`, !threw && result === null);
  }

  return { passed: checks.every((entry) => entry.ok), checks };
}
