/**
 * SceneForge — opt-in QA audit for a finished Auto Editor video.
 * QA never runs on its own: the user presses "Run QA audit" (frame analysis,
 * no credits). Results are persisted on the project (`project.auto.qa`) and
 * shown per scene with proposed fixes the user approves or ignores. Nothing is
 * applied without approval, and the previous video stays in history.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, ShieldCheck, Wand2, X } from 'lucide-react';
import { COLORS, FONT, RADIUS } from '../../../components/theme';
import { GOLD_BUTTON_BG, SOFT_BUTTON_BG, SOFT_INSET, formatClock } from './StagePreviews';
import type { ForgeAutoQa, ForgeProject, ForgeQaFinding, ForgeQaFix } from '../lib/forgeTypes';
import { safeErrorText } from '../lib/safeError';

const qaText = (raw: unknown, fallback = ''): string => safeErrorText(raw, fallback, { maxLength: 200, context: 'hidden QA audit details' });

const ISSUE_LABEL: Record<string, string> = {
  clipped_text: 'Clipped text',
  overlap: 'Overlapping text',
  face_covered: 'Face covered',
  blank: 'Blank frame',
  unreadable: 'Unreadable text',
};

function issueLabel(type: string): string {
  return ISSUE_LABEL[type] || type.replace(/_/g, ' ');
}

function sceneLabel(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export function qaAuditState(project: ForgeProject): { qa: ForgeAutoQa | null; optIn: boolean; running: boolean } {
  const qa = project.auto?.qa || null;
  const optIn = Boolean(qa?.opt_in);
  return { qa, optIn, running: optIn && project.status === 'qa' };
}

function statusLine(qa: ForgeAutoQa): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  const issues = (qa.findings || []).filter((f) => !f.pass && f.issues.length).length;
  if (qa.status === 'passed') return { text: `QA passed — ${qa.total} frames checked, no issues found.`, tone: 'ok' };
  if (qa.status === 'warning') return { text: `QA found ${issues} frame issue${issues === 1 ? '' : 's'} in ${qa.total} checked frames.`, tone: 'warn' };
  if (qa.status === 'applied') return { text: `${(qa.applied || []).length} approved fix${(qa.applied || []).length === 1 ? '' : 'es'} applied in a new render. Run the audit again to verify it.`, tone: 'ok' };
  if (qa.status === 'cancelled') return { text: 'The QA audit was stopped before it finished.', tone: 'muted' };
  if (qa.status === 'skipped' || qa.status === 'unavailable') {
    const note = qaText(qa.note);
    return { text: `The QA audit could not review this video${note ? ` — ${note}` : '.'}`, tone: 'muted' };
  }
  return { text: 'QA audit', tone: 'muted' };
}

const pill = (bg: string, color: string) => ({ background: bg, borderRadius: 999, color, fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', padding: '3px 9px', whiteSpace: 'nowrap' as const });

function RunButton({ label, busy, disabled, onClick, primary = true }: { label: string; busy: boolean; disabled?: boolean; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} style={{ alignItems: 'center', background: disabled ? COLORS.raised : primary ? GOLD_BUTTON_BG : SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: disabled ? COLORS.muted : primary ? COLORS.onAccent : COLORS.text, cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, minHeight: 44, padding: '0 16px', width: 'fit-content' }} data-testid="button-run-qa">
      {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} {label}
    </button>
  );
}

function Progress({ qa }: { qa: ForgeAutoQa }) {
  const pct = qa.total ? Math.round(Math.min(1, qa.checked / qa.total) * 100) : 0;
  return (
    <div style={{ display: 'grid', gap: 6 }} role="status">
      <span style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 12.5, gap: 7 }}>
        <Loader2 size={13} className="animate-spin" color={COLORS.accent} />
        {qa.total ? `Checking frames — ${qa.checked} of ${qa.total}` : 'Sampling frames from your finished video…'}
      </span>
      <div style={{ background: 'var(--vg-info-bg)', borderRadius: 99, height: 4, overflow: 'hidden' }}>
        {qa.total ? <div style={{ background: GOLD_BUTTON_BG, height: '100%', transition: 'width 240ms cubic-bezier(.2,0,0,1)', width: `${pct}%` }} /> : <div className="animate-pulse" style={{ background: GOLD_BUTTON_BG, height: '100%', opacity: 0.55, width: '100%' }} />}
      </div>
      <span style={{ color: COLORS.muted, fontSize: 12 }}>Your finished video stays available while the audit runs.</span>
    </div>
  );
}

/** Scene timeline with a marker for every checked frame; flagged scenes are highlighted. */
function SceneTimeline({ qa, duration, onSeek }: { qa: ForgeAutoQa; duration: number; onSeek?: (t: number) => void }) {
  const scenes = qa.scenes || [];
  const findings = qa.findings || [];
  const flagged = new Set(findings.filter((f) => !f.pass && f.issues.length && f.beat).map((f) => f.beat!.id));
  const span = Math.max(1, duration);
  const left = (t: number) => `${Math.max(0, Math.min(100, (t / span) * 100))}%`;
  return (
    <div style={{ display: 'grid', gap: 4 }} data-testid="sceneforge-qa-timeline">
      <div style={{ background: 'var(--vg-info-bg)', borderRadius: 8, height: 30, overflow: 'hidden', position: 'relative' }}>
        {scenes.map((scene, index) => (
          <button
            key={`${scene.id}-${index}`}
            type="button"
            title={`${sceneLabel(scene.type)} · ${formatClock(scene.s)}–${formatClock(scene.e)}${flagged.has(scene.id) ? ' · has QA findings' : ''}`}
            onClick={() => onSeek?.(scene.s)}
            style={{ background: flagged.has(scene.id) ? `color-mix(in srgb, ${COLORS.warning} 45%, transparent)` : index % 2 ? 'color-mix(in srgb, var(--vg-gold) 14%, transparent)' : 'color-mix(in srgb, var(--vg-gold) 7%, transparent)', border: 'none', borderRight: '1px solid rgba(0,0,0,.25)', bottom: 0, cursor: onSeek ? 'pointer' : 'default', left: left(scene.s), padding: 0, position: 'absolute', top: 0, width: `calc(${left(scene.e)} - ${left(scene.s)})` }}
            aria-label={`Scene ${index + 1}: ${sceneLabel(scene.type)}`}
          />
        ))}
        {findings.map((finding, index) => {
          const bad = !finding.pass && finding.issues.length > 0;
          return (
            <button
              key={`marker-${index}`}
              type="button"
              title={`${formatClock(finding.t)} — ${bad ? finding.issues.map((issue) => issueLabel(issue.type)).join(', ') : finding.unavailable ? 'not reviewed' : 'passed'}`}
              onClick={() => onSeek?.(finding.t)}
              style={{ background: bad ? COLORS.danger : finding.unavailable ? COLORS.muted : COLORS.success, border: '2px solid rgba(0,0,0,.35)', borderRadius: 999, cursor: onSeek ? 'pointer' : 'default', height: bad ? 14 : 9, left: left(finding.t), padding: 0, position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)', width: bad ? 14 : 9 }}
              aria-label={`Frame at ${formatClock(finding.t)}${bad ? ' has issues' : ''}`}
            />
          );
        })}
      </div>
      <div style={{ color: COLORS.muted, display: 'flex', fontSize: 11, fontVariantNumeric: 'tabular-nums', justifyContent: 'space-between' }}>
        <span>0:00</span>
        <span>{scenes.length} scenes · tap a scene or marker to jump there</span>
        <span>{formatClock(span)}</span>
      </div>
    </div>
  );
}

function FindingRow({ finding, onSeek }: { finding: ForgeQaFinding; onSeek?: (t: number) => void }) {
  return (
    <div style={{ ...SOFT_INSET, alignItems: 'flex-start', display: 'flex', gap: 10, padding: 10 }}>
      {finding.url ? (
        <button type="button" onClick={() => onSeek?.(finding.t)} style={{ background: '#000', border: 'none', borderRadius: 8, cursor: onSeek ? 'pointer' : 'default', flex: '0 0 auto', overflow: 'hidden', padding: 0, width: 112 }} aria-label={`Jump to ${formatClock(finding.t)}`}>
          <img src={finding.url} alt={`Frame at ${formatClock(finding.t)}`} loading="lazy" style={{ aspectRatio: '16 / 9', display: 'block', objectFit: 'cover', width: '100%' }} />
        </button>
      ) : null}
      <div style={{ display: 'grid', flex: 1, gap: 5, minWidth: 0 }}>
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={pill(COLORS.dangerBg, COLORS.danger)}>{formatClock(finding.t)}</span>
          {finding.beat ? <span style={pill(SOFT_BUTTON_BG, COLORS.secondary)}>{sceneLabel(finding.beat.type)} · {formatClock(finding.beat.s)}–{formatClock(finding.beat.e)}</span> : null}
        </div>
        {finding.issues.map((issue, index) => (
          <span key={index} style={{ color: COLORS.text, fontSize: 12.5, lineHeight: '18px' }}>
            <strong>{issueLabel(issue.type)}</strong>{qaText(issue.detail) ? ` — ${qaText(issue.detail)}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function FixRow({ fix, choice, onChoose, locked }: { fix: ForgeQaFix; choice: 'approve' | 'ignore' | undefined; onChoose: (value: 'approve' | 'ignore') => void; locked: boolean }) {
  const decided = fix.status === 'approved' || fix.status === 'ignored';
  const fixText = qaText(fix.fix, `Fix the ${issueLabel(fix.issue).toLowerCase()}`);
  const toggle = (value: 'approve' | 'ignore', label: string, Icon: typeof Check) => {
    const active = choice === value;
    return (
      <button type="button" disabled={locked} onClick={() => onChoose(value)} aria-pressed={active} style={{ alignItems: 'center', background: active ? (value === 'approve' ? GOLD_BUTTON_BG : COLORS.raised) : SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: active && value === 'approve' ? COLORS.onAccent : COLORS.secondary, cursor: locked ? 'not-allowed' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 12, fontWeight: 700, gap: 5, minHeight: 34, padding: '0 11px' }} data-testid={`button-qa-fix-${value}-${fix.id}`}>
        <Icon size={13} /> {label}
      </button>
    );
  };
  return (
    <div style={{ ...SOFT_INSET, alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 12px' }}>
      <Wand2 size={15} color={COLORS.accent} style={{ flex: '0 0 auto' }} />
      <div style={{ display: 'grid', flex: 1, gap: 2, minWidth: 200 }}>
        <span style={{ color: COLORS.text, fontSize: 13, lineHeight: '18px' }}>{fixText.charAt(0).toUpperCase() + fixText.slice(1)}</span>
        <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{issueLabel(fix.issue)} at {formatClock(fix.t)}</span>
      </div>
      {decided ? (
        <span style={pill(fix.status === 'approved' ? COLORS.accentSoft : SOFT_BUTTON_BG, fix.status === 'approved' ? COLORS.accent : COLORS.muted)}>{fix.status === 'approved' ? 'Approved' : 'Ignored'}</span>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          {toggle('approve', 'Approve', Check)}
          {toggle('ignore', 'Ignore', X)}
        </div>
      )}
    </div>
  );
}

/** Full QA view for the preview player: scene timeline, per-scene findings and approvable fixes. */
export default function QaAuditPanel({
  project,
  busy,
  onRun,
  onFixes,
  onSeek,
}: {
  project: ForgeProject;
  busy: string | null;
  onRun?: () => void;
  onFixes?: (approve: string[], ignore: string[]) => void;
  onSeek?: (t: number) => void;
}) {
  const { qa, optIn, running } = qaAuditState(project);
  const [choices, setChoices] = useState<Record<string, 'approve' | 'ignore'>>({});
  useEffect(() => { setChoices({}); }, [qa?.finished_at]);
  const findings = useMemo(() => (qa?.findings || []).filter((f) => !f.pass && f.issues.length), [qa]);
  const proposed = (qa?.proposed || []).filter((fix) => fix.id);
  const open = proposed.filter((fix) => fix.status === 'proposed');
  const approveIds = open.filter((fix) => choices[fix.id!] === 'approve').map((fix) => fix.id!);
  const ignoreIds = open.filter((fix) => choices[fix.id!] === 'ignore').map((fix) => fix.id!);
  const canRun = project.status === 'done' && Boolean(project.final_video_url) && Boolean(onRun);
  const duration = Number(qa?.duration) || Number(project.avatar_duration_sec) || 0;

  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="sceneforge-qa-audit">
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <ShieldCheck size={16} color={COLORS.accent} />
        <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14 }}>QA audit</strong>
        <span style={pill(SOFT_BUTTON_BG, COLORS.muted)}>Optional · no credits</span>
      </div>

      {!optIn ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <span style={{ color: COLORS.secondary, fontSize: 12.5, lineHeight: '18px' }}>
            Checks sampled frames of this video for clipped text, overlapping graphics, a covered face or blank frames, and proposes fixes you can approve or ignore. It only runs when you press the button and uses no credits.
          </span>
          {onRun ? <RunButton label="Run QA audit" busy={busy === 'run-qa'} disabled={!canRun} onClick={onRun} /> : null}
        </div>
      ) : running && qa ? (
        <Progress qa={qa} />
      ) : qa ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {(() => {
            const line = statusLine(qa);
            return (
              <span style={{ alignItems: 'center', color: line.tone === 'ok' ? COLORS.success : line.tone === 'warn' ? COLORS.warning : COLORS.secondary, display: 'flex', fontSize: 13, fontWeight: 600, gap: 7 }}>
                {line.tone === 'warn' ? <AlertTriangle size={14} /> : line.tone === 'ok' ? <Check size={14} /> : null}{line.text}
              </span>
            );
          })()}
          {qa.status !== 'applied' && (qa.scenes || []).length && duration ? <SceneTimeline qa={qa} duration={duration} onSeek={onSeek} /> : null}
          {qa.status !== 'applied' && findings.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: COLORS.muted, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Findings by scene</span>
              {findings.map((finding, index) => <FindingRow key={`${finding.t}-${index}`} finding={finding} onSeek={onSeek} />)}
            </div>
          ) : null}
          {qa.status !== 'applied' && proposed.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ color: COLORS.muted, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Proposed fixes</span>
              {proposed.map((fix) => (
                <FixRow key={fix.id} fix={fix} choice={choices[fix.id!]} locked={Boolean(busy)} onChoose={(value) => setChoices((current) => { const next = { ...current }; if (next[fix.id!] === value) delete next[fix.id!]; else next[fix.id!] = value; return next; })} />
              ))}
              {open.length && onFixes ? (
                <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button type="button" disabled={Boolean(busy) || (!approveIds.length && !ignoreIds.length)} onClick={() => onFixes(approveIds, ignoreIds)} style={{ alignItems: 'center', background: approveIds.length ? GOLD_BUTTON_BG : SOFT_BUTTON_BG, border: 'none', borderRadius: RADIUS.sm, color: approveIds.length ? COLORS.onAccent : COLORS.text, cursor: busy ? 'wait' : 'pointer', display: 'flex', fontFamily: FONT.heading, fontSize: 13.5, fontWeight: 700, gap: 7, minHeight: 44, opacity: !approveIds.length && !ignoreIds.length ? 0.55 : 1, padding: '0 16px' }} data-testid="button-qa-apply">
                    {busy === 'qa-fixes' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                    {approveIds.length ? `Apply ${approveIds.length} approved fix${approveIds.length === 1 ? '' : 'es'}` : 'Save choices'}
                  </button>
                  <span style={{ color: COLORS.muted, fontSize: 12 }}>{approveIds.length ? 'Re-renders the edit with only the approved fixes — no new charge. This video stays in your history.' : 'Nothing changes until you approve a fix.'}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {qa.original_url ? (
            <a href={qa.original_url} target="_blank" rel="noopener noreferrer" style={{ alignItems: 'center', color: COLORS.secondary, display: 'flex', fontSize: 12.5, gap: 6, width: 'fit-content' }}>
              <ExternalLink size={13} /> Open the original video (before QA fixes)
            </a>
          ) : null}
          {onRun ? <RunButton label="Run QA audit again" busy={busy === 'run-qa'} disabled={!canRun} onClick={onRun} primary={false} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Compact QA report for the Stage results screen, next to the rendered outputs. */
export function QaReportCard({ project, busy, onRun }: { project: ForgeProject; busy: string | null; onRun?: () => void }) {
  const { qa, optIn, running } = qaAuditState(project);
  const canRun = project.status === 'done' && Boolean(project.final_video_url) && Boolean(onRun);
  const findings = (qa?.findings || []).filter((f) => !f.pass && f.issues.length);
  const openFixes = (qa?.proposed || []).filter((fix) => fix.status === 'proposed').length;
  return (
    <div style={{ ...SOFT_INSET, display: 'grid', gap: 10, padding: 12 }} data-testid="sceneforge-qa-report">
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <ShieldCheck size={15} color={COLORS.accent} />
        <strong style={{ color: COLORS.text, fontFamily: FONT.heading, fontSize: 14 }}>QA report</strong>
        <span style={{ color: COLORS.muted, fontSize: 11.5 }}>Rendered video</span>
      </div>
      {!optIn ? (
        <>
          <span style={{ color: COLORS.secondary, fontSize: 12.5, lineHeight: '18px' }}>QA has not been run on this render. It is optional and uses no credits.</span>
          {onRun ? <RunButton label="Run QA audit" busy={busy === 'run-qa'} disabled={!canRun} onClick={onRun} /> : null}
        </>
      ) : running && qa ? (
        <Progress qa={qa} />
      ) : qa ? (
        <>
          {(() => {
            const line = statusLine(qa);
            return <span style={{ color: line.tone === 'ok' ? COLORS.success : line.tone === 'warn' ? COLORS.warning : COLORS.secondary, fontSize: 12.5, fontWeight: 600, lineHeight: '18px' }}>{line.text}</span>;
          })()}
          {qa.status !== 'applied' && findings.length ? (
            <ul style={{ color: COLORS.secondary, display: 'grid', fontSize: 12.5, gap: 4, lineHeight: '18px', margin: 0, paddingLeft: 18 }}>
              {findings.slice(0, 5).map((finding, index) => (
                <li key={index}>{formatClock(finding.t)}{finding.beat ? ` · ${sceneLabel(finding.beat.type)}` : ''} — {finding.issues.map((issue) => issueLabel(issue.type)).join(', ')}</li>
              ))}
              {findings.length > 5 ? <li>…and {findings.length - 5} more</li> : null}
            </ul>
          ) : null}
          {qa.status !== 'applied' && openFixes ? <span style={{ color: COLORS.muted, fontSize: 12 }}>{openFixes} proposed fix{openFixes === 1 ? '' : 'es'} waiting for your approval in the video preview.</span> : null}
          {qa.finished_at ? <span style={{ color: COLORS.muted, fontSize: 11.5 }}>Checked {new Date(qa.finished_at).toLocaleString()}</span> : null}
          {onRun ? <RunButton label="Run again" busy={busy === 'run-qa'} disabled={!canRun} onClick={onRun} primary={false} /> : null}
        </>
      ) : null}
    </div>
  );
}
