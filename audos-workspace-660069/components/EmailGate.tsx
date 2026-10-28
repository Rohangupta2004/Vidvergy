import { useState, useEffect, useRef } from 'react';
import { useSpaceRuntime } from '../SpaceRuntimeContext';
import VergeLoader from './VergeLoader';
import FreeVideoAnalyzer from './FreeVideoAnalyzer';
import { saveVidvergeHandoff } from '../lib/vidvergeHandoff';
import type { DesktopThemeTokens } from '../types';

// Version marker for auto-upgrade detection
// Increment this when making breaking changes that stale copies need
export const EMAIL_GATE_VERSION = 125; // v125: email one-time code restored; unverified sessions are never accepted

type ParsedResponseBody = { data: unknown; rawText: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCanonicalWorkspaceSession(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('wses_');
}

// Globals the host page injects. Typed so the gate never needs `any`.
type AudosWindow = Window & {
  __WORKSPACE_ID__?: string;
  __GDPR_ENABLED__?: boolean;
  __GUEST_MODE_ENABLED__?: boolean;
  __SOCIAL_PROVIDERS__?: unknown;
  __META_PIXEL_ID__?: string | number;
  __REDDIT_PIXEL_ID__?: string | number;
  __AUDOS_FORCE_VISITOR__?: boolean;
  __audosAcceptedSessionId?: string;
  __spaceSessionId?: string;
  __SESSION_ID__?: string;
  __workspaceDb?: { setSessionId?: (id: string) => void };
  __audosTrackMetaEvent?: (event: string, payload: Record<string, unknown>) => string | undefined;
  fbq?: (...args: unknown[]) => void;
  rdt?: (...args: unknown[]) => void;
};

const audosWindow = (): AudosWindow => window as AudosWindow;

/**
 * Hand a freshly server-accepted session to the injected data runtime before
 * rendering any app. The marker prevents stale localStorage values from being
 * mistaken for authenticated sessions on later reads in the same tab.
 */
function acceptDataSession(sessionId: string): void {
  const runtimeWindow = audosWindow();
  runtimeWindow.__audosAcceptedSessionId = sessionId;
  runtimeWindow.__spaceSessionId = sessionId;
  runtimeWindow.__SESSION_ID__ = sessionId;
  runtimeWindow.__workspaceDb?.setSessionId?.(sessionId);
}

// Parses a fetch Response body safely so a 5xx HTML page (proxy timeout,
// memory-crash restart, etc.) does not throw inside `response.json()` and
// get swallowed into the generic "Connection error" copy. Always returns
// an object instead of throwing — callers inspect `response.ok` themselves.
async function parseResponseBody(response: Response): Promise<ParsedResponseBody> {
  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    return { data: null, rawText: '' };
  }

  if (!rawText) {
    return { data: null, rawText: '' };
  }

  try {
    return { data: JSON.parse(rawText) as unknown, rawText };
  } catch {
    return { data: null, rawText };
  }
}

// Pick the most informative error message we can show to the user given
// what came back over the wire. Server-provided `error` always wins; for
// unparseable / non-JSON responses we expose the HTTP status so the bug
// is debuggable instead of being hidden behind "Connection error".
function describeResponseFailure(
  response: Response,
  body: unknown,
  rawText: string,
  fallback: string,
): string {
  if (isRecord(body)) {
    const errField = body.error;
    if (typeof errField === 'string' && errField.trim()) return errField;
    const msgField = body.message;
    if (typeof msgField === 'string' && msgField.trim()) return msgField;
  }

  const status = response.status;
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is temporarily unavailable. Please try again in a moment.';
  }
  if (status >= 500) return `Server error (${status}). Please try again.`;
  if (status === 404) return 'This space could not be found. Please contact support.';
  if (status === 403) return 'This email is not authorized to access this space.';
  if (status === 400 && rawText) {
    // Sometimes the server returns a plain text 400; surface a trimmed copy
    const snippet = rawText.trim().slice(0, 140);
    if (snippet) return snippet;
  }

  return fallback;
}

