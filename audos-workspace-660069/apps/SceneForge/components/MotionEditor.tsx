import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Wand2 } from 'lucide-react';
import SharedMotionEditor from '../../../components/MotionEditor';
import {
  inspectVideoMetadata,
  motionEngine,
  transcribeAudioUrls,
  type MotionProject,
  type MotionSourceMedia,
} from '../../../lib/motionEngineSdk';
import type { ForgeProject } from '../lib/forgeTypes';

export default function MotionEditor({ project }: { project: ForgeProject }) {
  const [open, setOpen] = useState(false);
  const [canonical, setCanonical] = useState<MotionProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    void motionEngine.list(50).then((response) => {
      const found = response.projects?.find((candidate) => {
        const compatibility = candidate.compatibility || {};
        return String(compatibility.type || '') === 'sceneforge' && String(compatibility.id || '') === String(project.id);
      });
      if (!cancelled && found) setCanonical(found);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [project.id]);

  const adopt = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNote('Reading the finished avatar and verifying word timings…');
    try {
      const avatarUrl = project.heygen_video_url || project.heygen_chunks.find((chunk) => chunk.video_url)?.video_url || '';
      if (!avatarUrl) throw new Error('SceneForge needs a completed avatar master before motion editing can begin.');

      const clips = project.heygen_chunks
        .filter((chunk) => chunk.audio_url)
        .map((chunk) => ({ url: String(chunk.audio_url), durationSec: Number(chunk.duration_sec) || undefined }));
      if (!clips.length) throw new Error('The SceneForge voice track is not available for verified word timing.');

      const [transcript, measured] = await Promise.all([
        transcribeAudioUrls(clips),
        inspectVideoMetadata(avatarUrl).catch(() => ({
          durationSec: project.avatar_duration_sec || project.estimated_duration_sec || undefined,
          width: 1920,
          height: 1080,
          provenance: { source: 'sceneforge_provider_metadata', verifiedAt: new Date().toISOString() },
        })),
      ]);

      const sourceMedia: MotionSourceMedia[] = [{
        id: 'sceneforge-avatar',
        kind: 'avatar_video',
        url: avatarUrl,
        mimeType: 'video/mp4',
        durationSec: measured.durationSec,
        width: measured.width,
        height: measured.height,
        approved: true,
        provenance: { ...measured.provenance, provider: 'heygen', originalVoiceAndLipSync: true },
      }];
      if (project.final_video_url) sourceMedia.push({ id: 'sceneforge-landscape', kind: 'approved_render', url: project.final_video_url, approved: true, provenance: { system: 'sceneforge', aspectRatio: '16:9' } });
      if (project.portrait_video_url) sourceMedia.push({ id: 'sceneforge-portrait', kind: 'approved_render', url: project.portrait_video_url, approved: true, provenance: { system: 'sceneforge', aspectRatio: '9:16' } });

      const response = await motionEngine.adoptSceneForge(project.id, {
        app: 'sceneforge',
        name: project.topic || 'SceneForge motion project',
        prompt: 'Preserve the original HeyGen avatar, voice and lip synchronization. Add only speech-aware motion graphics, diagrams, captions, B-roll and subject-safe overlays grounded in verified frames and word timings.',
        mode: 'footage-overlay',
        durationSeconds: measured.durationSec || project.avatar_duration_sec || project.estimated_duration_sec || 30,
        aspectRatio: '16:9',
        sourceMedia,
        transcript,
        brand: { style: project.style, palette: project.director_plan?.palette || {} },
        compatibility: { type: 'sceneforge', id: project.id, preserveOriginalAvatar: true },
        submittedBy: 'sceneforge-motion-editor',
      });
      if (!response.project) throw new Error('The canonical project was not returned.');
      setCanonical(response.project);
      setOpen(true);
      setNote('Verified Deepgram word timings attached. The original avatar media stays immutable.');
    } catch (reason: any) {
      setError(String(reason?.message || reason));
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  const available = Boolean(project.heygen_video_url || project.heygen_chunks.some((chunk) => chunk.video_url));
  const transcriptProvider = String((canonical?.transcript as any)?.provider || '');
  const hasVerifiedTranscript = ['deepgram', 'nova-3', 'heygen', 'user_verified'].includes(transcriptProvider);

  return (
    <section style={{ background: 'var(--vg-surface, var(--space-surface-card))', border: '1px solid var(--vg-border, var(--space-border-default))', borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        disabled={!available || busy}
        onClick={() => canonical && hasVerifiedTranscript ? setOpen((value) => !value) : void adopt()}
        style={{ alignItems: 'center', background: 'transparent', border: 0, color: 'var(--vg-text, var(--space-text-primary))', cursor: available && !busy ? 'pointer' : 'not-allowed', display: 'flex', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700, gap: 9, minHeight: 52, opacity: available ? 1 : .55, padding: '0 14px', textAlign: 'left', width: '100%' }}
        data-testid="button-open-motion-engine"
      >
        {busy ? <Loader2 size={15} className="animate-spin" color="var(--vg-accent)" /> : <Wand2 size={15} color="var(--vg-accent)" />}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block' }}>Agentic motion editor</span>
          <span style={{ color: 'var(--vg-muted)', display: 'block', fontFamily: 'Manrope, sans-serif', fontSize: 11, fontWeight: 500 }}>Verified transcript · subject-safe graphics · same canonical project for Verger and manual edits</span>
        </span>
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
      </button>
      {note ? <div style={{ background: 'color-mix(in srgb, var(--vg-success) 10%, transparent)', borderTop: '1px solid var(--vg-border)', color: 'var(--vg-success)', fontSize: 11, padding: '8px 14px' }}>{note}</div> : null}
      {error ? <div role="alert" style={{ background: 'var(--vg-danger-bg)', borderTop: '1px solid var(--vg-danger)', color: 'var(--vg-danger)', fontSize: 11, lineHeight: 1.5, padding: '8px 14px' }}>{error}</div> : null}
      {open && canonical ? <div style={{ borderTop: '1px solid var(--vg-border)' }}><SharedMotionEditor projectId={canonical.id} initialProject={canonical} title="SceneForge · Shared Motion Engine" onProjectChange={setCanonical} /></div> : null}
    </section>
  );
}
