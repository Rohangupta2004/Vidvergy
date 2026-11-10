import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ImagePlus, Loader2, RotateCcw, Upload } from 'lucide-react';
import { COLORS, CSS_VARS, FONT, RADIUS } from '../../../components/theme';
import { uploadProjectLogo } from '../lib/forgeClient';
import { getStylePreset, type ColorRoles, type ProjectBrand } from '../lib/stylePresets';

const WORKSPACE_BRAND_FALLBACK = [CSS_VARS['--vg-accent'], CSS_VARS['--vg-accent-hover'], CSS_VARS['--vg-accent-pressed']];

const ROLE_LABELS: Array<{ key: keyof ColorRoles; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'text', label: 'Text' },
  { key: 'mutedText', label: 'Muted text' },
];

function hex(value: string, fallback = '#000000'): string {
  const cleaned = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(cleaned)) return cleaned.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(cleaned)) return `#${cleaned.slice(1).split('').map((c) => c + c).join('')}`.toUpperCase();
  return fallback;
}

function rgb(value: string): [number, number, number] {
  const color = hex(value);
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

function mix(a: string, b: string, amount: number): string {
  const aa = rgb(a); const bb = rgb(b);
  return `#${aa.map((channel, index) => Math.round(channel * (1 - amount) + bb[index] * amount).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function luminance(value: string): number {
  const values = rgb(value).map((channel) => {
    const n = channel / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const x = luminance(a); const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function readableText(background: string, preferred: string, palette: string[] = [preferred]): { color: string; adjusted: boolean } {
  if (contrast(background, preferred) >= 4.5) return { color: preferred, adjusted: false };
  const candidates = palette.map((color) => hex(color, '')).filter(Boolean);
  const best = candidates.sort((a, b) => contrast(background, b) - contrast(background, a))[0] || preferred;
  return { color: best, adjusted: best !== preferred };
}

export function deriveRoles(colors: string[], base: ColorRoles): { roles: ColorRoles; adjusted: boolean } {
  const primary = colors[0] || base.primary;
  const secondary = colors[1] || colors[0] || base.secondary;
  const accent = colors[2] || colors[1] || base.accent;
  const darkBase = luminance(base.background) < 0.42;
  const background = mix(primary, darkBase ? '#000000' : '#FFFFFF', darkBase ? 0.82 : 0.88);
  const surface = mix(primary, darkBase ? '#000000' : '#FFFFFF', darkBase ? 0.68 : 0.76);
  const preferred = darkBase ? '#F8FAFC' : '#111827';
  const checked = readableText(background, preferred, [primary, secondary, accent]);
  const muted = mix(checked.color, background, 0.38);
  return { roles: { background, surface, primary, secondary, accent, text: checked.color, mutedText: muted }, adjusted: checked.adjusted };
}

async function imageElement(file: File): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* SVG support varies; use an object URL below. */ }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The logo preview could not be read.')); };
    image.src = url;
  });
}

export async function extractPalette(file: File, base: ColorRoles): Promise<{ roles: ColorRoles; adjusted: boolean; hasBackground: boolean }> {
  const source = await imageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = 120; canvas.height = 120;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot analyse the logo colours.');
  context.clearRect(0, 0, 120, 120);
  context.drawImage(source, 0, 0, 120, 120);
  const data = context.getImageData(0, 0, 120, 120).data;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2]; const a = data[i + 3];
    if (a < 80 || (r > 242 && g > 242 && b > 242) || (r < 14 && g < 14 && b < 14)) continue;
    const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
    const item = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    item.count += 1; item.r += r; item.g += g; item.b += b; buckets.set(key, item);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 6).map((item) => `#${[item.r, item.g, item.b].map((value) => Math.round(value / item.count).toString(16).padStart(2, '0')).join('')}`.toUpperCase());
  const corners = [[2, 2], [117, 2], [2, 117], [117, 117]].map(([x, y]) => {
    const index = (y * 120 + x) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  });
  const first = corners[0];
  const hasBackground = corners.every((corner) => corner[3] > 245 && Math.abs(corner[0] - first[0]) + Math.abs(corner[1] - first[1]) + Math.abs(corner[2] - first[2]) < 42);
  const derived = deriveRoles(dominant, base);
  return { ...derived, hasBackground };
}

export function defaultProjectBrand(styleId?: string | null): ProjectBrand {
  const derived = deriveRoles(WORKSPACE_BRAND_FALLBACK, getStylePreset(styleId).colorRoles);
  return {
    colors: derived.roles,
    autoColors: derived.roles,
    useBrandColors: true,
    logoPlacement: { watermark: { corner: 'tr', opacity: 0.7 }, intro: false, outro: true },
    textAdjusted: false,
  };
}

export default function ForgeBrandStep({ projectId, styleId, value, onChange, onCommit, compact = false }: {
  projectId: string;
  styleId?: string | null;
  value?: ProjectBrand;
  onChange: (brand: ProjectBrand) => void;
  onCommit?: (brand: ProjectBrand) => Promise<void>;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const appliedKitRef = useRef('');
  const base = useMemo(() => getStylePreset(styleId), [styleId]);
  const brand = value || defaultProjectBrand(styleId);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [swapFrom, setSwapFrom] = useState<keyof ColorRoles>('primary');
  const [swapTo, setSwapTo] = useState<keyof ColorRoles>('accent');

  // The saved Brand Kit is never applied here: its logo and colours reach a video
  // only when the user picks "Use my saved Brand Kit" and confirms them.
  useEffect(() => {
    if (value || appliedKitRef.current === projectId) return;
    appliedKitRef.current = projectId;
    onChange(defaultProjectBrand(styleId));
  }, [projectId, styleId, value]);

  const updateColors = (next: ColorRoles, autoColors = brand.autoColors, forcedAdjusted?: boolean) => {
    const checked = readableText(next.background, next.text, [next.primary, next.secondary, next.accent, next.text]);
    const colors = { ...next, text: checked.color };
    onChange({ ...brand, colors, autoColors, textAdjusted: forcedAdjusted ?? checked.adjusted });
  };

  const onLogo = async (file?: File) => {
    if (!file) return;
    const allowed = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    if (allowed.indexOf(file.type) < 0) { setError('Choose a PNG, SVG, JPG or WebP logo.'); return; }
    setUploading(true); setError('');
    try {
      const palette = await extractPalette(file, base.colorRoles);
      const stored = await uploadProjectLogo(file, projectId);
      onChange({
        ...brand,
        logoUrl: stored.url,
        logoKey: stored.key,
        logoHasBackground: palette.hasBackground,
        colors: palette.roles,
        autoColors: palette.roles,
        textAdjusted: palette.adjusted,
      });
    } catch (cause: any) {
      setError(String(cause?.message || cause || 'The logo could not be uploaded.'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const swap = () => {
    if (swapFrom === swapTo) return;
    const next = { ...brand.colors, [swapFrom]: brand.colors[swapTo], [swapTo]: brand.colors[swapFrom] };
    updateColors(next);
  };

  const commit = async () => {
    if (!onCommit || saving) return;
    setSaving(true); setError('');
    try { await onCommit(brand); }
    catch (cause: any) { setError(String(cause?.message || cause || 'Brand changes could not be saved.')); }
    finally { setSaving(false); }
  };

  return (
    <section style={{ background: compact ? COLORS.surface : 'transparent', border: compact ? `1px solid ${COLORS.border}` : 'none', borderRadius: RADIUS.card, display: 'grid', gap: 18, maxWidth: 960, padding: compact ? 16 : 0 }} data-testid="sceneforge-brand-step">
      <div>
        <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 17, fontWeight: 700, margin: '0 0 5px' }}>Brand palette</h3>
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: '19px', margin: 0 }}>Fine-tune this video's palette and logo placement. Nothing is taken from your saved Brand Kit unless you choose it above, and the Remotion agent only treats these as brand colours once you confirm them.</p>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 10, padding: 14 }}>
          <input ref={inputRef} type="file" accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg,image/webp" hidden onChange={(event) => void onLogo(event.target.files?.[0])} />
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{ alignItems: 'center', background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}`, borderRadius: RADIUS.sm, color: COLORS.accent, cursor: uploading ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13, fontWeight: 700, gap: 8, justifyContent: 'center', minHeight: 44, padding: '0 12px' }} data-testid="button-upload-brand-logo">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {uploading ? 'Analysing & uploading…' : brand.logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          <span style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: '17px' }}>PNG, SVG, JPG or WebP. Transparent PNG/SVG recommended.</span>
          {brand.logoUrl ? (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              {['#090909', '#F7F7F4'].map((background, index) => <div key={background} style={{ alignItems: 'center', aspectRatio: '3 / 2', background, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, display: 'flex', justifyContent: 'center', padding: 12 }}><img src={brand.logoUrl} alt={`Logo on ${index ? 'light' : 'dark'} background`} style={{ maxHeight: '64px', maxWidth: '100%', objectFit: 'contain' }} /></div>)}
            </div>
          ) : <div style={{ alignItems: 'center', aspectRatio: '3 / 2', border: `1px dashed ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.muted, display: 'flex', justifyContent: 'center' }}><ImagePlus size={22} /></div>}
          {brand.logoHasBackground ? <div style={{ background: COLORS.warningBg, border: `1px solid ${COLORS.warning}`, borderRadius: RADIUS.sm, color: COLORS.warning, fontSize: 12, lineHeight: '18px', padding: 9 }}>Logo has a background - a transparent PNG/SVG will look cleaner.</div> : null}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}`, borderRadius: 999, color: COLORS.accent, fontSize: 12.5, fontWeight: 700, padding: '10px 14px' }}>Video palette</span>
            <span style={{ color: COLORS.muted, fontSize: 11.5 }}>Used as brand colours only when you confirm them</span>
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {ROLE_LABELS.map(({ key, label }) => (
              <label key={key} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.muted, display: 'grid', fontSize: 11.5, gap: 6, padding: 9 }}>
                {label}
                <span style={{ alignItems: 'center', display: 'flex', gap: 7 }}>
                  <input type="color" value={hex(brand.colors[key])} onChange={(event) => updateColors({ ...brand.colors, [key]: event.target.value.toUpperCase() })} style={{ background: 'transparent', border: 0, height: 30, padding: 0, width: 34 }} />
                  <input value={brand.colors[key]} onChange={(event) => { const value = event.target.value; if (/^#[0-9a-f]{6}$/i.test(value)) updateColors({ ...brand.colors, [key]: value.toUpperCase() }); else onChange({ ...brand, colors: { ...brand.colors, [key]: value } }); }} onBlur={() => updateColors({ ...brand.colors, [key]: hex(brand.colors[key], base.colorRoles[key]) })} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: 7, color: COLORS.text, fontFamily: 'monospace', fontSize: 11.5, minWidth: 0, padding: '7px 8px', width: '100%' }} />
                </span>
              </label>
            ))}
          </div>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            <select value={swapFrom} onChange={(event) => setSwapFrom(event.target.value as keyof ColorRoles)} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.secondary, minHeight: 38, padding: '0 8px' }}>{ROLE_LABELS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
            <ArrowLeftRight size={14} color={COLORS.muted} />
            <select value={swapTo} onChange={(event) => setSwapTo(event.target.value as keyof ColorRoles)} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.secondary, minHeight: 38, padding: '0 8px' }}>{ROLE_LABELS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
            <button type="button" onClick={swap} style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', minHeight: 38, padding: '0 11px' }}>Swap roles</button>
            <button type="button" onClick={() => updateColors({ ...(brand.autoColors || base.colorRoles) }, brand.autoColors, false)} style={{ alignItems: 'center', background: 'transparent', border: 'none', color: COLORS.accent, cursor: 'pointer', display: 'flex', gap: 6, minHeight: 38, padding: '0 8px' }}><RotateCcw size={13} /> Reset to auto</button>
          </div>
          {brand.textAdjusted ? <div style={{ color: COLORS.success, fontSize: 12.5 }}>Text colour adjusted for readability</div> : null}
          <div style={{ color: contrast(brand.colors.text, brand.colors.background) >= 4.5 ? COLORS.muted : COLORS.warning, fontSize: 11.5 }}>Text/background contrast: {contrast(brand.colors.text, brand.colors.background).toFixed(1)}:1 · minimum 4.5:1</div>
        </div>
      </div>

      <div style={{ background: COLORS.raised, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, display: 'grid', gap: 12, padding: 14 }}>
        <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14 }}>Logo placement · final video</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <label style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 13, gap: 7 }}><input type="checkbox" checked={Boolean(brand.logoPlacement.watermark)} onChange={(event) => onChange({ ...brand, logoPlacement: { ...brand.logoPlacement, watermark: event.target.checked ? { corner: brand.logoPlacement.watermark?.corner || 'tr', opacity: brand.logoPlacement.watermark?.opacity ?? 0.7 } : undefined } })} /> Corner watermark</label>
          <label style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 13, gap: 7 }}><input type="checkbox" checked={brand.logoPlacement.intro} onChange={(event) => onChange({ ...brand, logoPlacement: { ...brand.logoPlacement, intro: event.target.checked } })} /> Intro sting</label>
          <label style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 13, gap: 7 }}><input type="checkbox" checked={brand.logoPlacement.outro} onChange={(event) => onChange({ ...brand, logoPlacement: { ...brand.logoPlacement, outro: event.target.checked } })} /> Outro end card</label>
        </div>
        {brand.logoPlacement.watermark ? <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <label style={{ color: COLORS.muted, display: 'grid', fontSize: 11.5, gap: 4 }}>Corner<select value={brand.logoPlacement.watermark.corner} onChange={(event) => onChange({ ...brand, logoPlacement: { ...brand.logoPlacement, watermark: { ...brand.logoPlacement.watermark!, corner: event.target.value as 'tl' | 'tr' | 'bl' | 'br' } } })} style={{ background: COLORS.input, border: `1px solid ${COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.text, minHeight: 38, padding: '0 8px' }}><option value="tl">Top left</option><option value="tr">Top right</option><option value="bl">Bottom left</option><option value="br">Bottom right</option></select></label>
          <label style={{ color: COLORS.muted, display: 'grid', flex: 1, fontSize: 11.5, gap: 4, minWidth: 180 }}>Opacity · {Math.round(brand.logoPlacement.watermark.opacity * 100)}%<input type="range" min={20} max={100} value={Math.round(brand.logoPlacement.watermark.opacity * 100)} onChange={(event) => onChange({ ...brand, logoPlacement: { ...brand.logoPlacement, watermark: { ...brand.logoPlacement.watermark!, opacity: Number(event.target.value) / 100 } } })} style={{ accentColor: COLORS.accent }} /></label>
        </div> : null}
      </div>

      {error ? <div role="alert" style={{ color: COLORS.danger, fontSize: 13 }}>{error}</div> : null}
      {onCommit ? <button type="button" disabled={saving} onClick={() => void commit()} style={{ alignItems: 'center', background: COLORS.accent, border: 'none', borderRadius: RADIUS.sm, color: COLORS.onAccent, cursor: saving ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, justifyContent: 'center', minHeight: 44, padding: '0 16px', width: 'fit-content' }}>{saving ? <Loader2 size={14} className="animate-spin" /> : null}{saving ? 'Saving…' : 'Save brand changes'}</button> : null}
    </section>
  );
}