// Snapshot of the JSON envelope returned by /api/space/:spaceId/register.
// All fields are optional because the server has historically added/removed
// keys; the client narrows individually before use.
interface SpaceRegisterResponseBody {
  success?: boolean;
  workspaceSessionId?: string | null;
  canonicalSessionId?: string | null;
  provisionalSessionToken?: string;
  otpRequired?: boolean;
  legacyAuthorized?: boolean;
  identityMode?: string;
  sessionVerified?: boolean;
  verified?: boolean;
  contactId?: string;
  email?: string;
  isReturningUser?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  visitorId?: string | null;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

interface EmailGateProps {
  spaceId: string;
  branding?: {
    name?: string;
    tagline?: string;
    logoUrl?: string;
  };
  themeTokens?: DesktopThemeTokens;
}

type PendingOtp = {
  email: string;
  workspaceId: string;
  provisionalSessionToken: string;
};

type GateStep = 'loading' | 'email' | 'otp' | 'complete';

// ── Vidverge landing design system ──────────────────────────────────────
// Presentation only for the SIGNED-OUT view. The dark-cosmic ground with
// layered dark-gold studio light, mirroring components/theme.ts so the gate and
// the shell behind it read as one product. No rainbow gradients, no pastels,
// no white surfaces anywhere.
const BG = '#101214';
const BG_DEEP = '#101214';
const CARD = '#171A1E';
const LINE = '#343A43';
const BRAND = '#D9A441';
const BRAND_HI = '#E5B75A';
/** Text sitting on a BRAND-filled surface. */
const INK = '#17120A';
const TEXT = '#F4F5F7';
const MUTED = '#C4C9D0';
const DIM = '#9AA3AF';
const BRAND_GLOW = 'none';
const MONO = "ui-monospace, 'SFMono-Regular', Consolas, monospace";
const FONT = "'Manrope', 'Segoe UI', sans-serif";
const CONTAINER = 1180;

// ── Section 3 · Finished customer renders ───────────────────────────────
// Real published MP4s produced inside Vidverge. Hardcoded on purpose: the
// landing page performs no database read.
// `ratio` and `railWidth` mirror each finished file’s real pixel dimensions, so
// a frame never letterboxes the footage it holds. Rail widths are chosen to
// give every tile in a row the same height (~280px).
type GalleryItem = { title: string; url: string; ratio: string; railWidth: number };
type GallerySection = {
  app: string;
  blurb: string;
  items: GalleryItem[];
};

const GALLERY: GallerySection[] = [
  {
    app: 'Faceless Content',
    blurb: 'Narrated, archive-grade shorts with no camera and no face.',
    items: [
      {
        title: 'The 7 Shipwrecks',
        url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1791266089359.mp4',
        ratio: '16 / 9',
        railWidth: 498,
      },
      {
        title: 'The Byzantine Bureaucracy',
        url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1790851696192.mp4',
        ratio: '16 / 9',
        railWidth: 498,
      },
      {
        title: 'The Great Emu War',
        url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1790842437622.mp4',
        ratio: '16 / 9',
        railWidth: 498,
      },
    ],
  },
  {
    app: 'Script-to-Video',
    blurb: 'A written script in, a shot-matched cinematic cut out.',
    items: [
      {
        title: 'The Discovery',
        url: 'https://storage.googleapis.com/audos-images/uploads/s2v/db7f2cdc-d92b-4140-a047-baeff2f50f48.mp4',
        ratio: '16 / 9',
        railWidth: 498,
      },
      {
        title: 'FineGlaze — Monsoon Facade Leakage',
        url: 'https://storage.googleapis.com/audos-images/videos/f24710e5-7c6d-4db4-92b4-c2c235877575_stitched_1790966536543.mp4',
        ratio: '16 / 9',
        railWidth: 498,
      },
      {
        title: 'B.E.E.F. Basketball Shooting Form',
        url: 'https://storage.googleapis.com/audos-images/uploads/s2v/f552955a-bd54-41ba-b0c0-b1306adae2a6.mp4',
        ratio: '9 / 16',
        railWidth: 158,
      },
    ],
  },
  // The Product Video (Clip Style) row is held back on purpose. Its only
  // finished render — 'Audos — Record Label For Founders',
  // remotioncloudrun-29i6x7bt7e/renders/4d1de4a8-eabd-44ba-a802-0a9c81c82026/out.mp4
  // — is a 1080×1350 file whose picture is black for all 39 seconds (audio
  // only; every sampled frame reads luma 0). Re-render it, then restore the
  // section here with ratio '4 / 5' and railWidth 224.
  {
    app: 'Product Launch',
    blurb: 'Launch films cut for the day you ship.',
    items: [
      {
        title: 'VicharakAI',
        url: 'https://storage.googleapis.com/remotioncloudrun-29i6x7bt7e/renders/03ad1f56-7dc0-420c-b6ec-46b872811515/out.mp4',
        ratio: '16 / 9',
        railWidth: 498,
      },
    ],
  },
];

const HERO_VIDEO = GALLERY[0].items[0]; // The 7 Shipwrecks — 1280×720
const HERO_INSET = GALLERY[1].items[2]; // B.E.E.F. Shooting Form — 720×1280

// Kept for other surfaces that resolve a landing clip by slot. Every entry now
// points at a finished customer render — no generated placeholders.
type MotionClipSlot =
  | 'hero'
  | 'feature-consistency'
  | 'feature-script'
  | 'feature-vfx'
  | 'step-1'
  | 'step-2'
  | 'step-3'
  | 'reel-1'
  | 'reel-2'
  | 'reel-3'
  | 'reel-4'
  | 'reel-5'
  | 'reel-6'
  | 'final-cta';

type PlaceholderClip = { slot: MotionClipSlot; url: string; poster?: string };

export const PLACEHOLDER_CLIPS: PlaceholderClip[] = [
  { slot: 'hero', url: HERO_VIDEO.url },
  { slot: 'feature-consistency', url: GALLERY[0].items[0].url },
  { slot: 'feature-script', url: GALLERY[1].items[0].url },
  { slot: 'feature-vfx', url: GALLERY[1].items[1].url },
  { slot: 'step-1', url: GALLERY[1].items[2].url },
  { slot: 'step-2', url: GALLERY[0].items[1].url },
  { slot: 'step-3', url: GALLERY[2].items[0].url },
  { slot: 'reel-1', url: GALLERY[0].items[0].url },
  { slot: 'reel-2', url: GALLERY[0].items[1].url },
  { slot: 'reel-3', url: GALLERY[0].items[2].url },
  { slot: 'reel-4', url: GALLERY[1].items[0].url },
  { slot: 'reel-5', url: GALLERY[1].items[1].url },
  { slot: 'reel-6', url: GALLERY[1].items[2].url },
  { slot: 'final-cta', url: GALLERY[2].items[0].url },
];

// ── Section 4 · The five studio families ─────────────────────────────────
// `shot` is a dark-mode interface still of the studio it labels.
type Studio = { tag: string; name: string; benefit: string; shot: string; shotAlt: string };

const STUDIOS: Studio[] = [
  {
    tag: 'Characters',
    name: 'SceneForge',
    benefit: 'Character-consistent scenes, automatically.',
    shot: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-660069/img-1791363321293-q7cszf.jpg',
    shotAlt: 'SceneForge storyboard with a locked character across six scenes',
  },
  {
    tag: 'Scripts',
    name: 'Script-to-Video',
    benefit: 'Your script. Real cinematic shots.',
    shot: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-660069/img-1791363358483-l4f82h.jpg',
    shotAlt: 'Script-to-Video editor with a shot list beside the script',
  },
  {
    tag: 'Shorts',
    name: 'Faceless Content',
    benefit: 'Viral-ready videos, no face needed.',
    shot: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-660069/img-1791363398484-nrei5j.jpg',
    shotAlt: 'Faceless Content editor with a vertical preview and narration timeline',
  },
  {
    tag: 'Commerce',
    name: 'Product Video',
    benefit: 'URL in, product video out.',
    shot: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-660069/img-1791363434232-n7g9ft.jpg',
    shotAlt: 'Product Video studio parsing a product URL into a shot plan',
  },
  {
    tag: 'Intel → Ads',
    name: 'Vergeye Ads Studio',
    benefit: 'Research competitors, rank creative angles, approve briefs, then create in one flow.',
    shot: 'https://storage.googleapis.com/audos-images/generated-images/agent/workspace-660069/img-1791363514872-2w5o8i.jpg',
    shotAlt: 'Vergeye Ads Studio competitive intelligence dashboard and creative workflow',
  },
];

// ── Section 5 · Pricing ─────────────────────────────────────────────────
type Plan = {
  name: string;
  price: string;
  period: string;
  credits: string;
  features: string[];
  cta: string;
  featured: boolean;
  badge?: string;
};

const PLANS: Plan[] = [
  {
    name: 'Free Trial',
    price: '$0',
    period: 'to start',
    credits: '60 credits',
    features: ['No card required', 'Every studio unlocked', 'Watermarked export'],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Creator',
    price: '$35',
    period: 'per month',
    credits: '250 credits',
    features: ['Credits roll over', 'No watermark', 'Priority rendering'],
    cta: 'Get Creator',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$70',
    period: 'per month',
    credits: '500 credits',
    features: ['Credits roll over', 'Fastest render queue', 'Vergeye competitive reports'],
    cta: 'Get Pro',
    featured: true,
    badge: 'Most Popular',
  },
  {
    name: 'Pay-as-you-go',
    price: '$9',
    period: 'one-time',
    credits: '60 credits',
    features: ['No cap, no subscription', 'Credits never expire', 'Top up any time'],
    cta: 'Buy credits',
    featured: false,
  },
];

const PROOF_STATS: Array<{ value: string; label: string }> = [
  { value: '5', label: 'studio families, one login' },
  { value: '0', label: 'character drift' },
  { value: '1s', label: 'of video per credit' },
];

// ── Injected CSS (keyframes, beams, hovers, responsive grids) ───────────
const GATE_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap');
h1,h2,h3,h4 { font-family:'Space Grotesk','Segoe UI',sans-serif; font-synthesis:none; }
@keyframes vvFadeUp { from { opacity:0; transform:translateY(34px); } to { opacity:1; transform:translateY(0); } }
@keyframes vvPulse { 0%,100% { opacity:.5; } 50% { opacity:1; } }
@keyframes vvFieldA { 0%,100% { transform:translate3d(-1.4%,-1%,0) scale(1.04); } 50% { transform:translate3d(1.4%,1%,0) scale(1.09); } }
@keyframes vvFieldB { 0%,100% { transform:translate3d(1.8%,.8%,0) scale(1.08); } 50% { transform:translate3d(-1.8%,-.8%,0) scale(1.03); } }
@keyframes vvFieldC { 0%,100% { transform:translate3d(0,1.2%,0) scale(1.05); } 50% { transform:translate3d(0,-1.2%,0) scale(1.10); } }
@keyframes vvBootIn { to { opacity:1; } }

/* Logo light field: the Vidverge "V" itself — swooping amber filaments with a
   hot core — blown up and drifting slowly behind EVERY section. Fixed to the
   viewport so it backs the whole page rather than just the hero. */
.vv-field { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
.vv-field::after {
  content:''; position:absolute; inset:0;
  background:radial-gradient(1300px 820px at 50% 42%, transparent 0%, rgba(8,9,11,.26) 62%, rgba(8,9,11,.64) 100%);
}
.vv-layer { position:absolute; inset:0; width:100%; height:100%; mix-blend-mode:screen; will-change:transform; }
.vv-field-a, .vv-field-b, .vv-field-c { animation:none; }
.vv-bloom {
  position:absolute; left:50%; top:44%; width:min(1020px, 94vw); height:min(620px, 56vw);
  transform:translate(-50%,-50%);
  background:radial-gradient(closest-side, rgba(255,209,104,.17), rgba(214,171,74,.05) 50%, transparent 74%);
  filter:blur(26px); animation:none;
}

/* Session check in flight: fade the loader in a beat late so a cached session
   resolves straight into the app without flashing a spinner. */
.vv-boot { opacity:0; animation:vvBootIn .45s ease .18s forwards; }

.vv-reveal { opacity:0; }
.vv-reveal.vv-in { animation:vvFadeUp .6s cubic-bezier(.16,1,.3,1) forwards; }

.vv-cta { min-height:44px; background:linear-gradient(115deg,#E69A24 0%,#F8C85C 52%,#FFDF8F 100%); color:${INK}; font-weight:600; border:none; border-radius:10px; cursor:pointer; transition:background .12s cubic-bezier(.2,0,0,1),transform .12s cubic-bezier(.2,0,0,1); }
.vv-cta:hover:not(:disabled) { background:linear-gradient(115deg,#F0AC3C 0%,#FFD477 52%,#FFE8AE 100%); }
.vv-cta:active:not(:disabled) { background:#D69529; transform:translateY(1px); }
.vv-ghost { min-height:44px; background:${CARD}; border:1px solid #747D8B; color:${TEXT}; border-radius:10px; cursor:pointer; font-weight:600; transition:background .12s cubic-bezier(.2,0,0,1); }
.vv-ghost:hover:not(:disabled) { background:#2A2E35; }
.vv-navcta { min-height:44px; border:1px solid #747D8B; background:${CARD}; color:${TEXT}; border-radius:10px; cursor:pointer; font-weight:600; transition:background .12s cubic-bezier(.2,0,0,1); }
.vv-navcta:hover { background:#2A2E35; }
.vv-navlink { color:${MUTED}; background:none; border:none; cursor:pointer; font-size:13px; font-weight:500; transition:color .18s ease; text-decoration:none; }
.vv-navlink:hover { color:${TEXT}; }
.vv-input::placeholder { color:#4B5563; }
.vv-input:focus { border-color:${BRAND} !important; box-shadow:0 0 0 3px rgba(214,171,74,.2) !important; outline:none; }
.vv-link { color:${MUTED}; text-decoration:none; transition:color .18s ease; }
.vv-link:hover { color:${BRAND_HI}; }

.vv-card { background:${CARD}; border:1px solid ${LINE}; border-radius:12px; }
.vv-studio { transition:transform .22s ease, border-color .22s ease, box-shadow .22s ease; }
.vv-studio:hover { transform:translateY(-3px); border-color:rgba(214,171,74,.4); box-shadow:0 18px 48px rgba(0,0,0,.55); }
.vv-tile { transition:transform .22s ease, box-shadow .22s ease; }
.vv-tile:hover { transform:translateY(-3px); box-shadow:${BRAND_GLOW}; }

.vv-rail { display:flex; gap:18px; overflow-x:auto; scroll-snap-type:x proximity; padding:4px 2px 16px; -webkit-overflow-scrolling:touch; }
.vv-rail > * { scroll-snap-align:start; flex:0 0 auto; }
.vv-rail::-webkit-scrollbar { height:6px; }
.vv-rail::-webkit-scrollbar-track { background:rgba(255,255,255,.04); border-radius:999px; }
.vv-rail::-webkit-scrollbar-thumb { background:rgba(214,171,74,.35); border-radius:999px; }

.vv-hero { display:grid; grid-template-columns:1.02fr .98fr; gap:56px; align-items:center; }
.vv-studios { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
.vv-pricing { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; }
.vv-concierge { display:grid; grid-template-columns:1.5fr .9fr; gap:30px; align-items:center; }
.vv-proof { display:flex; align-items:center; justify-content:center; gap:34px; flex-wrap:wrap; }

@media (max-width:1024px) {
  .vv-studios { grid-template-columns:repeat(2,1fr); }
  .vv-pricing { grid-template-columns:repeat(2,1fr); }
}
@media (max-width:860px) {
  .vv-hero { grid-template-columns:1fr; gap:44px; }
  .vv-hero-visual { display:none; }
}
@media (max-width:768px) {
  .vv-navlinks { display:none !important; }
  .vv-studios, .vv-pricing, .vv-concierge { grid-template-columns:1fr; }
  .vv-proof { gap:18px; }
}
@media (prefers-reduced-motion: reduce) {
  .vv-reveal, .vv-reveal.vv-in { animation:none !important; opacity:1 !important; }
  .vv-layer, .vv-bloom { animation:none !important; }
  .vv-boot { animation:none !important; opacity:1 !important; }
}
`;

// Scroll-reveal wrapper (fadeInUp) driven by an IntersectionObserver.
// Module-level so typing in the gate modal never remounts it.
const Reveal = ({
  children,
  reduceMotion,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  reduceMotion: boolean;
  delay?: number;
  style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (reduceMotion) { setShown(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { setShown(true); io.disconnect(); break; }
      }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);
  return (
    <div ref={ref} className={`vv-reveal${shown ? ' vv-in' : ''}`} style={{ animationDelay: `${delay}s`, ...style }}>
      {children}
    </div>
  );
};

// The logo used as an ambient light rig. Each layer redraws the mark’s
// swooping "V" filaments at page scale — a soft blurred halo beneath a thin
// hot core, which is how the logo itself is built — and drifts on its own slow
// cycle. Pure SVG + CSS: no animation library, no 3D.
type FieldLayer = { d: string; w: number; blur: number; glow: number; core: number; drift: string };

const FIELD_LAYERS: FieldLayer[] = [
  { d: 'M -160 236 C 420 242, 574 352, 720 566 C 866 352, 1020 242, 1600 236', w: 2, blur: 7, glow: 0.13, core: 0.17, drift: 'vv-field-c' },
  { d: 'M -160 292 C 404 298, 560 418, 720 648 C 880 418, 1036 298, 1600 292', w: 3, blur: 11, glow: 0.15, core: 0.2, drift: 'vv-field-a' },
  { d: 'M -160 350 C 388 356, 548 486, 720 734 C 892 486, 1052 356, 1600 350', w: 2.2, blur: 9, glow: 0.11, core: 0.14, drift: 'vv-field-b' },
  { d: 'M -160 410 C 372 416, 534 556, 720 822 C 906 556, 1068 416, 1600 410', w: 1.6, blur: 8, glow: 0.08, core: 0.1, drift: 'vv-field-a' },
];

const LightField = () => (
  <div className="vv-field" aria-hidden>
    <div className="vv-bloom" />
    {FIELD_LAYERS.map((layer, index) => (
      <svg
        key={layer.d}
        className={`vv-layer ${layer.drift}`}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ animationDelay: `${index * -7}s` }}
      >
        <defs>
          <linearGradient id={`vvFieldGrad${index}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#D6AB4A" stopOpacity="0" />
            <stop offset="20%" stopColor="#D6AB4A" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#F3D58B" stopOpacity="1" />
            <stop offset="80%" stopColor="#FFE8AB" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#D6AB4A" stopOpacity="0" />
          </linearGradient>
          <filter id={`vvFieldBlur${index}`} x="-10%" y="-45%" width="120%" height="190%">
            <feGaussianBlur stdDeviation={layer.blur} />
          </filter>
        </defs>
        <path
          d={layer.d}
          fill="none"
          strokeLinecap="round"
          stroke={`url(#vvFieldGrad${index})`}
          strokeWidth={layer.w * 6}
          opacity={layer.glow}
          filter={`url(#vvFieldBlur${index})`}
        />
        <path
          d={layer.d}
          fill="none"
          strokeLinecap="round"
          stroke={`url(#vvFieldGrad${index})`}
          strokeWidth={layer.w}
          opacity={layer.core}
        />
      </svg>
    ))}
  </div>
);

/**
 * Viewport-gated looping video. The `src` is only attached once the element
 * nears the viewport, so nothing below the fold downloads on first paint, and
 * playback pauses again as soon as the tile scrolls away.
 */
const ViewportVideo = ({
  src,
  reduceMotion,
  style,
}: {
  src: string;
  reduceMotion: boolean;
  style?: React.CSSProperties;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLVideoElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setArmed(true);
        if (reduceMotion) continue;
        const el = ref.current;
        if (!el) continue;
        if (entry.intersectionRatio >= 0.25) {
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      }
    }, { threshold: [0, 0.25], rootMargin: '280px 0px' });
    io.observe(host);
    return () => io.disconnect();
  }, [reduceMotion]);

  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <video
        ref={ref}
        src={armed ? src : undefined}
        autoPlay={!reduceMotion}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        onLoadedData={() => setReady(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          background: BG_DEEP,
          ...style,
        }}
      />
      {/* Branded wait between a tile arming and its first decoded frame. */}
      {armed && !ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <VergeLoader size={76} label="Loading clip" />
        </div>
      )}
    </div>
  );
};

// Dark device frame shared by every clip on the page.
const VideoFrame = ({
  src,
  reduceMotion,
  width,
  aspect,
}: {
  src: string;
  reduceMotion: boolean;
  width: number | string;
  aspect: string;
}) => (
  <div
    className="vv-tile"
    style={{
      width,
      maxWidth: '100%',
      aspectRatio: aspect,
      borderRadius: 20,
      overflow: 'hidden',
      background: BG_DEEP,
      border: `1px solid ${LINE}`,
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.02), 0 20px 46px rgba(0,0,0,.5)',
    }}
  >
    <ViewportVideo src={src} reduceMotion={reduceMotion} />
  </div>
);

export default function EmailGate({ spaceId, branding }: EmailGateProps) {
  const { sessionId, setSessionId, subscriptionReady, updateSubscription } = useSpaceRuntime();
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [pendingOtp, setPendingOtp] = useState<PendingOtp | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<GateStep>('loading');
  const [marketingConsent, setMarketingConsent] = useState(false);
  // Reduced-motion visitors get still frames: looping clips and beams stop.
  const [reduceMotion, setReduceMotion] = useState(false);
  // Gate modal: opened by the nav, pricing and concierge CTAs. The hero keeps
  // the signup form inline, so the modal is a second entry point, not the only one.
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMode, setGateMode] = useState<'start' | 'concierge'>('start');
  const [scrolled, setScrolled] = useState(false);

  // Presentation refs (no bearing on authentication).
  const heroEmailInputRef = useRef<HTMLInputElement | null>(null);
  const modalEmailInputRef = useRef<HTMLInputElement | null>(null);

  // Get workspaceId from window context
  const workspaceId = audosWindow().__WORKSPACE_ID__ || null;
  const gdprEnabled = !!audosWindow().__GDPR_ENABLED__;
  const guestModeEnabled = !!audosWindow().__GUEST_MODE_ENABLED__;
  const rawSocialProviders = audosWindow().__SOCIAL_PROVIDERS__;
  const socialProviders: string[] = Array.isArray(rawSocialProviders)
    ? rawSocialProviders.filter((provider): provider is string => typeof provider === 'string')
    : [];

  useEffect(() => {
    storeAttribution();
    checkExistingSession();
  }, [spaceId]);

  useEffect(() => {
    if (resendWait <= 0) return;
    const timer = window.setInterval(() => {
      setResendWait((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendWait]);

  // `autoPlay` ignores prefers-reduced-motion, so the preference is tracked
  // here and every clip reads it. Older Safari lacks addEventListener on
  // MediaQueryList, hence the guarded calls.
  useEffect(() => {
    let media: MediaQueryList | null = null;
    try {
      media = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    if (!media) return;
    setReduceMotion(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    try {
      media.addEventListener?.('change', onChange);
    } catch {}
    return () => {
      try {
        media?.removeEventListener?.('change', onChange);
      } catch {}
    };
  }, []);

  // Frost the nav once the visitor scrolls past the first slice of the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the gate modal on Escape.
  useEffect(() => {
    if (!gateOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGateOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gateOpen]);

  // SpaceRuntime clears subscription state for email-less sessions. Restore the
  // intentional workspace-wide Pro entitlement after that initialization pass.
  useEffect(() => {
    if (!sessionId || !subscriptionReady) return;
    updateSubscription({
      status: 'active',
      planTier: 'pro',
      email: null,
      stripeCustomerId: null,
      subscriptionId: null,
      trialDaysRemaining: 0,
      trialDays: 0,
      trialExpired: false,
      hasPaymentMethod: true,
      contactId: null,
      manualOverride: null,
    });
  }, [sessionId, subscriptionReady, updateSubscription]);

  // Pre-fill email from localStorage when loaded inside the onboarding walkthrough
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('walkthrough') === 'true') {
      const storedEmail = localStorage.getItem('user_email');
      if (storedEmail) setEmail(storedEmail);
    }
  }, []);

  const checkExistingSession = async () => {
    const sessionKey = `space_session_${spaceId}`;
    let storedSessionId: string | null = null;
    let storedEmail: string | null = null;
    let storedEmailSession = false;

    try {
      const existingSession = localStorage.getItem(sessionKey);
      const parsed: unknown = existingSession ? JSON.parse(existingSession) : null;
      const session = isRecord(parsed) ? parsed : null;
      storedSessionId = session
        ? [session.workspaceSessionId, session.sessionId, session.id].find(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ) ?? null
        : null;
      storedEmail = session && typeof session.email === 'string' ? session.email : null;
      storedEmailSession = session?.verified === true || (
        session?.authorized === true && session?.identityMode === 'legacy_registration'
      );

      // Stored email sessions are proposals until check-session confirms them
      // against the platform’s HttpOnly cookie and current OTP policy below.

      // A guest session holds no account, no credits and no history, so it was
      // never behind the code.
      if (storedSessionId && storedSessionId.startsWith('guest_')) {
        acceptDataSession(storedSessionId);
        setSessionId(storedSessionId);
        setStep('complete');
        return;
      }

      // Ids invented in the browser (notably the old pro_* flow), plus old
      // canonical records with no explicit server authorization, must not
      // suppress the gate or influence cold-cookie restoration.
      if (existingSession && (
        !storedSessionId
        || !storedSessionId.startsWith('wses_')
        || (storedEmail && !storedEmailSession)
      )) {
        localStorage.removeItem(sessionKey);
        storedSessionId = null;
      }
    } catch (e) {
      console.warn('[EmailGate] Could not read the stored session; asking the visitor to sign in again.', e);
      try { localStorage.removeItem(sessionKey); } catch {}
      storedSessionId = null;
    }

    if (workspaceId && (!storedSessionId || storedEmailSession)) {
      try {
        const sharedSpacePath = `/space/${encodeURIComponent(spaceId)}`;
        const onSharedSpacePath = window.location.pathname === sharedSpacePath;
        const query = new URLSearchParams();
        if (storedSessionId) query.set('sessionUuid', storedSessionId);
        if (!onSharedSpacePath) {
          query.set('workspaceId', workspaceId);
          query.set('spaceId', spaceId);
        }
        const serializedQuery = query.toString();
        const checkUrl = onSharedSpacePath
          ? `${sharedSpacePath}/check-session${serializedQuery ? `?${serializedQuery}` : ''}`
          : `/api/auth/otp/space/check-session?${serializedQuery}`;
        const checkRes = await fetch(checkUrl, { credentials: 'include', cache: 'no-store' });
        const { data } = await parseResponseBody(checkRes);
        const checkBody = isRecord(data) ? data : null;
        const verified = checkBody?.verified === true || checkBody?.sessionVerified === true;
        const legacyAuthorized = checkBody?.authorized === true && checkBody?.identityMode === 'legacy_registration';
        const checkedEmail = typeof checkBody?.email === 'string' ? checkBody.email.toLowerCase().trim() : '';
        const expectedEmail = storedEmail?.toLowerCase().trim() || '';
        const checkedSessionId = checkBody
          ? [checkBody.canonicalSessionId, checkBody.workspaceSessionId, storedSessionId].find(isCanonicalWorkspaceSession)
          : undefined;
        const emailMatches = !expectedEmail || checkedEmail === expectedEmail;

        if (checkRes.ok && checkedSessionId && emailMatches && (verified || legacyAuthorized)) {
          const restoredEmail = checkedEmail || expectedEmail;
          setEmail(restoredEmail);
          await completeSession(checkedSessionId, restoredEmail, {
            verified,
            authorized: true,
            identityMode: verified ? 'strict_verified' : 'legacy_registration',
            workspaceId,
          });
          return;
        }
      } catch (sessionError) {
        console.warn('[EmailGate] Could not validate the returning session.', sessionError);
      }
      if (storedSessionId) {
        try { localStorage.removeItem(sessionKey); } catch {}
      }
    }

    if (storedEmail) setEmail(storedEmail);
    setStep('email');
  };

  async function startOtp(registerBody: SpaceRegisterResponseBody, normalizedEmail: string): Promise<boolean> {
    const resolvedWorkspaceId = registerBody.workspaceId || workspaceId || '';
    const provisionalSessionToken = registerBody.provisionalSessionToken || '';
    if (!resolvedWorkspaceId || !provisionalSessionToken) {
      setError('The server did not return the verification binding. Please try again.');
      return false;
    }

    const sendRes = await fetch('/api/auth/otp/space/send', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        workspaceId: resolvedWorkspaceId,
        spaceId,
        sessionUuid: provisionalSessionToken,
      }),
    });
    const { data, rawText } = await parseResponseBody(sendRes);
    if (!sendRes.ok) {
      const retryAfter = isRecord(data) && typeof data.retryAfter === 'number' ? data.retryAfter : 0;
      if (retryAfter > 0) setResendWait(retryAfter);
      setError(describeResponseFailure(sendRes, data, rawText, 'Could not send the verification code. Please try again.'));
      return false;
    }

    setPendingOtp({ email: normalizedEmail, workspaceId: resolvedWorkspaceId, provisionalSessionToken });
    setOtpCode('');
    setResendWait(isRecord(data) && typeof data.resendCooldown === 'number' ? data.resendCooldown : 60);
    setError('');
    setStep('otp');
    return true;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();

      if (workspaceId) {
        const attribution = getAttribution();
        const visitorId = getVisitorId();
        const sessionId = `csess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

        const registerRes = await fetch(`/api/space/${spaceId}/register`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            sessionId,
            visitorId,
            attribution,
            metadata: {},
            workspaceId,
            marketingConsent,
          }),
        });

        const { data: registerResult, rawText: registerRawText } =
          await parseResponseBody(registerRes);

        if (!registerRes.ok) {
          console.error('[EmailGate] register failed', {
            status: registerRes.status,
            body: registerResult ?? registerRawText.slice(0, 200),
          });
          setError(
            describeResponseFailure(
              registerRes,
              registerResult,
              registerRawText,
              'Failed to create session. Please try again.',
            ),
          );
          setLoading(false);
          return;
        }

        if (!isRecord(registerResult)) {
          console.error('[EmailGate] register returned an unparseable body', {
            status: registerRes.status,
            rawText: registerRawText.slice(0, 200),
          });
          setError('The server returned an unexpected response. Please try again.');
          setLoading(false);
          return;
        }

        const registerBody = registerResult as SpaceRegisterResponseBody;
        const verified = registerBody.sessionVerified === true || registerBody.verified === true;
        const acceptedSessionId = [registerBody.canonicalSessionId, registerBody.workspaceSessionId].find(isCanonicalWorkspaceSession);

        if (!acceptedSessionId || registerBody.success === false) {
          setError('The server did not create an email session. Please try again.');
          return;
        }

        // The server rejects every session-gated hook (credits, generation,
        // projects) for an unverified email session, so an email alone is not
        // enough: send the one-time code unless the platform itself authorized
        // this registration.
        const legacyAuthorized = registerBody.otpRequired === false
          && registerBody.legacyAuthorized === true
          && registerBody.identityMode === 'legacy_registration';
        if (!verified && !legacyAuthorized) {
          await startOtp(registerBody, normalizedEmail);
          return;
        }
        const identityMode = verified ? 'strict_verified' : 'legacy_registration';

        const metaPixelId = audosWindow().__META_PIXEL_ID__;
        if (typeof audosWindow().fbq === 'function' && metaPixelId) {
          audosWindow().fbq?.('init', metaPixelId, { em: normalizedEmail.toLowerCase().trim() });
        }
        fireLeadEventWithRetry(normalizedEmail);
        setGateOpen(false);
        await completeSession(acceptedSessionId, normalizedEmail, {
          verified,
          authorized: true,
          identityMode,
          workspaceId: registerBody.workspaceId,
        });
      } else {
        setError('Sign-in is unavailable because the workspace identity is missing.');
      }
    } catch (err) {
      console.error('[EmailGate] Network error in handleEmailSubmit:', err);
      setError('Connection error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingOtp) {
      setError('Your verification session expired. Enter your email again.');
      setStep('email');
      return;
    }
    const normalizedCode = otpCode.replace(/\s/g, '');
    if (!/^\d{4,8}$/.test(normalizedCode)) {
      setError('Enter the code from your email.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const verifyRes = await fetch('/api/auth/otp/space/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingOtp.email,
          code: normalizedCode,
          workspaceId: pendingOtp.workspaceId,
          spaceId,
          sessionUuid: pendingOtp.provisionalSessionToken,
        }),
      });
      const { data, rawText } = await parseResponseBody(verifyRes);
      const verifyBody = isRecord(data) ? data : null;
      const canonicalSessionId = verifyBody
        ? [verifyBody.canonicalSessionId, verifyBody.workspaceSessionId].find(isCanonicalWorkspaceSession)
        : undefined;
      if (!verifyRes.ok || verifyBody?.success !== true || verifyBody?.sessionVerified !== true || !canonicalSessionId) {
        setError(describeResponseFailure(verifyRes, data, rawText, 'That code is invalid or expired. Please try again.'));
        return;
      }

      setGateOpen(false);
      setPendingOtp(null);
      await completeSession(canonicalSessionId, pendingOtp.email, {
        verified: true,
        authorized: true,
        identityMode: 'strict_verified',
        workspaceId: pendingOtp.workspaceId,
      });
    } catch (err) {
      console.error('[EmailGate] OTP verification failed:', err);
      setError('Connection error. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpResend = async () => {
    if (!pendingOtp || resendWait > 0 || loading) return;
    setError('');
    setLoading(true);
    try {
      const resendRes = await fetch('/api/auth/otp/space/resend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingOtp.email,
          workspaceId: pendingOtp.workspaceId,
          spaceId,
          sessionUuid: pendingOtp.provisionalSessionToken,
        }),
      });
      const { data, rawText } = await parseResponseBody(resendRes);
      if (!resendRes.ok) {
        const retryAfter = isRecord(data) && typeof data.retryAfter === 'number' ? data.retryAfter : 0;
        if (retryAfter > 0) setResendWait(retryAfter);
        setError(describeResponseFailure(resendRes, data, rawText, 'Could not resend the code. Please try again.'));
        return;
      }
      setResendWait(isRecord(data) && typeof data.resendCooldown === 'number' ? data.resendCooldown : 60);
    } catch (err) {
      console.error('[EmailGate] OTP resend failed:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Persist the server-issued session returned by registration or OTP
  // verification and hand it to the data runtime before rendering any app.
  const completeSession = async (
    adoptedSessionId?: string,
    sessionEmail = email,
    authorization: { verified: boolean; authorized: boolean; identityMode: string; workspaceId?: string } = {
      verified: false,
      authorized: false,
      identityMode: '',
    },
  ) => {
    const finalSessionId = adoptedSessionId;
    if (!isCanonicalWorkspaceSession(finalSessionId)) {
      setError('Your session could not be created. Please sign in again.');
      setStep('email');
      setLoading(false);
      return;
    }
    const sessionKey = `space_session_${spaceId}`;
    const normalizedEmail = sessionEmail.toLowerCase().trim();
    let verifiedMetadata: Record<string, unknown> = {};
    try {
      const existingSession = localStorage.getItem(sessionKey);
      if (existingSession) {
        const parsed: unknown = JSON.parse(existingSession);
        if (isRecord(parsed) && isRecord(parsed.metadata)) verifiedMetadata = parsed.metadata;
      }
    } catch {}
    const session = {
      id: finalSessionId,
      workspaceSessionId: finalSessionId,
      workspaceId: authorization.workspaceId || workspaceId,
      email: normalizedEmail,
      timestamp: Date.now(),
      verified: authorization.verified,
      authorized: authorization.authorized,
      identityMode: authorization.identityMode,
      isReturningUser: true,
      metadata: verifiedMetadata,
    };
    localStorage.setItem(sessionKey, JSON.stringify(session));
    acceptDataSession(finalSessionId);

    try {
      window.dispatchEvent(new CustomEvent('audos:session-established', {
        detail: {
          workspaceSessionId: finalSessionId,
          email: normalizedEmail,
          verified: authorization.verified,
          authorized: authorization.authorized,
          identityMode: authorization.identityMode,
        }
      }));
    } catch (e) {}

    setSessionId(finalSessionId);
    completeGateEntry();
    setLoading(false);
  };

  const handleGuestMode = async () => {
    setError('');
    setLoading(true);

    try {
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const sessionKey = `space_session_${spaceId}`;
      const guestSession = {
        id: guestId,
        workspaceSessionId: guestId,
        email: null,
        isGuest: true,
        timestamp: Date.now(),
        verified: true,
        metadata: {},
      };
      localStorage.setItem(sessionKey, JSON.stringify(guestSession));
      acceptDataSession(guestId);

      try {
        window.dispatchEvent(new CustomEvent('audos:session-established', {
          detail: { workspaceSessionId: guestId, isGuest: true },
        }));
      } catch (e) {}

      setSessionId(guestId);
      completeGateEntry();
    } catch (err) {
      setError('Could not continue as guest. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // `?as=visitor` preview forces the signed-out view even after a real
  // sign-in: the gate would render nothing and the visitor would land on the
  // blank-screen lock instead of the space. The session write is real (only
  // reads are shadowed under the forced-visitor preview), so drop the
  // as=visitor param and reload — the fresh session is adopted and the
  // signed-in space opens.
  const completeGateEntry = () => {
    try {
      if (typeof window !== 'undefined' && audosWindow().__AUDOS_FORCE_VISITOR__ === true) {
        const url = new URL(window.location.href);
        url.searchParams.delete('as');
        window.location.replace(url.toString());
        return;
      }
    } catch (e) {}
    setStep('complete');
  };

  const handleSocialLogin = (provider: string) => {
    // Strip the forced-visitor preview flag from the OAuth return URL so the
    // visitor comes back to the signed-in space, not the forced signed-out view.
    let socialReturnTo = window.location.href;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('as');
      socialReturnTo = url.toString();
    } catch (e) {}
    const returnUrl = encodeURIComponent(socialReturnTo);
    const url = workspaceId
      ? `/api/auth/social/${provider}?workspaceId=${workspaceId}&spaceId=${spaceId}&returnUrl=${returnUrl}`
      : `/api/auth/social/${provider}?spaceId=${spaceId}&returnUrl=${returnUrl}`;
    window.location.href = url;
  };

  function getVisitorId(): string {
    const key = 'audos_visitor_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = `v_${Math.random().toString(36).substring(2)}_${Date.now()}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  function getAttrCookie(): Record<string, string> | null {
    try {
      const raw = localStorage.getItem('audos_attribution');
      return raw ? (JSON.parse(raw) as Record<string, string>) : null;
    } catch {
      return null;
    }
  }

  function setAttrCookie(jsonStr: string) {
    const ATTR_COOKIE_NAME = 'audos_attr';
    const MULTI_LEVEL_TLDS = ['co.uk','co.za','co.in','co.jp','co.kr','co.nz','com.au','com.br','com.cn','com.mx','com.sg','com.hk','com.tw','com.ar','com.co','com.eg','com.my','com.ng','com.pe','com.ph','com.pk','com.tr','com.ua','com.vn','org.uk','org.au','net.au','net.uk','ac.uk','gov.uk','gov.au','edu.au','ne.jp','or.jp'];
    const hostname = window.location.hostname;
    const platformDomains = [
      'replit.dev', 'replit.app', 'repl.co',
      'github.io', 'herokuapp.com', 'netlify.app', 'vercel.app',
      'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com',
      'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
      'ngrok.io', 'ngrok.app', 'railway.app', 'render.com',
      'fly.dev', 'deno.dev', 'glitch.me'
    ];
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
    const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    let isPlatform = false;
    for (let i = 0; i < platformDomains.length; i++) {
      if (hostname.endsWith('.' + platformDomains[i]) || hostname === platformDomains[i]) {
        isPlatform = true;
        break;
      }
    }
    let domainPart = '';
    if (!isLocalhost && !isIP && !isPlatform) {
      const parts = hostname.split('.');
      const lastTwo = parts.slice(-2).join('.');
      if (MULTI_LEVEL_TLDS.indexOf(lastTwo) !== -1 && parts.length >= 3) {
        domainPart = '; domain=.' + parts.slice(-3).join('.');
      } else if (parts.length >= 2) {
        domainPart = '; domain=.' + parts.slice(-2).join('.');
      }
    }
    const isSecure = window.location.protocol === 'https:';
    const secureFlag = isSecure ? '; Secure' : '';
    document.cookie = ATTR_COOKIE_NAME + '=' + encodeURIComponent(jsonStr) + '; max-age=86400; path=/' + domainPart + '; SameSite=Lax' + secureFlag;
  }

  function storeAttribution() {
    const params = new URLSearchParams(window.location.search);
    const hasUtm = params.has('utm_source') || params.has('utm_medium') || params.has('utm_campaign') || params.has('fbclid') || params.has('gclid') || params.has('ref');
    if (!hasUtm) return;

    const attr: Record<string, string> = { capturedAt: Date.now().toString() };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref'].forEach(p => {
      const v = params.get(p);
      if (v) attr[p === 'ref' ? 'referrer' : p.replace('utm_', 'utm').replace('_', '')] = v;
    });
    if (document.referrer) attr.httpReferrer = document.referrer;

    try {
      localStorage.setItem('audos_attribution', JSON.stringify(attr));
    } catch {}

    const cookieAttr: Record<string, string> = { capturedAt: new Date().toISOString() };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref'].forEach(p => {
      const v = params.get(p);
      if (v) cookieAttr[p] = v;
    });
    if (document.referrer) cookieAttr.httpReferrer = document.referrer;
    try {
      setAttrCookie(JSON.stringify(cookieAttr));
      console.log('[EmailGate] Attribution stored in cookie:', cookieAttr);
    } catch {}
  }

  async function fireLeadEventWithRetry(emailAddr: string, attempt = 0) {
    const normalizedEmail = emailAddr.toLowerCase().trim();
    // Task #1480: stable conversion id used for both client-side rdt('track','Lead', …)
    // and server-side Reddit CAPI so they dedupe.
    const conversionId = `lead_${spaceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const tryFireFbq = (): boolean => {
      const trackMeta = audosWindow().__audosTrackMetaEvent;
      if (typeof trackMeta === 'function') {
        const eventId = trackMeta('Lead', {
          content_name: 'Email Capture',
          content_category: 'space',
        });
        if (eventId) {
          console.log('[EmailGate] Meta Pixel Lead event fired for:', emailAddr, 'eventId:', eventId);
          return true;
        }
      }
      const fbq = audosWindow().fbq;
      if (typeof fbq === 'function') {
        const pixelId = audosWindow().__META_PIXEL_ID__;
        if (!pixelId) return false;
        const eventId = `meta_lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        fbq('trackSingle', String(pixelId), 'Lead', {
          content_name: 'Email Capture',
          content_category: 'space',
        }, {
          eventID: eventId
        });
        console.log('[EmailGate] Meta Pixel Lead event fired for:', emailAddr, 'eventId:', eventId);
        return true;
      }
      return false;
    };

