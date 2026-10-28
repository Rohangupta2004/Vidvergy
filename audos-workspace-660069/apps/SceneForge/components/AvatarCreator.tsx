import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  Clock3,
  ImagePlus,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  UserRoundPlus,
  Video,
} from 'lucide-react';
import { COLORS, FONT, GRADIENT, RADIUS } from '../../../components/theme';
import {
  createAvatar,
  deleteCreatedAvatar,
  listCreatedAvatars,
  pollCreatedAvatar,
  renameCreatedAvatar,
  uploadWorkspaceAvatarFile,
} from '../lib/forgeClient';
import type { ForgeCreatedAvatar, ForgeAvatarMethod } from '../lib/forgeTypes';

const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const IMAGE_MAX = 16 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;
const ACTIVE = ['pending', 'processing'];

const methods: Array<{ id: ForgeAvatarMethod; title: string; blurb: string; icon: typeof Camera }> = [
  { id: 'photo', title: 'Photo to Avatar', blurb: 'Turn one clear portrait into an image-based talking avatar.', icon: Camera },
  { id: 'prompt', title: 'Prompt to Avatar', blurb: 'Describe a synthetic character and optionally guide it with references.', icon: Sparkles },
  { id: 'digital_twin', title: 'Digital Twin', blurb: 'Train a look from 15–600 seconds of recorded footage.', icon: Video },
];

function fieldStyle(): CSSProperties {
  return {
    background: COLORS.input,
    border: `1px solid ${COLORS.controlBorder}`,
    borderRadius: RADIUS.sm,
    color: COLORS.text,
    fontFamily: FONT.body,
    fontSize: 14,
    minHeight: 44,
    padding: '10px 12px',
    width: '100%',
  };
}

function buttonStyle(primary = false): CSSProperties {
  return {
    alignItems: 'center',
    background: primary ? GRADIENT.action : COLORS.raised,
    border: primary ? 'none' : `1px solid ${COLORS.border}`,
    borderRadius: RADIUS.sm,
    color: primary ? COLORS.onAccent : COLORS.secondary,
    cursor: 'pointer',
    display: 'inline-flex',
    fontFamily: FONT.heading,
    fontSize: 13.5,
    fontWeight: 700,
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
    padding: '0 16px',
  };
}

function exactMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

async function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement('video');
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      const duration = Number(media.duration);
      URL.revokeObjectURL(url);
      Number.isFinite(duration) ? resolve(duration) : reject(new Error('The video duration could not be read.'));
    };
    media.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected video could not be read.')); };
    media.src = url;
  });
}

function validateImage(file: File): string | null {
  if (IMAGE_TYPES.indexOf(file.type) < 0) return 'Use a JPEG or PNG image.';
  if (file.size > IMAGE_MAX) return `Images must be ${exactMb(IMAGE_MAX)} or smaller.`;
  return null;
}

function errorMessage(error: any): { message: string; code: string } {
  return { message: String(error?.message || error || 'Something went wrong.'), code: String(error?.code || '') };
}

