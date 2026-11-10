/**
 * SceneForge agent skills — reusable instruction packs for the Remotion agent.
 *
 * A skill is loaded into the Remotion agent's system prompt only for the
 * requests it is built for (see `resolveAgentSkills`). The agent itself runs in
 * the `sceneforge-pipeline` server function, which cannot import workspace
 * files, so it carries a byte-identical copy of `text` with the same `version`
 * and `textSha256`. Change both together and bump `version`.
 */

export interface AgentSkill {
  id: string;
  title: string;
  version: number;
  /** sha256 (hex) of `text`, used to confirm the server copy matches. */
  textSha256: string;
  /** One line for the UI. */
  summary: string;
  text: string;
}

export const MOTION_GRAPHICS_EDIT_SKILL_ID = 'remotion-motion-graphics-edit';

export const REMOTION_MOTION_GRAPHICS_EDIT_SKILL: AgentSkill = {
  id: MOTION_GRAPHICS_EDIT_SKILL_ID,
  title: 'Remotion motion-graphics edit',
  version: 2,
  textSha256: '3c43524df9957653e39cf1d16c38fc0a25f4127b2b384229a78910487c42ba1b',
  summary: 'Kinetic, word-timed edit designed for your script: a fresh concept every video, every spoken idea gets a visual, strict accuracy and brand rules.',
  text: `# Remotion motion-graphics edit
Goal: every video should feel designed for its own script, not filled into a template. Be bold with ideas and strict with accuracy. Accuracy beats decoration: a wrong icon or an early number is worse than no graphic. Only the hard rules in Part A are fixed. Part B is how to be original each time. Part C holds craft defaults you may change when the concept needs it. Part D is the QA that must run before delivery.

## Part A. Hard rules (never break)
1. Brand fields come only from the brand input (logo, colours, fonts, website, CTA). If one is missing, ask before planning. Never use a default or another project's value.
2. Captions show the script's spelling. ASR is only for timing.
3. Everything is anchored to word indices from words.json, never free seconds.
4. No number, counter, result or stamp appears before it is spoken.
5. No invented facts. On-screen text comes from the script or brand fields. Invented or illustrative cases carry a visible 'Example case' label for the whole case.
6. Icon meaning matches the sentence: good/true/done = check green; bad/missing/failed = cross red; risk = warning. Do not tick a negative statement just because it sits in a list. 'VS' only for real opposites; parts of a whole (21 days + 9 days) are shown with a total (= 30 days).
7. Never present stock or AI people as the brand's team, staff or customers. No readable text, numbers, logos or UI inside generated media; add all text in Remotion.
8. No broken text: nothing clipped, truncated, overflowing or garbled; no missing spaces in captions; no caption chunk crossing a sentence end.
9. Readable on a phone: body or labels at least 30 px and card headlines at least 56 px on the 1080 px short side.
10. Narration timing untouched (no stretch, no offset; within 1 ms of the source when copied). Final mix about -14 to -15 LUFS, true peak at or below -1 dBTP.
11. Each format is its own composition. Never crop one render into another.
12. Run the QA in Part D and report measured values before saying it is done.

## Part B. Creative direction (do this fresh for every video)
B1. Find the concept before any layout. Read the script and find the hook, central question, every number or fact, each list or step, story turns and the CTA. Then write THREE different concepts, each with: Big idea (one visual metaphor or world for the whole video, e.g. the credit report as a case file being investigated; loan capacity as a glass filling up; a lender's desk seen from above; a phone screen where the story happens; a scoreboard; a courtroom verdict); Hook (what the first 3 seconds show and why someone stops scrolling); Hero moment (the single biggest animated reveal, on the most important line); Look (how the brand palette is used: dark and glowing, paper and ink, UI-like, bold typographic). Score each concept for clarity, surprise and fit with the script. Pick one and write two lines on why. Save this so the next video can avoid repeating it.
B2. Variety rules (anti-template): Do not reuse the previous video's concept, hook type or main layout pattern unless the script clearly needs it. Keep a short log of the last three videos' choices (store as a small per-project record, new file or new field only). No more than two beats in a row with the same layout or component type. Mix scales: full-screen typography, mid cards, small details, data visuals, UI mockups, and the avatar. Vary rhythm: some fast beats (0.6-1.5 s), some held beats (3-5 s). One hero moment about every 30 seconds. Build a new component when no existing one shows the idea well; a custom component must pass Part D. The brand system (logo, colours, fonts) stays fixed; layouts, metaphors, motion style and transitions are free.
B3. Hook menu (starting points, not a list to cycle): number reveal, two-sided comparison, document or report reveal, myth with a stamp, sharp question in giant type, countdown, phone notification or chat, cinematic B-roll cold open, a single object (file, stamp, calculator) the whole video returns to. Invent new ones when they fit better. Whatever the hook, never open on a static avatar or static text card: something moves within 0.5 s, and the hook builds in at least 3 beats in the first 5 s.
B4. Turning lines into visuals. For each spoken idea ask what the viewer should SEE: comparison = split, before/after wipe, two bars, two columns; process = path, stepper, conveyor, timeline; number = counter, bar, calendar, scale, gauge; rule = stamp, seal, signboard, checklist that fills; warning = colour shift, alarm treatment, crack, red signal; takeaway = typography-only moment with the avatar hidden. Every line gets a visual; gaps like 'Aur time?' get a big-word beat. Cards show the idea, never the same sentence the captions already show. Never run word-by-word kinetic text of the full line alongside captions.

## Part C. Craft defaults (change when the concept needs)
C1 Inputs: source video and exact script; brand (logo file, colours, fonts, website and CTA exactly as given); output formats 9:16 and/or 16:9; any music or SFX.
C2 Word timings: get word timestamps from ASR or forced alignment (Deepgram timings if provided). Align script words to ASR words in order (consonant-skeleton or transliteration match; allow 1-to-many merges for acronyms and numbers). Output words.json: [{i, w, d, s, e}] (raw token, display text, start, end in seconds). Check: every word has a time, times increase, each word lasts 60 ms-2 s. Spot-check 10 words against the audio.
C3 Story structure. Modes: graphic (cold open, recap, big statements, CTA; full screen, no avatar); avatar (story turns, emotional lines; avatar plate plus a card); pip (explanations, calculations, comparisons, lists; full graphic plus avatar in corner circle); broll (only when a clip clearly shows the current line). Avatar reveal on the central question or first story turn (often 8-12 s into a 90 s video). Avatar full-frame about 30-50% of runtime. Main visual changes every 2-5 s; no card unchanged for more than about 5 s without reason; if a line runs long add a second reveal inside the card. Hard cuts between video layers; crossfading two video layers leaves ghosts.
C4 Timing: beats enter 0.05-0.10 s before their anchor word starts and exit about 0.15 s before the next beat. List items reveal on their own spoken word. Counters start on the spoken number and finish in 0.5-0.8 s. Numbering continuous (01, 02, 03); completed steps show a filled tick. Colour tones: red problem, green fix, gold/accent key terms; captions use the same tones.
C5 Captions: at most 3 words or 17 characters per chunk. Break at . , : ? and at any pause over 0.38 s. Never carry the last word of one sentence into the next chunk. A chunk shows whole; it ends at next chunk start minus 0.03 s, or last word end plus 0.55 s. Render each word as its own element with a real gap (columnGap) so highlighting never removes spaces. Active word: tone-coloured pill with slight pop (scale about 1.06, -2 deg); other words white or tone-coloured with heavy shadow. About 72 px heavy uppercase in 9:16, about 64 px in 16:9. Hide during big typography beats and the CTA end card. Caption style may change per concept as long as Part A holds.
C6 Layout starting points. 9:16 (1080x1920): 9 px progress bar at y 0, chapter chip left 44 / top 62, logo top-right about 176 px wide, one logo per frame except dedicated brand beats. Avatar mode: head and shoulders about y 0-860 fading to background by about y 1270; cards about y 905-1395. Pip mode: circle about (904, 284) radius 120, head AND shoulders (crop about 900 px wide, not face-only); headline top-left y 190, max width 730; content y 400-1400. Captions near y 1450; keep y 1650-1920 clear for platform UI. 16:9 (1920x1080): cards on the side opposite the face (face cx < 0.5 -> cards x 1040-1840, otherwise x 80-880), y 180-820; captions near y 880; multiply component sizes by about 0.85. Hero numbers 120-190 px. No panel more than about 40% empty for more than 2 s. Avatar not over-zoomed. Zoom punches subtle (3-7%, spring in, ease out about 1.6 s), at most about 8 per minute. Shake rare, at most 1-2 per video, only on a negative shock.
C7 Motion: pick one motion personality per video (snappy springs, smooth editorial eases, hand-drawn, UI-precise) and keep it consistent within that video. Pop: spring damping 9-13, stiffness 240-300. Card enter: translateY 50-90 to 0 plus fade; exit about 0.16-0.22 s. Stamp slam: scale 1.5 to 1, rotate -4 to -6 deg, tone flash. Strike-through drawn over about 0.3 s; width scales from 0 (calc((100% + pad) * progress)). Bars and timelines fill with the spoken words. Zoom-through transitions, light sweeps, slow background glow tinted by section tone with light vignette.
C8 Text safety: whiteSpace nowrap on short labels and pills; size text to fit, never rely on overflow hidden; padding for descenders during reveal masks; inline SVG icons or fully loaded icon fonts (no tofu glyphs); bundle fonts locally and wait on document.fonts.load with delayRender before the first frame.
C9 Audio: raise quiet avatar voices to the Part A loudness with a gentle limiter, not heavy compression. Music about 15-18 dB under the voice with sidechain ducking (attack about 25-30 ms, release about 450-500 ms), breathing in pauses, fading at the end. SFX only on meaningful events, about 14 dB under the voice.
C10 Render: graphics as a transparent layer over the video plate (OffthreadVideo or separate compositor). Pre-scale the plate to output size. No CSS filters, masks or backdrop blur on video layers. Frame count equals source duration x fps. Join sections with concat and -c copy, then mux audio. Write to a temp name and rename only on success.

## Part D. QA (look, then measure)
D1 Look at it like an editor: (1) contact sheet: one frame per second, timestamp stamped on each, tiled into grids (e.g. 4x5), reviewed in every format; (2) beat stills at the midpoint of every beat and right after every reveal; (3) zoom in on doubtful frames or crop (caption band, card text); (4) sync spot-check: for 6-10 words, crop the caption band just before and after the word starts and confirm the highlight lands on time. Example: ffmpeg -i out.mp4 -vf "fps=1,scale=480:-1" frames/s%03d.jpg then tile with OpenCV (putText timestamp per frame, hstack 4 per row, vstack rows, 20 frames per sheet).
D2 Measure (never just claim): frame count and duration via ffprobe against source; loudness and true peak via ffmpeg -af ebur128=peak=true; narration offset via cross-correlation with the source narration (within 1 ms when copied, never more than 1 frame); text overflow in the browser (scrollWidth > clientWidth or scrollHeight > clientHeight fails); brand strings: every URL and brand name in props equals the brand input string by string.
D3 Fail and fix if: wrong brand field anywhere; clipped/truncated/overflowing/garbled text; missing spaces around highlighted caption words or chunk crossing a sentence end; icon contradicting its sentence or VS used for parts of a whole; number or result shown before spoken; cards repeating caption lines or orphan floating words; two logos in one frame outside brand beats; numbering gaps or wrong step states; ghosted crossfades between video layers; card unchanged more than about 5 s without reason or an empty panel; text under the readability floor; invented case without 'Example case' label or stock people labelled as brand team; loudness, true peak or narration offset out of range; duration or frame count differs from source or requested format missing; the edit looks like the previous video's template. Re-render only the affected sections, then re-check those frames.

## Deliver
Report: the chosen concept and why, duration, formats, measured LUFS and true peak, frame count, any on-screen text not in the voice-over (so the brand can confirm it), and anything left out (e.g. no B-roll or music).`,
};

