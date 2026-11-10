/**
 * ScriptStudio — VidVerge's scene-by-scene script editor.
 *
 * This is the dedicated "Script" step that sits BETWEEN the brief (handled in
 * chat) and video generation. Reel drafts a script in the conversation; the
 * user reviews and edits it here scene by scene — each scene has a number, a
 * visual description, and the voiceover/dialogue the character speaks on camera
 * — then confirms. "Generate Video" only unlocks after the confirm toggle, and
 * fires the render directly (the existing in-chat progress card takes over).
 *
 * If a character is selected it is folded into every scene for consistency; if
 * a mockup is selected the user can pin it to one scene as the phone screen the
 * character holds. A screenshot the visitor attached in chat can likewise be
 * pinned to one scene as its visual reference frame — the AI interprets it, it
 * is never reconstructed as UI.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Film,
  Plus,
  Trash2,
  Users,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
} from 'lucide-react';
import {
  Character,
  Mockup,
  SceneReference,
  ScriptScene,
  getSceneReference,
  getSelectedCharacterId,
  getSelectedMockupId,
  listRows,
  openCharacters,
  openMockups,
  STUDIO_EVENTS,
  submitVideo,
} from '../lib/reelioStudio';
import VergeLoader from './VergeLoader';

const FONT = "'Inter', 'Geist', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

interface EditScene extends ScriptScene {
  key: string;
  withMockup?: boolean;
  withReference?: boolean;
}

let keySeq = 0;
const mkScene = (s?: Partial<ScriptScene>): EditScene => ({
  key: `sc_${Date.now()}_${keySeq++}`,
  scene_description: s?.scene_description || '',
  dialogue: s?.dialogue || '',
});

export function ScriptStudio({
  initialScenes,
  onClose,
  onSubmitted,
}: {
  initialScenes?: ScriptScene[];
  onClose?: () => void;
  onSubmitted?: (jobId?: string) => void;
}) {
  const [scenes, setScenes] = useState<EditScene[]>(() =>
    initialScenes && initialScenes.length
      ? initialScenes.map((s) => mkScene(s))
      : [mkScene(), mkScene()],
  );
  const [title, setTitle] = useState('');
  const [tone, setTone] = useState('cinematic');
  const [aspect, setAspect] = useState<'16:9' | '9:16'>('16:9');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [character, setCharacter] = useState<Character | null>(null);
  const [mockup, setMockup] = useState<Mockup | null>(null);
  const [sceneRef, setSceneRef] = useState<SceneReference | null>(null);

  const loadSelections = async () => {
    setSceneRef(getSceneReference());
    const charId = getSelectedCharacterId();
    const mockId = getSelectedMockupId();
    if (charId) {
      const chars = await listRows<Character>('characters');
      setCharacter(chars.find((c) => c.id === charId) || null);
    } else setCharacter(null);
    if (mockId) {
      const mocks = await listRows<Mockup>('mockups');
      setMockup(mocks.find((m) => m.id === mockId) || null);
    } else setMockup(null);
  };

  useEffect(() => {
    void loadSelections();
    const onSel = () => void loadSelections();
    window.addEventListener(STUDIO_EVENTS.selectionChanged, onSel);
    return () => window.removeEventListener(STUDIO_EVENTS.selectionChanged, onSel);
  }, []);

  // Editing the script invalidates a previous confirmation.
  const touch = () => setConfirmed(false);

  const updateScene = (key: string, patch: Partial<EditScene>) => {
    setScenes((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    touch();
  };
  const addScene = () => {
    if (scenes.length >= 6) return;
    setScenes((prev) => [...prev, mkScene()]);
    touch();
  };
  const removeScene = (key: string) => {
    setScenes((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
    touch();
  };
  const moveScene = (idx: number, dir: -1 | 1) => {
    setScenes((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    touch();
  };

  const hasContent = useMemo(
    () => scenes.some((s) => s.scene_description.trim().length > 0),
    [scenes],
  );

  const handleGenerate = async () => {
    setError(null);
    if (!confirmed) return;
    if (!hasContent) {
      setError('Add at least one scene with a visual description.');
      return;
    }
    setSubmitting(true);

    // Weave the character + mockup into the scene text at submit time.
    const charLine = character?.description
      ? ` The on-camera character is ${character.name}: ${character.description}`
      : character
        ? ` The on-camera character is ${character.name}.`
        : '';
    const kept = scenes.filter((s) => s.scene_description.trim().length > 0);
    const finalScenes: ScriptScene[] = kept.map((s) => {
      let desc = s.scene_description.trim();
      if (charLine) desc += charLine;
      if (s.withMockup && mockup) {
        desc +=
          ` The character is holding a smartphone; its screen clearly shows the "${mockup.name}"` +
          ` app${mockup.screen ? ` ${mockup.screen}` : ''} interface.`;
      }
      return { scene_description: desc, dialogue: s.dialogue.trim() };
    });
    // The reference frame belongs to a single scene (1-based for the hook).
    const refIdx = sceneRef ? kept.findIndex((s) => s.withReference) : -1;

    const res = await submitVideo({
      scenes: finalScenes,
      characterDescription: character?.description || (character ? character.name : undefined),
      characterImageUrl: character?.image_url || undefined,
      mockupImageUrl: scenes.some((s) => s.withMockup) ? mockup?.image_url || undefined : undefined,
      referenceImageUrl: refIdx >= 0 ? sceneRef?.url : undefined,
      referenceImageScene: refIdx >= 0 ? refIdx + 1 : undefined,
      tone,
      aspectRatio: aspect,
      title: title.trim() || undefined,
    });

    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Could not start the render.');
      return;
    }
    setDone(true);
    onSubmitted?.(res.jobId);
    window.dispatchEvent(new CustomEvent('openAgentChat'));
    // Give the user a beat to see the confirmation, then close.
    window.setTimeout(() => onClose?.(), 1400);
  };

  if (done) {
    return (
      <div style={{ fontFamily: FONT, color: 'var(--vg-text)', padding: 32, textAlign: 'center' }}>
        <CheckCircle2 size={40} color="var(--vg-success)" style={{ margin: '0 auto 14px' }} />
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Rolling camera 🎬</h3>
        <p style={{ margin: '8px auto 0', maxWidth: 360, fontSize: 13.5, color: 'var(--vg-muted)', lineHeight: 1.5 }}>
          Your video is generating. Track it in the chat — the progress card will hand you the
          finished MP4 in a few minutes, and it'll be waiting in My Videos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, color: 'var(--vg-text)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .ss-btn { transition: transform .16s ease, filter .16s ease; }
        .ss-btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
      `}</style>

      {/* Selections row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="ss-btn" onClick={openCharacters} style={chipStyle(!!character, 'var(--vg-accent)')}>
          <Users size={13} />
          {character ? `Character: ${character.name}` : 'Pick a character'}
        </button>
        <button type="button" className="ss-btn" onClick={openMockups} style={chipStyle(!!mockup, 'var(--vg-accent)')}>
          <Smartphone size={13} />
          {mockup ? `Mockup: ${mockup.name}` : 'Pick a mockup'}
        </button>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Video title (optional)"
          style={{ ...inputStyle, flex: '1 1 200px' }}
        />
        <input
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="Tone (e.g. upbeat, cinematic)"
          style={{ ...inputStyle, flex: '1 1 160px' }}
        />
        <div style={{ display: 'inline-flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--vg-border)' }}>
          {(['16:9', '9:16'] as const).map((a) => {
            const on = aspect === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setAspect(a)}
                style={{
                  padding: '9px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  color: on ? 'var(--vg-text)' : 'var(--vg-muted)',
                  background: on ? 'var(--vg-gold-tint)' : 'transparent',
                  boxShadow: on ? 'inset 0 0 0 1px var(--vg-accent)' : 'none',
                }}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scenes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {scenes.map((s, idx) => (
          <div
            key={s.key}
            style={{
              borderRadius: 14,
              border: '1px solid var(--vg-border)',
              background: 'var(--vg-surface)',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--vg-on-accent)',
                    background: 'var(--vg-accent)',
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--vg-accent)' }}>Scene {idx + 1}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" onClick={() => moveScene(idx, -1)} disabled={idx === 0} style={iconBtn(idx === 0)} title="Move up">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => moveScene(idx, 1)} disabled={idx === scenes.length - 1} style={iconBtn(idx === scenes.length - 1)} title="Move down">
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => removeScene(s.key)} disabled={scenes.length <= 1} style={iconBtn(scenes.length <= 1)} title="Remove scene">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <label style={labelStyle}>Visual description</label>
            <textarea
              value={s.scene_description}
              onChange={(e) => updateScene(s.key, { scene_description: e.target.value })}
              placeholder="What we see: setting, action, camera, mood…"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, marginBottom: 10 }}
            />

            <label style={labelStyle}>Voiceover / dialogue (spoken on camera)</label>
            <input
              value={s.dialogue}
              onChange={(e) => updateScene(s.key, { dialogue: e.target.value })}
              placeholder="A short, punchy line the character says…"
              style={inputStyle}
            />

            {mockup && (
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  fontSize: 12,
                  color: 'var(--vg-accent)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!s.withMockup}
                  onChange={(e) => updateScene(s.key, { withMockup: e.target.checked })}
                  style={{ accentColor: 'var(--vg-accent)' }}
                />
                Show the “{mockup.name}” mockup on the phone in this scene
              </label>
            )}

            {sceneRef && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  fontSize: 12,
                  color: 'var(--vg-accent)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!s.withReference}
                  onChange={(e) =>
                    setScenes((prev) =>
                      prev.map((p) =>
                        p.key === s.key
                          ? { ...p, withReference: e.target.checked }
                          : { ...p, withReference: false },
                      ),
                    )
                  }
                  style={{ accentColor: 'var(--vg-accent)' }}
                />
                <ImageIcon size={13} />
                Use my uploaded screenshot as this scene’s visual reference
              </label>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addScene}
          disabled={scenes.length >= 6}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            color: scenes.length >= 6 ? 'var(--vg-muted)' : 'var(--vg-accent)',
            border: '1px dashed var(--line-gold)',
            background: 'transparent',
            cursor: scenes.length >= 6 ? 'not-allowed' : 'pointer',
          }}
        >
          <Plus size={15} /> Add scene {scenes.length >= 6 ? '(max 6)' : ''}
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--vg-danger)', fontSize: 12.5 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Confirm + generate */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          borderTop: '1px solid var(--vg-border)',
          paddingTop: 14,
        }}
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--vg-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ accentColor: 'var(--vg-accent)', width: 16, height: 16 }}
          />
          This script looks good — I'm ready to generate
        </label>

        <button
          type="button"
          className="ss-btn"
          onClick={() => void handleGenerate()}
          disabled={!confirmed || submitting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 22px',
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--vg-on-btn)',
            border: 'none',
            cursor: !confirmed || submitting ? 'not-allowed' : 'pointer',
            opacity: !confirmed || submitting ? 0.5 : 1,
            background: 'var(--vg-btn)',
            boxShadow: 'none',
          }}
          data-testid="button-generate-video"
        >
          {submitting ? <VergeLoader size={34} label="Starting your render" /> : <Film size={16} />}
          {submitting ? 'Starting…' : 'Generate Video'}
        </button>
      </div>
    </div>
  );
}

function chipStyle(active: boolean, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    color: active ? 'var(--vg-text)' : 'var(--vg-secondary)',
    border: `1px solid ${active ? color : 'var(--vg-border)'}`,
    background: active ? `color-mix(in srgb, ${color} 15%, transparent)` : 'transparent',
  };
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: 6,
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid var(--vg-border)',
    background: 'transparent',
    color: disabled ? 'var(--vg-muted)' : 'var(--vg-secondary)',
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--vg-border)',
  background: 'var(--vg-bg)',
  color: 'var(--vg-text)',
  fontSize: 13.5,
  outline: 'none',
  fontFamily: FONT,
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--vg-muted)',
  marginBottom: 5,
};

export default ScriptStudio;