    if (!tryFireFbq()) {
      console.log('[EmailGate] fbq not ready, will retry with exponential backoff...');
      const maxRetries = 5;
      const delays = [100, 200, 400, 800, 1600];

      const retryWithBackoff = (retryAttempt: number) => {
        if (retryAttempt >= maxRetries) {
          console.warn('[EmailGate] Failed to fire Lead event - fbq never loaded after 5 retries');
          return;
        }
        setTimeout(() => {
          if (tryFireFbq()) {
            console.log(`[EmailGate] Lead event fired after ${retryAttempt + 1} retries`);
          } else {
            retryWithBackoff(retryAttempt + 1);
          }
        }, delays[retryAttempt]);
      };

      retryWithBackoff(0);
    }

    // Task #1480: Reddit Pixel Lead (parallel to Meta). We call window.rdt
    // directly — the queue stub installed by the injected PageVisit snippet
    // (Task #1456, already live) handles late pixel.js loads, so we don’t
    // need the exponential-backoff retry the Meta path uses. Re-running
    // rdt('init', …, { email, externalId }) propagates advanced matching for
    // the subsequent Lead event (Reddit "Step 3: Set up match keys").
    try {
      const rdt = audosWindow().rdt;
      const pixelId = audosWindow().__REDDIT_PIXEL_ID__;
      if (typeof rdt === 'function') {
        if (pixelId) {
          rdt('init', pixelId, { email: normalizedEmail, externalId: getVisitorId() });
        }
        rdt('track', 'Lead', { conversionId });
        console.log('[EmailGate] Reddit Pixel Lead event fired (conversionId=' + conversionId + ')');
      }
    } catch (e) {
      console.warn('[EmailGate] Reddit Pixel Lead failed:', e);
    }

