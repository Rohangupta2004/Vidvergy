import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import SharedMotionEditor from '../../../components/MotionEditor';
import {
  inspectVideoMetadata,
  motionEngine,
  transcribeAudioUrls,
  type MotionJob,
  type MotionProject,
  type MotionSourceMedia,
  type MotionTranscript,
} from '../../../lib/motionEngineSdk';
import type { ForgeProject } from '../lib/forgeTypes';
import { alignKnownScript, createVisionEdit, type VisionEditProposal, type VisionEditorModel } from '../lib/visionEditor';
import { FORGE_OPUS_LABEL, FORGE_OPUS_MODEL } from '../lib/forgeModels';
import { looksTechnical, safeErrorText } from '../lib/safeError';

export default function MotionEditor({ project }: { project: ForgeProject }) {
  const [open, setOpen] = useState(false);
  const [canonical, setCanonical] = useState<MotionProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [visionModel, setVisionModel] = useState<VisionEditorModel>(FORGE_OPUS_MODEL);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionProgress, setVisionProgress] = useState('');
  const [visionError, setVisionError] = useState('');
  const [proposal, setProposal] = useState<VisionEditProposal | null>(null);
  const [visionJob, setVisionJob] = useState<MotionJob | null>(null);

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

      const [rawTranscript, measured] = await Promise.all([
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

      const transcript = alignKnownScript(
        project.script || rawTranscript.text || '',
        rawTranscript.words,
        measured.durationSec || project.avatar_duration_sec || project.estimated_duration_sec || 30,
      );

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
      setNote(project.script?.trim()
        ? 'Known script wording aligned to verified Deepgram timings. The original avatar media stays immutable.'
        : 'No saved script was available, so captions use raw Deepgram wording and verified timings.');
    } catch (reason: any) {
      setError(String(reason?.message || reason));
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  const available = Boolean(project.heygen_video_url || project.heygen_chunks.some((chunk) => chunk.video_url));
  const transcriptProvider = String((canonical?.transcript as any)?.provider || '');
  const hasVerifiedTranscript = ['deepgram', 'deepgram_script_aligned', 'nova-3', 'heygen', 'user_verified'].includes(transcriptProvider);

  const proposeVisionEdit = async () => {
    if (!canonical || visionBusy) return;
    setVisionBusy(true);
    setVisionError('');
    setProposal(null);
    try {
      const sourceTranscript = canonical.transcript as MotionTranscript;
      if (!Array.isArray(sourceTranscript?.words) || !sourceTranscript.words.length) throw new Error('Verified word timings are required before vision editing.');
      const transcript = alignKnownScript(
        project.script || sourceTranscript.text || sourceTranscript.transcript || '',
        sourceTranscript.words,
        project.avatar_duration_sec || project.estimated_duration_sec || Math.max(...sourceTranscript.words.map((word) => word.end), 30),
      );
      const next = await createVisionEdit(project, transcript, visionModel, setVisionProgress);
      setProposal(next);
      setVisionProgress('');
    } catch (reason: any) {
      setVisionError(String(reason?.message || reason || 'The vision edit could not be prepared.'));
    } finally {
      setVisionBusy(false);
    }
  };

  const acceptVisionEdit = async () => {
    if (!canonical || !proposal || visionBusy) return;
    setVisionBusy(true);
    setVisionError('');
    setVisionProgress('Applying the proposed edit to a new project version…');
    try {
      const response = await motionEngine.edit(canonical.id, {
        idempotencyKey: `sceneforge-vision:${canonical.id}:${canonical.version}:${Date.now()}`,
        aspectRatio: canonical.aspectRatio,
        durationSeconds: Number((canonical.brief as any)?.durationSeconds) || project.avatar_duration_sec || 30,
        submittedBy: 'sceneforge-vision-editor',
        billingAuthorized: false,
      }, {
        timeline: proposal.timeline,
        graphicLayers: proposal.graphicLayers,
        transcript: proposal.transcript,
        globalArtDirection: proposal.globalArtDirection,
        instruction: `Apply the accepted SceneForge vision edit (${proposal.modelUsed}).`,
        scope: { timeline: true, captions: true, motionGraphics: true, musicDucking: true },
        preserve: ['original avatar media', 'voice and lip sync', 'known script wording', 'approved assets'],
      });
      if (response.project) setCanonical(response.project);
      if (response.job) setVisionJob(response.job);
      setNote(`Accepted ${proposal.modelUsed} vision edit as a new non-destructive project version. Preview or export remains available from the shared editor.`);
      setProposal(null);
      setVisionProgress('');
      setOpen(true);
    } catch (reason: any) {
      setVisionError(String(reason?.message || reason || 'The proposed edit could not be applied.'));
    } finally {
      setVisionBusy(false);
    }
  };

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
      {error ? <div role="alert" style={{ background: 'var(--vg-danger-bg)', borderTop: '1px solid var(--vg-danger)', color: 'var(--vg-danger)', fontSize: 11, lineHeight: 1.5, padding: '8px 14px' }}>{safeErrorText(error, 'The motion editor could not open this project — please try again.', { script: project.script, maxLength: 220, context: 'motion editor error' })}</div> : null}
      {open && canonical ? (
        <div style={{ borderTop: '1px solid var(--vg-border)', display: 'grid', gap: 0 }}>
          <section style={{ background: 'var(--vg-raised)', borderBottom: '1px solid var(--vg-border)', display: 'grid', gap: 10, padding: 14 }} data-testid="sceneforge-vision-editor">
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              <Sparkles size={15} color="var(--vg-accent)" />
              <strong style={{ color: 'var(--vg-text)', fontFamily: 'Space Grotesk, sans-serif', fontSize: 13 }}>AI vision edit</strong>
              <span style={{ color: 'var(--vg-muted)', fontSize: 11 }}>~1 frame/sec + every scene boundary · script-locked captions</span>
              <select aria-label="Vision editor model" value={visionModel} onChange={(event) => setVisionModel(event.target.value as VisionEditorModel)} disabled={visionBusy} style={{ background: 'var(--vg-bg)', border: '1px solid var(--vg-control-border)', borderRadius: 8, color: 'var(--vg-secondary)', marginLeft: 'auto', minHeight: 36, padding: '0 9px' }}>
                <option value={FORGE_OPUS_MODEL}>{FORGE_OPUS_LABEL}</option>
                <option value="gpt-6.1-sol">GPT 6.1 Sol</option>
              </select>
              <button type="button" onClick={() => void proposeVisionEdit()} disabled={visionBusy} style={{ alignItems: 'center', background: 'var(--vg-gradient-action)', border: 0, borderRadius: 8, color: 'var(--vg-on-accent)', cursor: visionBusy ? 'wait' : 'pointer', display: 'inline-flex', fontFamily: 'Space Grotesk, sans-serif', fontSize: 12, fontWeight: 700, gap: 7, minHeight: 38, padding: '0 12px' }} data-testid="button-propose-vision-edit">
                {visionBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Watch film & propose edit
              </button>
            </div>
            <span style={{ color: 'var(--vg-muted)', fontSize: 10.5, lineHeight: 1.5 }}>Opus automatically falls back to GPT 6.1 Sol, then to the existing deterministic SceneForge edit. A failed AI pass never blocks preview or export.</span>
            {visionProgress ? <div role="status" style={{ alignItems: 'center', color: 'var(--vg-secondary)', display: 'flex', fontSize: 11, gap: 7 }}><Loader2 size={12} className="animate-spin" color="var(--vg-accent)" />{visionProgress}</div> : null}
            {visionError ? <div role="alert" style={{ background: 'var(--vg-danger-bg)', border: '1px solid var(--vg-danger)', borderRadius: 8, color: 'var(--vg-danger)', fontSize: 11, padding: 9 }}>{safeErrorText(visionError, 'The vision edit could not be prepared — please try again.', { script: project.script, maxLength: 220, context: 'vision edit error' })}</div> : null}
            {proposal ? (
              <div style={{ background: 'var(--vg-surface)', border: '1px solid var(--vg-accent)', borderRadius: 10, display: 'grid', gap: 9, padding: 11 }} data-testid="vision-edit-notes">
                <div style={{ alignItems: 'center', display: 'flex', gap: 7 }}><strong style={{ color: 'var(--vg-text)', fontSize: 12 }}>AI edit notes</strong><span style={{ color: 'var(--vg-muted)', fontSize: 10 }}>model: {proposal.modelUsed} · {proposal.frameCount} frames · {proposal.graphicLayers.length} layers</span></div>
                <ul style={{ color: 'var(--vg-secondary)', display: 'grid', fontSize: 11, gap: 4, lineHeight: 1.5, margin: 0, paddingLeft: 18 }}>{proposal.notes.filter((item) => !looksTechnical(item)).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                {proposal.fallbackReason ? <span style={{ color: 'var(--vg-warning)', fontSize: 10.5 }}>AI fallback used: {safeErrorText(proposal.fallbackReason, 'the AI vision pass was unavailable, so the existing SceneForge edit was used.', { script: project.script, maxLength: 200, context: 'vision fallback reason' })}</span> : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" onClick={() => void acceptVisionEdit()} disabled={visionBusy} style={{ alignItems: 'center', background: 'var(--vg-gradient-action)', border: 0, borderRadius: 8, color: 'var(--vg-on-accent)', cursor: visionBusy ? 'wait' : 'pointer', display: 'inline-flex', fontSize: 11.5, fontWeight: 700, gap: 6, minHeight: 36, padding: '0 11px' }} data-testid="button-accept-vision-edit"><Check size={13} /> Accept</button>
                  <button type="button" onClick={() => { setProposal(null); setVisionProgress(''); }} disabled={visionBusy} style={{ alignItems: 'center', background: 'var(--vg-raised)', border: '1px solid var(--vg-border)', borderRadius: 8, color: 'var(--vg-secondary)', cursor: 'pointer', display: 'inline-flex', fontSize: 11.5, fontWeight: 700, gap: 6, minHeight: 36, padding: '0 11px' }} data-testid="button-revert-vision-edit"><RotateCcw size={13} /> Revert</button>
                </div>
              </div>
            ) : null}
          </section>
          <SharedMotionEditor key={`${canonical.id}-${canonical.version}`} projectId={canonical.id} initialProject={canonical} initialJob={visionJob} title="SceneForge · Shared Motion Engine" onProjectChange={setCanonical} onJobChange={setVisionJob} />
        </div>
      ) : null}
    </section>
  );
}
