/**
 * AgentChatPanel — the slide-in agent chat surface (right side, full height).
 * 340px on desktop, full width on small screens, with a dark backdrop.
 * Shows live ThinkingSteps above the thread while the agent is working.
 */
import { useEffect, useRef, useState } from 'react';
import { GradientOrb } from './GradientOrb';
import { ThinkingSteps } from './ThinkingSteps';
import { useAgentChat } from './AgentChatContext';

const PANEL_CSS = `
.vv-agent-panel { transition: transform 0.3s cubic-bezier(0.32, 0.72, 0.22, 1); }
.vv-agent-backdrop { transition: opacity 0.3s ease; }
.vv-agent-send:hover:not(:disabled) { background: var(--vg-btn-hover) !important; }
.vv-agent-send:active:not(:disabled) { background: var(--vg-btn-pressed) !important; }
.vv-agent-input:focus { border-color: var(--vg-focus) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-focus) 15%, transparent); outline: none; }
@media (max-width: 480px) { .vv-agent-panel { width: 100vw !important; } }
`;

export function AgentChatPanel() {
  const { isOpen, closePanel, messages, thinkingSteps, isThinking, appContext, sendMessage } = useAgentChat();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinkingSteps, isOpen]);

  const submit = () => {
    const text = draft.trim();
    if (!text || isThinking) return;
    setDraft('');
    void sendMessage(text);
  };

  return (
    <>
      <style>{PANEL_CSS}</style>
      {isOpen ? (
        <div
          className="vv-agent-backdrop"
          onClick={closePanel}
          style={{ position: 'fixed', inset: 0, zIndex: 9997, background: 'rgba(0, 0, 0, 0.55)' }}
        />
      ) : null}
      <aside
        className="vv-agent-panel"
        aria-hidden={!isOpen}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9998, width: 340, maxWidth: '100vw',
          display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
          background: 'var(--vg-surface)', borderLeft: '1px solid var(--vg-border)',
          boxShadow: '-18px 0 50px rgba(0, 0, 0, 0.5)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--vg-border)', flexShrink: 0 }}>
          <GradientOrb size="sm" thinking={isThinking} idle={!isThinking} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--vg-text)', fontSize: 14, fontWeight: 700 }}>Vidverge Agent</div>
            <div style={{ color: 'var(--vg-muted)', fontSize: 11 }}>{appContext.appName}</div>
          </div>
          <button
            type="button"
            onClick={closePanel}
            aria-label="Close agent chat"
            style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 9, border: '1px solid var(--vg-border)', background: 'transparent', color: 'var(--vg-secondary)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </header>

        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!messages.length ? (
            <div style={{ borderRadius: 14, border: '1px solid var(--vg-border)', background: 'var(--vg-gold-tint)', padding: '14px 14px', color: 'var(--vg-secondary)', fontSize: 12.5, lineHeight: 1.6 }}>
              Hi — I'm the Vidverge Agent. Tell me what you want to make and I'll fill in the fields and kick off the work in <strong style={{ color: 'var(--vg-text)' }}>{appContext.appName}</strong> for you.
            </div>
          ) : null}
          {messages.map((m) => (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.role === 'assistant' && m.thinkingSteps?.length ? (
                <div style={{ alignSelf: 'stretch' }}><ThinkingSteps steps={m.thinkingSteps} /></div>
              ) : null}
              {m.content ? (
                m.role === 'user' ? (
                  <div style={{ maxWidth: '85%', borderRadius: '14px 14px 4px 14px', background: 'var(--vg-gold-tint)', color: 'var(--vg-text)', padding: '9px 12px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.content}
                  </div>
                ) : (
                  <div style={{ maxWidth: '92%', borderRadius: 14, padding: 1, background: 'var(--line-gold)' }}>
                    <div style={{ borderRadius: 13, background: 'var(--vg-raised)', color: 'var(--vg-text)', padding: '9px 12px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.content}
                    </div>
                  </div>
                )
              ) : null}
            </div>
          ))}
          {isThinking ? <ThinkingSteps steps={thinkingSteps} isStreaming /> : null}
        </div>

        <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--vg-border)', flexShrink: 0 }}>
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask the agent…"
              className="vv-agent-input"
              style={{ flex: 1, minWidth: 0, borderRadius: 11, border: '1px solid var(--vg-control-border)', background: 'var(--vg-bg)', color: 'var(--vg-text)', padding: '10px 12px', fontSize: 13, boxSizing: 'border-box' }}
            />
            <button
              type="submit"
              disabled={isThinking || !draft.trim()}
              className="vv-agent-send"
              style={{ borderRadius: 11, border: 'none', padding: '0 16px', fontSize: 13, fontWeight: 700, color: 'var(--vg-on-btn)', cursor: isThinking || !draft.trim() ? 'default' : 'pointer', opacity: isThinking || !draft.trim() ? 0.55 : 1, background: 'var(--vg-btn)' }}
            >
              Send
            </button>
          </form>
          <div style={{ marginTop: 7, color: 'var(--vg-muted)', fontSize: 10.5, textAlign: 'center' }}>
            Agent can fill fields and trigger actions for you
          </div>
        </div>
      </aside>
    </>
  );
}

export default AgentChatPanel;