export const SCENEFORGE_AGENT_SKILLS: Record<string, AgentSkill> = {
  [MOTION_GRAPHICS_EDIT_SKILL_ID]: REMOTION_MOTION_GRAPHICS_EDIT_SKILL,
};

export function getAgentSkill(id: string | null | undefined): AgentSkill | null {
  return (id && SCENEFORGE_AGENT_SKILLS[id]) || null;
}

/** Same pattern as the server; a mention preceded by "no", "without", "avoid"… does not count. */
export const MOTION_GRAPHICS_REQUEST_PATTERN = /\b(?:motion[\s-]*graphics?|mo[\s-]?graphs?|kinetic[\s-]+(?:edit|editing|typography|text|motion[\s-]*graphics?))\b/gi;
const NEGATED_BEFORE = /\b(?:no|not|without|avoid|skip|remove|less|fewer|don'?t|do\s+not|never)\b[^.!?\n]{0,24}$/i;

export function isMotionGraphicsEditRequest(text: string | null | undefined): boolean {
  const value = String(text || '');
  MOTION_GRAPHICS_REQUEST_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MOTION_GRAPHICS_REQUEST_PATTERN.exec(value))) {
    if (!NEGATED_BEFORE.test(value.slice(Math.max(0, match.index - 40), match.index))) return true;
  }
  return false;
}

export type AgentSkillTrigger = 'choice' | 'instructions' | 'reedit';

/**
 * Which skills the Remotion agent loads. `agentSkills` set on the project (even
 * an empty list) is the user's explicit choice; otherwise the instructions
 * decide. A re-edit that asks for motion graphics always loads the skill.
 */
export function resolveAgentSkills(
  choices: { agentSkills?: string[]; userInstructions?: string } | null | undefined,
  reeditInstruction?: string | null,
): Array<{ skill: AgentSkill; trigger: AgentSkillTrigger }> {
  const explicit = Array.isArray(choices?.agentSkills) ? choices!.agentSkills!.map(String) : null;
  const skill = REMOTION_MOTION_GRAPHICS_EDIT_SKILL;
  if (explicit && explicit.indexOf(skill.id) >= 0) return [{ skill, trigger: 'choice' }];
  if (!explicit && isMotionGraphicsEditRequest(choices?.userInstructions)) return [{ skill, trigger: 'instructions' }];
  if (isMotionGraphicsEditRequest(reeditInstruction)) return [{ skill, trigger: 'reedit' }];
  return [];
}
