/**
 * SceneForge step 3 — AUTO EDIT SETTINGS.
 * There are no styles to pick: the Remotion agent designs the look of every
 * video from its script and the brand details the user confirms on the Brand step. Everything here is optional
 * guidance chosen once before generation; nothing is approved later.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Gauge, Monitor, Smartphone, Sparkles, Zap } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import CreditQuote from '../../../components/CreditQuote';
import { getAutoBudget } from '../lib/forgeClient';
import type { ForgeAutoBudget, ForgeChoices, ForgeCutaways, ForgeOutputFormat } from '../lib/forgeTypes';
import { MOTION_GRAPHICS_EDIT_SKILL_ID, REMOTION_MOTION_GRAPHICS_EDIT_SKILL, resolveAgentSkills } from '../lib/skills/remotionMotionGraphicsEdit';
import { CAPTION_LANGUAGE_NOTES, HELPER_TEXT, OptionThumb, previewFor } from './optionPreviews';

// Provider PAYG rates in USD. Keep these editable and separate from Vidverge credits.
const PROVIDER_RATES = {
  heygenPerMinute: { digitalTwinIII: 0.60, studioPhotoIII: 0.99, avatarIV: 4.83, avatarIVPhoto: 2.31, avatarV: 7.20 },
  avatarCreation: { digitalTwin: 2.13, photo: 1.32 },
  elevenLabsPer1000Chars: 0.08,
  estimatedCharsPerMinute: 900,
} as const;

const AVATAR_RATE_OPTIONS = [
  { id: 'digitalTwinIII', label: 'Avatar III · Digital Twin (current standard render)', rate: PROVIDER_RATES.heygenPerMinute.digitalTwinIII },
  { id: 'studioPhotoIII', label: 'Avatar III · Studio / Photo', rate: PROVIDER_RATES.heygenPerMinute.studioPhotoIII },
  { id: 'avatarIV', label: 'Avatar IV · Digital Twin', rate: PROVIDER_RATES.heygenPerMinute.avatarIV },
  { id: 'avatarIVPhoto', label: 'Avatar IV · Photo', rate: PROVIDER_RATES.heygenPerMinute.avatarIVPhoto },
  { id: 'avatarV', label: 'Avatar V', rate: PROVIDER_RATES.heygenPerMinute.avatarV },
] as const;

const FORMATS: Array<{ id: ForgeOutputFormat; name: string; blurb: string }> = [
  { id: '16:9', name: '16:9 landscape', blurb: 'YouTube, websites, decks' },
  { id: '9:16', name: '9:16 vertical', blurb: 'Reels, Shorts, TikTok' },
];

const CUTAWAYS: Array<{ id: ForgeCutaways; name: string; blurb: string }> = [
  { id: 'auto', name: 'Auto', blurb: 'The agent decides — generous, script-synced' },
  { id: 'light', name: 'Light', blurb: 'About half as many cutaways' },
  { id: 'rich', name: 'Rich', blurb: 'More b-roll and images' },
  { id: 'none', name: 'None', blurb: 'Avatar + motion graphics only' },
];

function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value));
}

/** Small pre-start hint: the Remotion agent's token reservation against the 500k rolling window. */
export function AutoBudgetHint({ script, seconds }: { script: string; seconds: number }) {
  const [budget, setBudget] = useState<ForgeAutoBudget | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!script.trim()) { setBudget(null); return undefined; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void getAutoBudget(script, seconds).then((value) => { if (!cancelled) { setBudget(value); setLoading(false); } });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [script, seconds]);

  const low = budget ? budget.remainingEstimate < budget.plannerReserved * 1.5 : false;
  return (
    <div style={{ alignItems: 'flex-start', background: low ? COLORS.warningBg : COLORS.raised, border: `1px solid ${low ? COLORS.warning : COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, display: 'flex', fontSize: 12.5, gap: 9, lineHeight: '18px', padding: '10px 12px' }} data-testid="sceneforge-ai-budget-hint">
      <Gauge size={15} color={low ? COLORS.warning : COLORS.accent} style={{ flex: '0 0 auto', marginTop: 1 }} />
      {budget ? (
        <span>
          <strong style={{ color: COLORS.text }}>AI planning: ~{formatTokens(budget.plannerReserved)} tokens</strong> for one Remotion-agent call (~{formatTokens(budget.plannerInput)} input + {formatTokens(budget.plannerOutputCap)} output cap), plus ~{formatTokens(budget.voiceCueReserved)} for the voice-direction pass.
          {' '}SceneForge reserved ~{formatTokens(budget.recentReserved)} of the {formatTokens(budget.window)} rolling window in the last {budget.windowMinutes} min, so about {formatTokens(budget.remainingEstimate)} should remain.
          {low ? ' The window is nearly used — if it runs out, SceneForge uses its built-in edit plan instead of calling another model, and you can re-edit later.' : ''}
        </span>
      ) : (
        <span>{loading ? 'Estimating AI planning budget…' : 'The AI planning estimate appears once a script is written.'}</span>
      )}
    </div>
  );
}

export default function ForgeChoicesStep({
  choices,
  targetSeconds,
  estimatedSeconds,
  script,
  onChange,
  onTargetChange,
}: {
  choices: ForgeChoices;
  targetSeconds: number;
  estimatedSeconds: number;
  script: string;
  onChange: (next: ForgeChoices) => void;
  onTargetChange: (seconds: number) => void;
}) {
  const [estimateMinutes, setEstimateMinutes] = useState(60);
  const [avatarRateId, setAvatarRateId] = useState<(typeof AVATAR_RATE_OPTIONS)[number]['id']>('digitalTwinIII');
  const avatarRate = AVATAR_RATE_OPTIONS.find((option) => option.id === avatarRateId) || AVATAR_RATE_OPTIONS[0];
  const heygenUsd = estimateMinutes * avatarRate.rate;
  const estimatedChars = estimateMinutes * PROVIDER_RATES.estimatedCharsPerMinute;
  const elevenUsd = (estimatedChars / 1000) * PROVIDER_RATES.elevenLabsPer1000Chars;
  const configuredTotal = heygenUsd + elevenUsd;
  const format = choices.outputFormat || '16:9';
  const cutaways = choices.cutaways || 'auto';
  const skillTrigger = resolveAgentSkills(choices)[0]?.trigger || null;
  const motionGraphics = Boolean(skillTrigger);
  const setMotionGraphics = (on: boolean) => {
    const rest = (choices.agentSkills || []).filter((id) => id !== MOTION_GRAPHICS_EDIT_SKILL_ID);
    onChange({ ...choices, agentSkills: on ? [...rest, MOTION_GRAPHICS_EDIT_SKILL_ID] : rest });
  };

  const card = (selected: boolean): CSSProperties => ({
    background: selected ? 'var(--vg-gold-tint)' : COLORS.surface,
    border: `1px solid ${selected ? COLORS.accent : COLORS.border}`,
    borderRadius: RADIUS.card,
    cursor: 'pointer',
    padding: 14,
    textAlign: 'left' as const,
  });

  return (
    <div style={{ display: 'grid', gap: 26, maxWidth: 960 }}>
      <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.accent}`, borderRadius: RADIUS.card, display: 'grid', gap: 8, padding: 16 }} data-testid="sceneforge-auto-editor-intro">
        <div style={{ alignItems: 'center', display: 'flex', gap: 9 }}>
          <Sparkles size={17} color={COLORS.accent} />
          <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 700, margin: 0 }}>Fully automatic edit</h3>
        </div>
        <p style={{ color: COLORS.secondary, fontSize: 13, lineHeight: '20px', margin: 0 }}>
          After the avatar renders, the Remotion agent (Claude Opus 5.5) designs the look from your script and the brand details you confirm on the next step (it never guesses your logo, name or colours), plans the hook, motion graphics, cutaways and CTA,
          asks the Director for any images, b-roll, music and sound effects it needs, renders, checks sampled frames and fixes obvious problems — then delivers one finished MP4. No styles to pick and nothing to approve.
        </p>
      </section>

      <section style={{ display: 'grid', gap: 8 }} data-testid="sceneforge-user-instructions">
        <label htmlFor="sceneforge-creative-instructions" style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600 }}>What do you want?</label>
        <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: 0 }}>Optional, and top priority for the editor: a specific opening, pacing, visual motif, CTA, or anything to avoid.</p>
        <textarea
          id="sceneforge-creative-instructions"
          value={choices.userInstructions || ''}
          onChange={(event) => onChange({ ...choices, userInstructions: event.target.value.slice(0, 4000) })}
          placeholder="Example: Open on the result, show b-roll of the product in the middle, and end with a bold free-trial CTA."
          rows={4}
          style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, fontFamily: FONT.body, fontSize: 14, lineHeight: '21px', minHeight: 100, padding: 12, resize: 'vertical', width: '100%' }}
          data-testid="input-creative-instructions"
        />
        <span style={{ color: COLORS.muted, fontSize: 11.5, textAlign: 'right' }}>{(choices.userInstructions || '').length.toLocaleString()} / 4,000</span>
      </section>

      <section data-testid="sceneforge-edit-type">
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: '0 0 5px' }}>Edit type</h3>
        <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: '0 0 12px' }}>{HELPER_TEXT.editType}</p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          <button type="button" onClick={() => setMotionGraphics(false)} aria-pressed={!motionGraphics} style={card(!motionGraphics)} data-testid="button-edit-type-standard">
            <OptionThumb src={previewFor('edit-type', 'standard')} style={{ marginBottom: 10 }} />
            <span style={{ color: !motionGraphics ? COLORS.accent : COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 700 }}>Standard auto edit</span>
            <span style={{ color: COLORS.secondary, display: 'block', fontSize: 12.5, marginTop: 4 }}>The agent balances avatar, graphics and cutaways for your script.</span>
          </button>
          <button type="button" onClick={() => setMotionGraphics(true)} aria-pressed={motionGraphics} style={card(motionGraphics)} data-testid="button-edit-type-motion-graphics">
            <OptionThumb src={previewFor('edit-type', MOTION_GRAPHICS_EDIT_SKILL_ID)} style={{ marginBottom: 10 }} />
            <span style={{ alignItems: 'center', color: motionGraphics ? COLORS.accent : COLORS.text, display: 'flex', fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 700, gap: 8 }}><Zap size={16} /> Motion-graphics edit</span>
            <span style={{ color: COLORS.secondary, display: 'block', fontSize: 12.5, marginTop: 4 }}>{REMOTION_MOTION_GRAPHICS_EDIT_SKILL.summary}</span>
          </button>
        </div>
        {motionGraphics ? (
          <p style={{ color: COLORS.muted, fontSize: 12, lineHeight: '18px', margin: '8px 0 0' }} data-testid="sceneforge-edit-type-note">
            {skillTrigger === 'instructions' ? 'On because your instructions ask for motion graphics — choose Standard to turn it off. ' : ''}
            Fixed rules: numbers appear only once spoken, nothing is invented, and brand details come only from your answers on the Brand step. Layout, pacing and motion adapt to your script, and the finished video lists any on-screen text to confirm, anything left out and any brand questions.
          </p>
        ) : null}
      </section>

      <section>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: '0 0 5px' }}>Output format</h3>
        <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: '0 0 12px' }}>{HELPER_TEXT.format}</p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {FORMATS.map((item) => (
            <button key={item.id} type="button" onClick={() => onChange({ ...choices, outputFormat: item.id })} style={card(format === item.id)} data-testid={`button-format-${item.id.replace(':', 'x')}`}>
              <OptionThumb src={previewFor('format', item.id)} ratio={item.id === '9:16' ? '9 / 16' : '16 / 9'} style={item.id === '9:16' ? { height: 110, margin: '0 auto 10px', maxWidth: '100%', width: 'auto' } : { marginBottom: 10 }} />
              <span style={{ alignItems: 'center', color: format === item.id ? COLORS.accent : COLORS.text, display: 'flex', fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 700, gap: 8 }}>
                {item.id === '16:9' ? <Monitor size={16} /> : <Smartphone size={16} />} {item.name}
              </span>
              <span style={{ color: COLORS.secondary, display: 'block', fontSize: 12.5, marginTop: 4 }}>{item.blurb}</span>
            </button>
          ))}
        </div>
        {format === '9:16' ? <p style={{ color: COLORS.muted, fontSize: 12, lineHeight: '18px', margin: '8px 0 0' }}>The vertical cut is laid out natively for 9:16 (not cropped). The render service works at 1920×1080, so the vertical master is upscaled from that canvas and looks slightly softer than 16:9.</p> : null}
      </section>

      <section>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: '0 0 5px' }}>Images & b-roll cutaways</h3>
        <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: '0 0 12px' }}>{HELPER_TEXT.cutaways}</p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {CUTAWAYS.map((item) => (
            <button key={item.id} type="button" onClick={() => onChange({ ...choices, cutaways: item.id })} style={card(cutaways === item.id)} data-testid={`button-cutaways-${item.id}`}>
              <OptionThumb src={previewFor('cutaways', item.id)} style={{ marginBottom: 10 }} />
              <span style={{ color: cutaways === item.id ? COLORS.accent : COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 700 }}>{item.name}</span>
              <span style={{ color: COLORS.secondary, display: 'block', fontSize: 12.5, marginTop: 4 }}>{item.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: '0 0 5px' }}>Caption language</h3>
        <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: '0 0 5px' }}>{HELPER_TEXT.captionLanguage}</p>
        <p style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: '18px', margin: '0 0 10px' }}>Captions are always on. Words come from your script, timing from the voice track, with phrase-based line breaks and emphasis words. Hinglish keeps Roman Hindi exactly as written and never translates code-mixed speech.</p>
        <div style={{ display: 'grid', gap: 9, gridTemplateColumns: 'repeat(3, minmax(130px, 1fr))' }}>
          {([
            { id: 'hinglish', name: 'Hinglish', sample: 'yeh video bahut mast hai' },
            { id: 'hindi', name: 'Hindi', sample: 'यह वीडियो बहुत अच्छा है' },
            { id: 'english', name: 'English', sample: 'this video is excellent' },
          ] as const).map((language) => {
            const selected = (choices.captionLanguage || 'hinglish') === language.id;
            return (
              <button key={language.id} type="button" onClick={() => onChange({ ...choices, captionLanguage: language.id })} style={card(selected)} data-testid={`button-caption-language-${language.id}`}>
                <span style={{ color: selected ? COLORS.accent : COLORS.text, display: 'block', fontFamily: FONT.heading, fontSize: 14.5, fontWeight: 700 }}>{language.name}</span>
                <span lang={language.id === 'hindi' ? 'hi' : undefined} style={{ color: COLORS.secondary, display: 'block', fontFamily: language.id === 'hindi' ? '"Noto Sans Devanagari", Hind, sans-serif' : FONT.body, fontSize: 12, lineHeight: '18px', marginTop: 5 }}>{language.sample}</span>
                <span style={{ color: COLORS.muted, display: 'block', fontSize: 11.5, lineHeight: '16px', marginTop: 4 }}>{CAPTION_LANGUAGE_NOTES[language.id]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, margin: '0 0 10px' }}>Target length</h3>
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <input
            type="range"
            min={30}
            max={570}
            step={15}
            value={targetSeconds}
            onChange={(e) => onTargetChange(Number(e.target.value))}
            style={{ accentColor: COLORS.accent, flex: 1, minWidth: 200 }}
            data-testid="input-target-length"
          />
          <span style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 15, fontWeight: 700, minWidth: 90 }}>
            {Math.floor(targetSeconds / 60)}:{String(targetSeconds % 60).padStart(2, '0')} min
          </span>
        </div>
        <p style={{ color: COLORS.muted, fontSize: 12.5, margin: '8px 0 0' }}>
          The real length follows your script; this guides the idea-to-script writer. One SceneForge render is capped at 570 seconds (9:30).
        </p>
      </section>

      <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 10, padding: 16 }}>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 15, fontWeight: 600, margin: 0 }}>Cost before you start</h3>
        <CreditQuote
          label="SceneForge presenter video"
          items={[
            { engine: 'heygen/avatar_iv', options: { seconds: estimatedSeconds, bundle: { transcriptionSeconds: estimatedSeconds, remotionRenders: 6 } } },
            { engine: 'elevenlabs/tts', options: { chars: String(script || '').length, model: 'eleven_v4' } },
          ]}
        />
        <p style={{ color: COLORS.accent, fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, margin: 0 }}>Charged once when generation starts (HeyGen avatar + narration + renders at real cost + 30%); re-edits are included and a failed render is refunded.</p>
        <AutoBudgetHint script={script} seconds={estimatedSeconds} />
        <details style={{ color: COLORS.secondary, fontSize: 12.5 }} data-testid="sceneforge-provider-estimator">
          <summary style={{ cursor: 'pointer', fontFamily: FONT.heading, fontWeight: 600 }}>Provider cost estimator · 1–60 minutes</summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(160px, 1fr) minmax(220px, 2fr)' }}>
              <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, gap: 5 }}>Minutes
                <input type="number" min={1} max={60} value={estimateMinutes} onChange={(event) => setEstimateMinutes(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, minHeight: 44, padding: '0 10px' }} />
              </label>
              <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, gap: 5 }}>HeyGen avatar rate
                <select value={avatarRateId} onChange={(event) => setAvatarRateId(event.target.value as typeof avatarRateId)} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, minHeight: 44, padding: '0 10px' }}>{AVATAR_RATE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} · ${option.rate.toFixed(2)}/min</option>)}</select>
              </label>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>HeyGen</span><strong style={{ color: COLORS.text }}>${heygenUsd.toFixed(2)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>ElevenLabs · ~{estimatedChars.toLocaleString()} chars at $0.08/1K</span><strong style={{ color: COLORS.text }}>${elevenUsd.toFixed(2)}</strong></div>
              <div style={{ borderTop: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 7 }}><strong>Configured subtotal</strong><strong style={{ color: COLORS.accent }}>~${configuredTotal.toFixed(2)}</strong></div>
            </div>
            <div style={{ color: COLORS.muted, fontSize: 12, lineHeight: '18px' }}>Avatar creation (separate one-time call): Digital Twin ${PROVIDER_RATES.avatarCreation.digitalTwin.toFixed(2)} · Photo Avatar ${PROVIDER_RATES.avatarCreation.photo.toFixed(2)}. Rate not configured: Veo B-roll, Gemini, Claude, Remotion, music.</div>
            {estimateMinutes * 60 > 570 ? <div style={{ background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.sm, color: COLORS.warning, fontSize: 12.5, lineHeight: '19px', padding: 10 }}>A {estimateMinutes}-minute video exceeds the 570-second single-render cap. Split it into multiple SceneForge projects before generation.</div> : null}
          </div>
        </details>
      </section>
    </div>
  );
}