export default function AvatarCreator({ onUse }: { onUse?: (avatar: ForgeCreatedAvatar) => void }) {
  const [method, setMethod] = useState<ForgeAvatarMethod>('photo');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [references, setReferences] = useState<File[]>([]);
  const [parentId, setParentId] = useState<number | null>(null);
  const [consentAttested, setConsentAttested] = useState(false);
  const [avatars, setAvatars] = useState<ForgeCreatedAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listCreatedAvatars();
      setAvatars(rows);
      setError('');
    } catch (e) {
      setError(errorMessage(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeSignature = avatars.filter((avatar) => ACTIVE.indexOf(avatar.status) >= 0).map((avatar) => avatar.id).join(',');
  useEffect(() => {
    if (!activeSignature) return undefined;
    let stopped = false;
    const timer = window.setInterval(async () => {
      const ids = activeSignature.split(',').filter(Boolean).map(Number);
      const settled = await Promise.allSettled(ids.map((id) => pollCreatedAvatar(id)));
      if (stopped) return;
      const updates = new Map<number, ForgeCreatedAvatar>();
      settled.forEach((result) => {
        if (result.status === 'fulfilled') updates.set(result.value.id, result.value);
        else setError(`HeyGen polling failed: ${errorMessage(result.reason).message}`);
      });
      if (updates.size) setAvatars((current) => current.map((avatar) => updates.get(avatar.id) || avatar));
    }, 6000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activeSignature]);

  const readyCount = useMemo(() => avatars.filter((avatar) => avatar.status === 'ready').length, [avatars]);
  const avatarGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; looks: ForgeCreatedAvatar[] }>();
    avatars.forEach((avatar) => {
      const key = String(avatar.provider_group_id || avatar.provider_avatar_id || `row-${avatar.id}`);
      const current = groups.get(key);
      if (current) current.looks.push(avatar);
      else groups.set(key, { key, name: avatar.name, looks: [avatar] });
    });
    return [...groups.values()];
  }, [avatars]);
  const readyParents = useMemo(() => avatarGroups.filter((group) => group.looks.some((look) => look.status === 'ready' && look.provider_group_id)), [avatarGroups]);

  const resetForm = () => {
    setName('');
    setPrompt('');
    setPublicUrl('');
    setPhoto(null);
    setVideo(null);
    setReferences([]);
    setParentId(null);
    setConsentAttested(false);
  };

  const validate = async (): Promise<string | null> => {
    if (name.trim().length < 2) return 'Give the avatar a name of at least 2 characters.';
    if (!parentId && !consentAttested) return 'Confirm that you have this person’s consent before creating the avatar.';
    if (method === 'photo') {
      if (!photo && !publicUrl.trim()) return 'Upload one portrait or enter a public HTTPS image URL.';
      if (photo) return validateImage(photo);
      if (!/^https:\/\/[^\s]+$/i.test(publicUrl.trim())) return 'The image URL must be a public HTTPS URL.';
    }
    if (method === 'prompt') {
      if (prompt.trim().length < 8 || prompt.trim().length > 1000) return 'Write a character description between 8 and 1000 characters.';
      const invalid = references.map(validateImage).find(Boolean);
      if (invalid) return invalid;
      if (references.length > 3) return 'Attach up to 3 reference images.';
    }
    if (method === 'digital_twin') {
      if (!video) return 'Upload an MP4 or WebM training video.';
      if (VIDEO_TYPES.indexOf(video.type) < 0) return 'Use an MP4 or WebM video.';
      if (video.size > VIDEO_MAX) return `Training videos must be ${exactMb(VIDEO_MAX)} or smaller.`;
      const duration = await videoDuration(video);
      if (duration < 15 || duration > 600) return `Training footage must be 15–600 seconds; this file is ${Math.round(duration)} seconds.`;
    }
    return null;
  };

  const uploadImageAsset = async (file: File): Promise<string> => {
    setProgress(`Uploading ${file.name} to workspace storage…`);
    const stored = await uploadWorkspaceAvatarFile(file);
    return stored.url;
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setErrorCode('');
    setSuccess('');
    let failureStep: 'validation' | 'upload' | 'create' = 'validation';
    try {
      const invalid = await validate();
      if (invalid) throw new Error(invalid);

      failureStep = 'upload';
      let workspaceUrl = '';
      let referenceUrls: string[] = [];

      if (method === 'photo' && photo) workspaceUrl = await uploadImageAsset(photo);

      if (method === 'prompt' && references.length) {
        const uploaded: string[] = [];
        for (let index = 0; index < references.length; index += 1) {
          setProgress(`Uploading reference ${index + 1} of ${references.length} to workspace storage…`);
          uploaded.push(await uploadImageAsset(references[index]));
        }
        referenceUrls = uploaded;
      }

      if (method === 'digital_twin' && video) {
        setProgress('Uploading training footage to workspace storage…');
        const stored = await uploadWorkspaceAvatarFile(video);
        workspaceUrl = stored.url;
      }

      failureStep = 'create';
      setProgress('Asking HeyGen to create the avatar…');
      const created = await createAvatar({
        name: name.trim(),
        method,
        prompt: method === 'prompt' ? prompt.trim() : undefined,
        url: method === 'photo' && !photo ? publicUrl.trim() : undefined,
        workspaceUrl: workspaceUrl || undefined,
        referenceUrls,
        aspectRatio: 'auto',
        parentId: parentId || undefined,
        consentAttested: parentId ? undefined : consentAttested,
      });
      setAvatars((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSuccess(created.status === 'ready' ? `${created.name} is ready to use.` : `${created.name} is processing. You can leave this screen; status resumes after reload.`);
      resetForm();
    } catch (e: any) {
      const parsed = errorMessage(e);
      const prefix = failureStep === 'upload' ? 'Workspace upload failed' : failureStep === 'create' ? 'HeyGen create failed' : '';
      setError(prefix && !parsed.message.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix}: ${parsed.message}` : parsed.message);
      setErrorCode(parsed.code);
      if (e?.avatar) setAvatars((current) => [e.avatar, ...current.filter((item) => item.id !== e.avatar.id)]);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const rename = async (avatar: ForgeCreatedAvatar) => {
    const next = window.prompt('Avatar name', avatar.name)?.trim();
    if (!next || next === avatar.name) return;
    try {
      const updated = await renameCreatedAvatar(avatar.id, next);
      setAvatars((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (e) { setError(errorMessage(e).message); }
  };

  const remove = async (avatar: ForgeCreatedAvatar) => {
    if (!window.confirm(`Delete “${avatar.name}” from SceneForge? The provider copy will also be removed when the account allows it.`)) return;
    try {
      const warning = await deleteCreatedAvatar(avatar.id);
      setAvatars((current) => current.filter((item) => item.id !== avatar.id));
      setSuccess(warning ? `Removed from SceneForge. Provider cleanup could not complete: ${warning}` : `${avatar.name} was deleted.`);
    } catch (e) { setError(errorMessage(e).message); }
  };

  const statusLabel = (avatar: ForgeCreatedAvatar) => {
    if (avatar.status === 'ready') return 'Ready';
    if (avatar.status === 'enterprise_required') return 'Enterprise access required';
    if (avatar.status === 'failed') return 'Failed';
    return avatar.status === 'pending' ? 'Submitting' : 'Training';
  };

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 1160 }} data-testid="sceneforge-avatar-creator">
      <section style={{ background: GRADIENT.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, overflow: 'hidden', padding: 'clamp(18px, 4vw, 32px)', position: 'relative' }}>
        <div style={{ background: GRADIENT.ambient, height: 220, pointerEvents: 'none', position: 'absolute', right: -60, top: -90, width: 280 }} />
        <div style={{ position: 'relative' }}>
          <div style={{ alignItems: 'center', color: COLORS.accent, display: 'flex', fontFamily: FONT.heading, fontSize: 12, fontWeight: 700, gap: 7, letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>
            <UserRoundPlus size={16} /> Avatar Creator
          </div>
          <h2 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 'clamp(24px, 5vw, 36px)', letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 0 10px' }}>Create a presenter that is yours.</h2>
          <p style={{ color: COLORS.secondary, fontSize: 14.5, lineHeight: '23px', margin: 0, maxWidth: 700 }}>Build a talking-photo avatar, describe a synthetic character, or train a digital twin. Finished looks automatically appear in SceneForge’s Select avatar step.</p>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
        <section style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.card, padding: 'clamp(16px, 3vw, 24px)' }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 22 }}>
            {methods.map((item) => {
              const Icon = item.icon;
              const selected = method === item.id;
              const disabled = Boolean(parentId && item.id === 'digital_twin');
              return (
                <button key={item.id} type="button" disabled={disabled} onClick={() => { setMethod(item.id); setError(''); setErrorCode(''); }} style={{ background: selected ? COLORS.accentSoft : COLORS.raised, border: `1px solid ${selected ? COLORS.accent : COLORS.border}`, borderRadius: RADIUS.sm, color: selected ? COLORS.accent : COLORS.secondary, cursor: disabled ? 'not-allowed' : 'pointer', minHeight: 78, opacity: disabled ? 0.45 : 1, padding: 10 }} data-testid={`avatar-method-${item.id}`}> 
                  <Icon size={18} style={{ marginBottom: 6 }} />
                  <span style={{ display: 'block', fontFamily: FONT.heading, fontSize: 12.5, fontWeight: 700, lineHeight: '16px' }}>{item.title}</span>
                </button>
              );
            })}
          </div>

          <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: '20px', marginBottom: 18 }}>{methods.find((item) => item.id === method)?.blurb}</div>

          <div style={{ display: 'grid', gap: 15 }}>
            <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, fontWeight: 600, gap: 6 }}>
              Avatar group
              <select value={parentId || ''} onChange={(event) => { const next = Number(event.target.value) || null; setParentId(next); if (next && method === 'digital_twin') setMethod('photo'); }} style={fieldStyle()} data-testid="avatar-parent-group">
                <option value="">Create a new avatar</option>
                {readyParents.map((group) => <option key={group.key} value={group.looks[0].id}>Add another look to {group.name}</option>)}
              </select>
              <span style={{ color: COLORS.muted, fontSize: 11.5, fontWeight: 400 }}>{parentId ? 'One HeyGen avatar-creation call creates this additional look in the existing group.' : 'New avatars require one consent attestation. Additional looks inherit the group’s attestation.'}</span>
            </label>
            <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, fontWeight: 600, gap: 6 }}>
              Avatar name
              <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maya — studio host" style={fieldStyle()} data-testid="avatar-name" />
            </label>

            {method === 'photo' ? (
              <>
                <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, fontWeight: 600, gap: 6 }}>
                  Portrait image · JPEG/PNG · max 16 MB
                  <input type="file" accept="image/jpeg,image/png" onChange={(event) => setPhoto(event.target.files?.[0] || null)} style={fieldStyle()} data-testid="avatar-photo-file" />
                </label>
                <div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 11.5, gap: 10 }}><span style={{ background: COLORS.border, flex: 1, height: 1 }} />or use a public image<span style={{ background: COLORS.border, flex: 1, height: 1 }} /></div>
                <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, fontWeight: 600, gap: 6 }}>
                  Public HTTPS URL
                  <input value={publicUrl} onChange={(event) => setPublicUrl(event.target.value)} placeholder="https://…/portrait.jpg" style={fieldStyle()} data-testid="avatar-photo-url" />
                </label>
              </>
            ) : null}

            {method === 'prompt' ? (
              <>
                <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, fontWeight: 600, gap: 6 }}>
                  Character description · 8–1000 characters
                  <textarea value={prompt} maxLength={1000} onChange={(event) => setPrompt(event.target.value)} placeholder="A confident product strategist in her early 30s, warm expression, navy blazer, modern amber-lit studio…" style={{ ...fieldStyle(), minHeight: 132, resize: 'vertical' }} data-testid="avatar-prompt" />
                  <span style={{ color: COLORS.muted, fontSize: 11.5, fontWeight: 400, textAlign: 'right' }}>{prompt.length}/1000</span>
                </label>
                <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, fontWeight: 600, gap: 6 }}>
                  Optional reference images · up to 3
                  <input type="file" multiple accept="image/jpeg,image/png" onChange={(event) => setReferences(Array.from(event.target.files || []).slice(0, 3))} style={fieldStyle()} data-testid="avatar-reference-files" />
                </label>
              </>
            ) : null}

            {method === 'digital_twin' ? (
              <>
                <label style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, fontWeight: 600, gap: 6 }}>
                  Training footage · MP4/WebM · 15–600 seconds · max 50 MB
                  <input type="file" accept="video/mp4,video/webm" onChange={(event) => setVideo(event.target.files?.[0] || null)} style={fieldStyle()} data-testid="avatar-twin-video" />
                </label>
                <div style={{ background: COLORS.infoBg, border: `1px solid ${COLORS.info}`, borderRadius: RADIUS.sm, color: COLORS.secondary, fontSize: 12.5, lineHeight: '19px', padding: 12 }}>
                  <strong style={{ color: COLORS.info }}>Account access:</strong> Digital Twin creation often requires Enterprise access and provider consent. SceneForge will show the provider’s exact response and never pretend a failed training request succeeded.
                </div>
              </>
            ) : null}

            {!parentId ? <label style={{ alignItems: 'flex-start', background: consentAttested ? COLORS.successBg : COLORS.raised, border: `1px solid ${consentAttested ? COLORS.success : COLORS.controlBorder}`, borderRadius: RADIUS.sm, color: COLORS.secondary, cursor: 'pointer', display: 'flex', fontSize: 12.5, gap: 9, lineHeight: '19px', padding: 11 }}>
              <input type="checkbox" checked={consentAttested} onChange={(event) => setConsentAttested(event.target.checked)} style={{ accentColor: COLORS.accent, height: 17, marginTop: 1, width: 17 }} data-testid="avatar-consent-attestation" />
              <span><strong style={{ color: COLORS.text }}>I have this person’s consent.</strong><br />This one-time attestation is stored with the avatar and is not requested again for later looks or video generation.</span>
            </label> : null}

            {error ? (
              <div style={{ background: errorCode === 'enterprise_required' ? COLORS.warningBg : COLORS.dangerBg, border: `1px solid ${errorCode === 'enterprise_required' ? COLORS.warning : COLORS.danger}`, borderRadius: RADIUS.sm, color: COLORS.text, fontSize: 13, lineHeight: '20px', padding: 12 }} role="alert">
                <strong style={{ color: errorCode === 'enterprise_required' ? COLORS.warning : COLORS.danger, display: 'block', marginBottom: 3 }}>
                  {errorCode === 'enterprise_required' ? 'Digital Twin requires Enterprise access on your avatar provider account' : errorCode === 'credential_required' ? 'Connect your avatar provider key' : errorCode === 'provider_retryable' ? 'The provider will retry this job' : 'Avatar creation failed'}
                </strong>
                {error}
              </div>
            ) : null}
            {success ? <div style={{ background: COLORS.successBg, border: `1px solid ${COLORS.success}`, borderRadius: RADIUS.sm, color: COLORS.success, fontSize: 13, padding: 12 }}><Check size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />{success}</div> : null}

            <button type="button" disabled={busy} onClick={submit} style={{ ...buttonStyle(true), cursor: busy ? 'wait' : 'pointer', minHeight: 48, opacity: busy ? 0.75 : 1, width: '100%' }} data-testid="avatar-create-submit">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {busy ? progress || 'Preparing…' : 'Create avatar'}
            </button>
          </div>
        </section>

        <section style={{ minWidth: 0 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 10, justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h3 style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 18, margin: 0 }}>My Avatars</h3>
              <div style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 3 }}>{readyCount} ready · jobs resume after reload</div>
            </div>
            <button type="button" onClick={() => { setLoading(true); void load(); }} style={buttonStyle(false)}><Clock3 size={14} /> Refresh</button>
          </div>

          {loading ? <div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', gap: 8, padding: 20 }}><Loader2 size={15} className="animate-spin" /> Loading your avatars…</div> : null}
          {!loading && !avatars.length ? (
            <div style={{ background: COLORS.surface, border: `1px dashed ${COLORS.border}`, borderRadius: RADIUS.card, color: COLORS.muted, display: 'grid', fontSize: 13.5, gap: 8, justifyItems: 'center', padding: 28, textAlign: 'center' }}>
              <ImagePlus size={24} color={COLORS.accent} />
              <strong style={{ color: COLORS.text, fontFamily: FONT.heading }}>No custom avatars yet</strong>
              Create one here and it will join SceneForge’s existing avatar catalog.
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            {avatarGroups.map((group) => {
              const avatar = group.looks[0];
              const isVideo = Boolean(avatar.preview_video_url);
              const terminalError = avatar.status === 'failed' || avatar.status === 'enterprise_required';
              const expanded = expandedGroup === group.key;
              return (
                <article key={group.key} style={{ background: COLORS.surface, border: `1px solid ${terminalError ? COLORS.danger : avatar.status === 'ready' ? COLORS.border : COLORS.accent}`, borderRadius: RADIUS.card, overflow: 'hidden' }}> 
                  <div style={{ aspectRatio: '4 / 3', background: COLORS.raised, position: 'relative' }}>
                    {isVideo ? <video src={avatar.preview_video_url || ''} muted loop playsInline controls style={{ height: '100%', objectFit: 'cover', width: '100%' }} /> : avatar.preview_url ? <img src={avatar.preview_url} alt={avatar.name} loading="lazy" style={{ height: '100%', objectFit: 'cover', width: '100%' }} /> : <div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', height: '100%', justifyContent: 'center' }}>{ACTIVE.indexOf(avatar.status) >= 0 ? <Loader2 size={22} className="animate-spin" /> : <UserRoundPlus size={24} />}</div>}
                    <span style={{ background: avatar.status === 'ready' ? COLORS.successBg : terminalError ? COLORS.dangerBg : COLORS.accentSoft, border: `1px solid ${avatar.status === 'ready' ? COLORS.success : terminalError ? COLORS.danger : COLORS.accent}`, borderRadius: 999, color: avatar.status === 'ready' ? COLORS.success : terminalError ? COLORS.danger : COLORS.accent, fontSize: 10.5, fontWeight: 700, left: 8, padding: '4px 7px', position: 'absolute', top: 8 }}>{statusLabel(avatar)}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 9, padding: 12 }}>
                    <div>
                      <div style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14, fontWeight: 700 }}>{group.name}</div>
                      <div style={{ color: COLORS.muted, fontSize: 11.5, marginTop: 2, textTransform: 'capitalize' }}>{group.looks.length} look{group.looks.length === 1 ? '' : 's'} · {avatar.method.replace('_', ' ')}</div>
                    </div>
                    {avatar.status === 'enterprise_required' ? <div style={{ color: COLORS.warning, fontSize: 11.5, lineHeight: '17px' }}><AlertCircle size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />Digital Twin requires Enterprise access on your avatar provider account.<br /><span style={{ color: COLORS.muted }}>{avatar.error}</span></div> : avatar.status === 'failed' ? <div style={{ color: COLORS.danger, fontSize: 11.5, lineHeight: '17px' }}>{avatar.error}</div> : ACTIVE.indexOf(avatar.status) >= 0 ? <div style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: '17px' }}>Provider training is in progress. This card will update automatically.</div> : avatar.consent_status && !/approved|complete|verified|attested|accepted/i.test(avatar.consent_status) ? <div style={{ color: COLORS.warning, fontSize: 11.5 }}>Provider consent status: {avatar.consent_status}</div> : null}
                    {avatar.consent_attested ? <div style={{ color: COLORS.success, fontSize: 11.5 }}><Check size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />Consent attested once</div> : null}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {avatar.status === 'ready' && onUse ? <button type="button" onClick={() => onUse(avatar)} style={{ ...buttonStyle(true), flex: 1, minHeight: 38, padding: '0 10px' }}><Check size={13} /> Use in SceneForge</button> : null}
                      {group.looks.length > 1 ? <button type="button" onClick={() => setExpandedGroup(expanded ? null : group.key)} style={{ ...buttonStyle(false), minHeight: 38, padding: '0 10px' }}>{expanded ? 'Hide looks' : `Show ${group.looks.length} looks`}</button> : null}
                      <button type="button" onClick={() => rename(avatar)} style={{ ...buttonStyle(false), minHeight: 38, padding: '0 10px' }} aria-label={`Rename ${avatar.name}`}><Pencil size={13} /></button>
                      <button type="button" onClick={() => remove(avatar)} style={{ ...buttonStyle(false), color: COLORS.danger, minHeight: 38, padding: '0 10px' }} aria-label={`Delete ${avatar.name}`}><Trash2 size={13} /></button>
                    </div>
                    {expanded ? <div style={{ borderTop: `1px solid ${COLORS.border}`, display: 'grid', gap: 7, paddingTop: 9 }}>{group.looks.map((look) => <div key={look.id} style={{ alignItems: 'center', display: 'grid', gap: 7, gridTemplateColumns: '42px minmax(0,1fr) auto' }}>{look.preview_url ? <img src={look.preview_url} alt="" style={{ borderRadius: 6, height: 42, objectFit: 'cover', width: 42 }} /> : <span /> }<span style={{ color: COLORS.secondary, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{look.name}</span>{look.status === 'ready' && onUse ? <button type="button" onClick={() => onUse(look)} style={{ ...buttonStyle(false), minHeight: 34, padding: '0 8px' }}>Use</button> : null}</div>)}</div> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 11.5, gap: 7 }}><Upload size={13} /> Files upload to workspace storage first; HeyGen receives only the public URL from the server. Provider credentials stay server-side.</div>
    </div>
  );
}