    if (!workspaceId) return;
    try {
      await fetch(`/api/space/${spaceId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'lead',
          sessionId: `lead_${Date.now()}`,
          visitorId: getVisitorId(),
          // Task #1480: include conversionId so server-side Reddit CAPI dedupes
          // with the client-side rdt('track','Lead',…) fired above.
          conversionId,
          metadata: { email: emailAddr, conversionId, ...getAttribution() },
          workspaceId,
        }),
      });
    } catch {
      if (attempt < 2) setTimeout(() => fireLeadEventWithRetry(emailAddr, attempt + 1), 2000);
    }
  }

  const getAttribution = () => {
    const params = new URLSearchParams(window.location.search);

    const urlAttribution: Record<string, string | null> = {};
    if (params.get('utm_source')) urlAttribution.utmSource = params.get('utm_source');
    if (params.get('utm_medium')) urlAttribution.utmMedium = params.get('utm_medium');
    if (params.get('utm_campaign')) urlAttribution.utmCampaign = params.get('utm_campaign');
    if (params.get('utm_content')) urlAttribution.utmContent = params.get('utm_content');
    if (params.get('utm_term')) urlAttribution.utmTerm = params.get('utm_term');
    if (params.get('fbclid')) urlAttribution.fbclid = params.get('fbclid');
    if (params.get('gclid')) urlAttribution.gclid = params.get('gclid');
    if (params.get('ref')) urlAttribution.referrer = params.get('ref');
    if (document.referrer) urlAttribution.httpReferrer = document.referrer;

    const storedAttr = getAttrCookie();

    const merged: Record<string, string | null> = {};
    if (storedAttr) {
      for (const [key, value] of Object.entries(storedAttr)) {
        if (value && key !== 'capturedAt') merged[key] = value;
      }
    }
    for (const [key, value] of Object.entries(urlAttribution)) {
      if (value) merged[key] = value;
    }

    return Object.keys(merged).length > 0 ? merged : null;
  };

  // ── Presentation ────────────────────────────────────────────────────────
  const brandName = branding?.name || 'Vidverge';
  const tagline = branding?.tagline || 'The end-to-end intelligent video platform';
  const logoUrl = branding?.logoUrl || 'https://storage.googleapis.com/audos-images/attachments/general/c0902809-6dc4-4e0c-b04e-1f60e01b31e6.png';

  const BrandLogo = ({ size = 32 }: { size?: number }) =>
    logoUrl ? (
      <img
        src={logoUrl}
        alt={brandName}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          display: 'block',
          filter: 'drop-shadow(0 0 10px rgba(214,171,74,0.55))',
        }}
      />
    ) : (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${BRAND}, ${BRAND_HI})`,
          boxShadow: BRAND_GLOW,
        }}
      />
    );

  if (step === 'complete') {
    return null;
  }

  // Session check in flight. `.vv-boot` holds the loader back for a beat, so a
  // cached session resolves into the app without flashing a spinner.
  if (step === 'loading') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ fontFamily: FONT, background: BG, color: TEXT, position: 'relative' }}
      >
        <style>{GATE_STYLES}</style>
        <LightField />
        <div className="vv-boot" style={{ position: 'relative', zIndex: 2 }}>
          <VergeLoader size={190} caption="Warming up the studio" />
        </div>
      </div>
    );
  }

  // ── Landing page helpers ────────────────────────────────────────────────
  const openGate = (mode: 'start' | 'concierge' = 'start') => {
    setError('');
    setGateMode(mode);
    setGateOpen(true);
    window.setTimeout(() => {
      try { modalEmailInputRef.current?.focus(); } catch {}
    }, 60);
  };
  const closeGate = () => setGateOpen(false);

  const scrollToId = (id: string) => {
    try { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  };

  const focusHeroEmail = () => {
    scrollToId('start');
    window.setTimeout(() => {
      try { heroEmailInputRef.current?.focus(); } catch {}
    }, 420);
  };

  // The sign-in form itself — rendered inline in the hero and again inside
  // the modal that the lower CTAs open. Registration saves the submitted email
  // and enters the app immediately with the server-issued workspace session.
  const renderEmailForm = (variant: 'hero' | 'modal') => {
    const isModal = variant === 'modal';
    const suffix = isModal ? '-modal' : '';

    // Kept as an unreachable compatibility branch for a stale in-memory state;
    // v124 never calls startOtp or sets this step.
    if (step === 'otp') {
      return (
        <form onSubmit={handleOtpSubmit} style={{ width: '100%' }}>
          <p style={{ margin: '0 0 6px', fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>
            Enter the code sent to <strong style={{ color: TEXT }}>{pendingOtp?.email || email}</strong>.
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.5, color: DIM }}>
            This verifies your session so Verger and every studio can access your saved work securely.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpCode}
            onChange={(event) => { setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 8)); setError(''); }}
            placeholder="Verification code"
            className="vv-input"
            disabled={loading}
            autoFocus={isModal}
            data-testid={`input-otp${suffix}`}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '15px 16px',
              fontSize: 20,
              letterSpacing: '0.18em',
              borderRadius: 12,
              background: BG_DEEP,
              border: `1px solid ${error ? '#dc2626' : LINE}`,
              color: TEXT,
              outline: 'none',
              fontFamily: MONO,
            }}
          />
          <button
            type="submit"
            disabled={loading}
            className="vv-cta"
            data-testid={`button-verify-otp${suffix}`}
            style={{ width: '100%', marginTop: 10, padding: '14px 18px', fontSize: 15, opacity: loading ? 0.65 : 1 }}
          >
            {loading ? 'Verifying…' : 'Verify and open Vidverge'}
          </button>
          {error && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#f87171' }} role="alert">{error}</p>}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button
              type="button"
              onClick={handleOtpResend}
              disabled={loading || resendWait > 0}
              className="vv-link"
              style={{ background: 'none', border: 0, padding: 0, fontSize: 13, cursor: resendWait > 0 ? 'default' : 'pointer' }}
            >
              {resendWait > 0 ? `Resend in ${resendWait}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => { setPendingOtp(null); setOtpCode(''); setError(''); setStep('email'); }}
              className="vv-link"
              style={{ background: 'none', border: 0, padding: 0, fontSize: 13, cursor: 'pointer' }}
            >
              Use another email
            </button>
          </div>
        </form>
      );
    }

    return (
      <form onSubmit={handleEmailSubmit} style={{ width: '100%' }}>
        <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>
          Enter your email to save your session and start creating.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            ref={isModal ? modalEmailInputRef : heroEmailInputRef}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="you@email.com"
            className="vv-input"
            disabled={loading}
            autoComplete="email"
            data-testid={`input-email${suffix}`}
            style={{
              flex: '1 1 220px',
              minWidth: 0,
              boxSizing: 'border-box',
              padding: '15px 16px',
              fontSize: 16,
              borderRadius: 12,
              background: BG_DEEP,
              border: `1px solid ${error ? '#dc2626' : LINE}`,
              color: TEXT,
              outline: 'none',
              fontFamily: FONT,
            }}
          />
          <button
            type="submit"
            disabled={loading}
            className="vv-cta"
            data-testid={`button-get-started${suffix}`}
            style={{
              flex: isModal ? '1 1 100%' : '0 0 auto',
              padding: '15px 26px',
              fontSize: 16,
              whiteSpace: 'nowrap',
              opacity: loading ? 0.65 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: BRAND_GLOW,
            }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <VergeLoader size={30} tone="ink" label="Opening your studio" />
                Opening…
              </span>
            ) : (
              'Start creating →'
            )}
          </button>
        </div>

        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#f87171' }} data-testid={`text-error${suffix}`}>
            {error}
          </p>
        )}

        {gdprEnabled && (
          <div style={{ marginTop: 14, textAlign: 'left' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: MUTED, lineHeight: 1.6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: BRAND, flexShrink: 0 }}
                data-testid={`checkbox-consent${suffix}`}
              />
              <span>
                I agree to receive marketing emails and accept the{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="vv-link" style={{ color: BRAND_HI, textDecoration: 'underline' }}>
                  privacy policy
                </a>
                . Unsubscribe anytime.
              </span>
            </label>
          </div>
        )}

        <p style={{ margin: '14px 0 0', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: MONO, color: DIM }}>
          No credit card · 30 free credits · Instant access
        </p>

        {(socialProviders.length > 0 || guestModeEnabled) && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {socialProviders.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => handleSocialLogin(provider)}
                className="vv-ghost"
                style={{ width: '100%', padding: '12px 16px', fontSize: 14, textTransform: 'capitalize' }}
              >
                Continue with {provider}
              </button>
            ))}
            {guestModeEnabled && (
              <button
                type="button"
                onClick={handleGuestMode}
                className="vv-link"
                style={{ background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', marginTop: 2, alignSelf: 'flex-start' }}
              >
                Continue as guest
              </button>
            )}
          </div>
        )}
      </form>
    );
  };

  const eyebrow = (text: string, style?: React.CSSProperties) => (
    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: BRAND, fontFamily: MONO, ...style }}>
      {text}
    </span>
  );

  const sectionTitle = (text: string, style?: React.CSSProperties) => (
    <h2 style={{ margin: 0, fontSize: 'clamp(30px, 4vw, 50px)', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.03, color: TEXT, ...style }}>
      {text}
    </h2>
  );

  return (
    <div style={{ fontFamily: FONT, background: BG, color: TEXT, minHeight: '100vh', overflowX: 'hidden', position: 'relative' }}>
      <style>{GATE_STYLES}</style>

      {/* ===== LOGO LIGHT FIELD — fixed behind every section of the page ===== */}
      <LightField />

      {/* ===== 1 · NAV ===== */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          height: 68,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '0 24px',
          background: scrolled ? 'rgba(8,9,11,.88)' : 'linear-gradient(180deg, rgba(8,9,11,.9), transparent)',
          borderBottom: scrolled ? `1px solid ${LINE}` : '1px solid transparent',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          transition: 'background .25s ease, border-color .25s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandLogo size={30} />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.03em', color: TEXT }}>{brandName}</span>
        </div>
        <div className="vv-navlinks" style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <button type="button" className="vv-navlink" onClick={() => scrollToId('analyser')}>Free analyser</button>
          <button type="button" className="vv-navlink" onClick={() => scrollToId('showcase')}>Showcase</button>
          <button type="button" className="vv-navlink" onClick={() => scrollToId('studios')}>Studios</button>
          <button type="button" className="vv-navlink" onClick={() => scrollToId('pricing')}>Pricing</button>
        </div>
        <button
          type="button"
          onClick={() => openGate('start')}
          className="vv-navcta"
          data-testid="button-nav-start"
          style={{ padding: '9px 18px', fontSize: 13 }}
        >
          Start Free
        </button>
      </nav>

      {/* ===== 2 · HERO (signup form lives inside) ===== */}
      <section id="start" style={{ position: 'relative', zIndex: 2, padding: '136px 0 86px' }}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '0 24px' }} className="vv-hero">
          <div>
            <Reveal reduceMotion={reduceMotion}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 13px',
                  borderRadius: 999,
                  border: '1px solid rgba(214,171,74,.3)',
                  background: 'rgba(214,171,74,.07)',
                  marginBottom: 24,
                  fontSize: 11.5,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontFamily: MONO,
                  color: BRAND_HI,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: BRAND, boxShadow: BRAND_GLOW }} />
                The end-to-end intelligent video platform
              </span>

              <h1
                style={{
                  margin: '0 0 18px',
                  fontSize: 'clamp(42px, 6vw, 74px)',
                  fontWeight: 800,
                  letterSpacing: '-0.055em',
                  lineHeight: 0.98,
                  color: TEXT,
                }}
              >
                Own the Channel.<br />
                <span style={{ color: BRAND_HI }}>Not Just the Clip.</span>
              </h1>

              <p style={{ margin: '0 0 14px', fontSize: 'clamp(17px, 2vw, 21px)', fontWeight: 600, color: TEXT, letterSpacing: '-0.015em' }}>
                Six AI studios. One pipeline. Zero character drift.
              </p>
              <p style={{ margin: '0 0 30px', fontSize: 15.5, lineHeight: 1.65, color: MUTED, maxWidth: 520 }}>
                Idea to a character-consistent, publish-ready video — script, scenes, voice, edit and
                export — without ever opening another tool.
              </p>
            </Reveal>

            <Reveal reduceMotion={reduceMotion} delay={0.08}>
              <div style={{ maxWidth: 520 }}>{renderEmailForm('hero')}</div>
            </Reveal>
          </div>

          {/* Hero visual: a finished Vidverge render, not a mockup. */}
          <Reveal reduceMotion={reduceMotion} delay={0.14} style={{ position: 'relative' }}>
            <div className="vv-hero-visual" style={{ position: 'relative' }}>
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: '-14% -8%',
                  background: 'radial-gradient(closest-side, rgba(214,171,74,.22), transparent 72%)',
                  filter: 'blur(14px)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative' }}>
                <VideoFrame src={HERO_VIDEO.url} reduceMotion={reduceMotion} width="100%" aspect={HERO_VIDEO.ratio} />
                <div
                  style={{
                    position: 'absolute',
                    right: -18,
                    bottom: -56,
                    width: 172,
                    borderRadius: 20,
                    overflow: 'hidden',
                    border: `1px solid ${LINE}`,
                    boxShadow: '0 22px 50px rgba(0,0,0,.62)',
                    background: BG_DEEP,
                  }}
                >
                  <div style={{ aspectRatio: HERO_INSET.ratio }}>
                    <ViewportVideo src={HERO_INSET.url} reduceMotion={reduceMotion} />
                  </div>
                </div>
                <span
                  style={{
                    position: 'absolute',
                    left: 16,
                    bottom: 16,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'rgba(8,9,11,.78)',
                    border: '1px solid rgba(214,171,74,.35)',
                    color: BRAND_HI,
                    fontSize: 11,
                    fontFamily: MONO,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Rendered in Vidverge
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 3 · SOCIAL PROOF ===== */}
      <section style={{ position: 'relative', zIndex: 2, padding: '26px 0 10px' }}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '0 24px' }}>
          <Reveal reduceMotion={reduceMotion}>
            <div className="vv-proof">
              <span style={{ fontSize: 13, color: MUTED, letterSpacing: '0.02em' }}>
                <span style={{ color: BRAND, fontWeight: 700 }}>★★★★★</span>&nbsp;&nbsp;Trusted by 200+ creators
              </span>
              {PROOF_STATS.map((stat) => (
                <span key={stat.label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, fontSize: 13, color: DIM }}>
                  <span style={{ fontSize: 17, fontWeight: 800, color: TEXT }}>{stat.value}</span>
                  {stat.label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== 4 · FREE VIDEO ANALYSER ===== */}
      <section id="analyser" style={{ position: 'relative', zIndex: 2, padding: '76px 0 24px', scrollMarginTop: 72 }}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '0 24px' }}>
          <Reveal reduceMotion={reduceMotion}>
            <FreeVideoAnalyzer
              onFix={(edit) => {
                saveVidvergeHandoff({
                  appId: 'video-enhancer',
                  prompt: `Apply this recommended edit at ${edit.timestamp}: ${edit.issue} Fix: ${edit.fix}`,
                });
                window.location.hash = 'video-enhancer';
                openGate('start');
              }}
            />
          </Reveal>
        </div>
      </section>

      {/* ===== 5 · VIDEO GALLERY (real finished renders) ===== */}
      <section id="showcase" style={{ position: 'relative', zIndex: 2, padding: '96px 0 40px' }}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '0 24px' }}>
          <Reveal reduceMotion={reduceMotion}>
            {eyebrow('The output', { marginBottom: 16 })}
            {sectionTitle('What Creators Are Making With Vidverge')}
            <p style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.65, color: MUTED, maxWidth: 620 }}>
              Every clip below came out of a Vidverge studio end to end — no external editor, no
              stitching, no stock filler.
            </p>
          </Reveal>

          {GALLERY.map((section, sectionIndex) => (
            <div key={section.app} style={{ marginTop: sectionIndex === 0 ? 44 : 52 }}>
              <Reveal reduceMotion={reduceMotion}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: TEXT }}>
                    {section.app}
                  </h3>
                  <span style={{ fontSize: 13, color: DIM }}>{section.blurb}</span>
                </div>
              </Reveal>

              <div className="vv-rail">
                {section.items.map((item, index) => (
                  <Reveal key={item.url} reduceMotion={reduceMotion} delay={0.05 * index}>
                    <div style={{ width: item.railWidth, maxWidth: '84vw' }}>
                      <VideoFrame
                        src={item.url}
                        reduceMotion={reduceMotion}
                        width="100%"
                        aspect={item.ratio}
                      />
                      <div
                        className="vv-card"
                        style={{ marginTop: 10, padding: '12px 14px' }}
                      >
                        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: MONO, color: BRAND, marginBottom: 5 }}>
                          {section.app}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, lineHeight: 1.35 }}>{item.title}</div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 5 · THE SIX STUDIOS ===== */}
      <section id="studios" style={{ position: 'relative', zIndex: 2, padding: '96px 0' }}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '0 24px' }}>
          <Reveal reduceMotion={reduceMotion}>
            {eyebrow('The platform', { marginBottom: 16 })}
            {sectionTitle('Six studios. One pipeline.')}
            <p style={{ margin: '16px 0 42px', fontSize: 15, lineHeight: 1.65, color: MUTED, maxWidth: 620 }}>
              Each studio is a finished product on its own. Together they are the only place a channel
              goes from idea to published without leaving the tab.
            </p>
          </Reveal>

          <div className="vv-studios">
            {STUDIOS.map((studio, index) => (
              <Reveal key={studio.name} reduceMotion={reduceMotion} delay={0.05 * index} style={{ height: '100%' }}>
                <div
                  className="vv-card vv-studio"
                  style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: 18 }}
                >
                  <span
                    style={{
                      alignSelf: 'flex-start',
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: '1px solid rgba(214,171,74,.3)',
                      background: 'rgba(214,171,74,.07)',
                      color: BRAND_HI,
                      fontSize: 10,
                      fontFamily: MONO,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {studio.tag}
                  </span>
                  <h3 style={{ margin: '14px 0 6px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', color: TEXT }}>
                    {studio.name}
                  </h3>
                  <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, color: MUTED }}>{studio.benefit}</p>

                  <div
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      border: `1px solid ${LINE}`,
                      background: BG_DEEP,
                      aspectRatio: '4 / 3',
                      marginBottom: 16,
                    }}
                  >
                    <img
                      src={studio.shot}
                      alt={studio.shotAlt}
                      loading="lazy"
                      decoding="async"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => openGate('start')}
                    className="vv-link"
                    data-testid={`button-try-${index}`}
                    style={{
                      marginTop: 'auto',
                      alignSelf: 'flex-start',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: BRAND,
                      cursor: 'pointer',
                    }}
                  >
                    Try it →
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 6 · PRICING ===== */}
      <section id="pricing" style={{ position: 'relative', zIndex: 2, padding: '40px 0 96px' }}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '0 24px' }}>
          <Reveal reduceMotion={reduceMotion}>
            {eyebrow('Pricing', { marginBottom: 16 })}
            {sectionTitle('Start free. Scale when it ships.')}
            <p style={{ margin: '16px 0 44px', fontSize: 15, lineHeight: 1.65, color: MUTED, maxWidth: 620 }}>
              1 credit = 1 second of video. Credits never expire on paid plans, and unused subscription
              credits roll over.
            </p>
          </Reveal>

          <div className="vv-pricing">
            {PLANS.map((plan, index) => (
              <Reveal key={plan.name} reduceMotion={reduceMotion} delay={0.05 * index} style={{ height: '100%' }}>
                <div
                  style={{
                    position: 'relative',
                    height: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 26,
                    borderRadius: 12,
                    background: plan.featured ? 'rgba(214,171,74,.06)' : CARD,
                    border: plan.featured ? '1px solid rgba(214,171,74,.45)' : `1px solid ${LINE}`,
                    boxShadow: plan.featured ? BRAND_GLOW : 'none',
                  }}
                >
                  {plan.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -11,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '4px 13px',
                        borderRadius: 999,
                        background: BRAND,
                        color: INK,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {plan.badge}
                    </span>
                  )}
                  <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: TEXT }}>{plan.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', color: plan.featured ? BRAND_HI : TEXT }}>
                      {plan.price}
                    </span>
                    <span style={{ fontSize: 12.5, color: DIM }}>{plan.period}</span>
                  </div>
                  <p style={{ margin: '8px 0 20px', fontSize: 12.5, fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND }}>
                    {plan.credits}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    {plan.features.map((feature) => (
                      <li key={feature} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: MUTED }}>
                        <span style={{ color: BRAND, fontWeight: 800, lineHeight: 1.4 }}>✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => openGate('start')}
                    className={plan.featured ? 'vv-cta' : 'vv-ghost'}
                    data-testid={`button-plan-${index}`}
                    style={{ width: '100%', padding: '12px 16px', fontSize: 14 }}
                  >
                    {plan.cta}
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 7 · CONCIERGE — Coming Soon placeholder ===== */}
      {/* Coming Soon — Concierge. The done-for-you service is not live yet and
          deliberately advertises no per-video price; the button only opens the
          email gate so interest is captured as a waitlist. */}
      <section style={{ position: 'relative', zIndex: 2, padding: '0 0 96px' }}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: '0 24px' }}>
          <Reveal reduceMotion={reduceMotion}>
            <div
              className="vv-concierge"
              style={{
                padding: 'clamp(26px, 4vw, 44px)',
                borderRadius: 12,
                background: 'linear-gradient(120deg, rgba(214,171,74,.13), rgba(214,171,74,.04) 48%, rgba(17,14,7,.9))',
                border: '1px solid rgba(214,171,74,.4)',
                boxShadow: BRAND_GLOW,
              }}
            >
              <div>
                <span style={{ fontSize: 10.5, fontFamily: MONO, letterSpacing: '0.2em', textTransform: 'uppercase', color: BRAND }}>
                  Coming soon — Concierge
                </span>
                <h2 style={{ margin: '12px 0 12px', fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: TEXT }}>
                  🎬 We Make Your Video For You
                </h2>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: '#E5E7EB', maxWidth: 560 }}>
                  “Send us your idea. We’ll handle everything — script, characters, editing, delivery.”
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                <button
                  type="button"
                  onClick={() => openGate('concierge')}
                  className="vv-cta"
                  data-testid="button-concierge-waitlist"
                  style={{ padding: '15px 24px', fontSize: 15 }}
                >
                  Join the Waitlist
                </button>
                <span style={{ fontSize: 11.5, color: DIM, textAlign: 'center' }}>
                  Limited slots when it opens
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section style={{ position: 'relative', zIndex: 2, padding: '0 0 96px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <Reveal reduceMotion={reduceMotion}>
            <h2 style={{ margin: '0 0 14px', fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.03, color: TEXT }}>
              Ship your first consistent video today.
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.65, color: MUTED }}>
              30 free credits. No card. Every studio unlocked from the first minute.
            </p>
            <button type="button" onClick={focusHeroEmail} className="vv-cta" data-testid="button-final-cta" style={{ padding: '15px 30px', fontSize: 15, boxShadow: BRAND_GLOW }}>
              Start Free →
            </button>
          </Reveal>
        </div>
      </section>

      {/* ===== 8 · FOOTER ===== */}
      <footer style={{ position: 'relative', zIndex: 2, borderTop: `1px solid ${LINE}`, padding: '34px 0 44px' }}>
        <div
          style={{
            maxWidth: CONTAINER,
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandLogo size={24} />
            <span style={{ fontSize: 13, color: DIM }}>© 2026 {brandName} · {tagline}</span>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="vv-navlink">Privacy</a>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="vv-navlink">Terms</a>
            <a href="https://x.com/vidverge" target="_blank" rel="noopener noreferrer" className="vv-navlink">Twitter / X</a>
          </div>
        </div>
      </footer>

      {/* ===== EMAIL GATE MODAL (second entry point for the same signup form) ===== */}
      {gateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="email-gate-modal"
          onClick={closeGate}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'rgba(0,0,0,.78)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 440,
              padding: 32,
              borderRadius: 12,
              background: CARD,
              border: '1px solid rgba(214,171,74,.3)',
              boxShadow: '0 30px 80px rgba(0,0,0,.65)',
            }}
          >
            <button
              type="button"
              onClick={closeGate}
              aria-label="Close"
              data-testid="button-close-gate"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${LINE}`,
                background: 'transparent',
                color: MUTED,
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <BrandLogo size={28} />
              <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.03em', color: TEXT }}>{brandName}</span>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: TEXT }}>
              {gateMode === 'concierge' ? 'Join the concierge waitlist' : 'Sign in or start free'}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.55, color: MUTED }}>
              {gateMode === 'concierge'
                ? 'Leave your email and we’ll reach out when done-for-you videos open up.'
                : 'Enter your email and go straight to your studio. Your 30 free credits are ready.'}
            </p>
            {renderEmailForm('modal')}
          </div>
        </div>
      )}
    </div>
  );
}
