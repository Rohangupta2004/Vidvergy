import type { ForgeOpusModel } from './forgeModels';

export type ColorRoles = {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  mutedText: string;
};

export type StylePreset = {
  id: string;
  name: string;
  mood: string;
  bestFor: string[];
  colorRoles: ColorRoles;
  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight: number;
    scale: 'compact' | 'standard' | 'large';
  };
  motion: {
    easing: string;
    transition: string;
    enterMs: number;
    exitMs: number;
    pace: 'slow' | 'medium' | 'fast';
  };
  elements: {
    titleCard: string;
    lowerThird: string;
    dataCallout: string;
    brollFrame: string;
    captions: string;
    listReveal: string;
  };
  avatarTreatment: 'full' | 'pip' | 'split' | 'side-panel';
  texture?: string;
  sfx?: string[];
  doNot: string[];
};

export type LogoPlacement = {
  watermark?: { corner: 'tl' | 'tr' | 'bl' | 'br'; opacity: number };
  intro: boolean;
  outro: boolean;
};

export type EditingRecipe = {
  id: 'kinetic-type' | 'liquid-ui' | 'punchy-social' | 'cinematic-minimal';
  label: string;
  description: string;
  layout: string;
  captions: string;
  transitions: string;
  cutRhythm: string;
  motionGraphics: string;
  camera: string;
  background: string;
  colorMap: { background: keyof ColorRoles; text: keyof ColorRoles; highlight: keyof ColorRoles; accent: keyof ColorRoles };
};

/**
 * Labels for the four-draft recipes of projects created before the Auto Editor.
 * New projects never pick a recipe; these only describe older saved drafts.
 */
export const DRAFT_EDIT_RECIPES: EditingRecipe[] = [
  { id: 'kinetic-type', label: 'Kinetic Type', description: 'Type-led teaching edit.', layout: '', captions: '', transitions: '', cutRhythm: '', motionGraphics: '', camera: '', background: '', colorMap: { background: 'background', text: 'text', highlight: 'accent', accent: 'secondary' } },
  { id: 'liquid-ui', label: 'Liquid UI', description: 'Floating glass interface edit.', layout: '', captions: '', transitions: '', cutRhythm: '', motionGraphics: '', camera: '', background: '', colorMap: { background: 'surface', text: 'text', highlight: 'primary', accent: 'accent' } },
  { id: 'punchy-social', label: 'Punch Cut', description: 'Fast social edit.', layout: '', captions: '', transitions: '', cutRhythm: '', motionGraphics: '', camera: '', background: '', colorMap: { background: 'background', text: 'text', highlight: 'accent', accent: 'primary' } },
  { id: 'cinematic-minimal', label: 'Cinematic', description: 'Quiet premium edit.', layout: '', captions: '', transitions: '', cutRhythm: '', motionGraphics: '', camera: '', background: '', colorMap: { background: 'background', text: 'text', highlight: 'primary', accent: 'secondary' } },
];

export type ProjectBrand = {
  logoUrl?: string;
  logoKey?: string | null;
  logoHasBackground?: boolean;
  autoColors?: ColorRoles;
  colors: ColorRoles;
  useBrandColors: boolean;
  logoPlacement: LogoPlacement;
  textAdjusted?: boolean;
};

export type KineticReelBrief = {
  compositions: ['KineticReel-16x9', 'KineticReel-9x16'];
  overlayOnly: false;
  narrationUntouched: true;
  audioMix: 'narration+music+sfx';
  captions: 'word-by-word';
  directorModel: ForgeOpusModel;
  fallbackModel: 'gpt-6.1-sol';
  componentTypes: string[];
  layoutVersion: 2;
  creativePlanVersion: 2;
};

export type StyleBrief = {
  draftSlot: 1 | 2 | 3 | 4;
  source: 'opus-recommended' | 'preset';
  whyThisStyle?: string;
  style: StylePreset;
  editingRecipe: EditingRecipe;
  resolvedColors: ColorRoles;
  brand: {
    useBrandColors: boolean;
    logoUrl?: string;
    logoPlacement: LogoPlacement;
  };
  format: { aspectRatio: string; fps: number; durationSec: 5 };
  scriptContext: { tone: string; sampleLines: string };
  rules: string[];
  kineticReel?: KineticReelBrief;
};

/** Neutral starting palette; the Brand Kit replaces it and the Remotion agent decides the final look. */
export const BASE_COLOR_ROLES: ColorRoles = { background: '#0D0E12', surface: '#17191D', primary: '#F6F2E9', secondary: '#8A93A6', accent: '#F2B544', text: '#FFFFFF', mutedText: '#B7BBC4' };

/** The only mode for new projects: the Remotion agent decides the look per video. */
export const AUTO_EDITOR_STYLE_ID = 'auto-editor';

export const AUTO_EDITOR_PRESET: StylePreset = {
  id: AUTO_EDITOR_STYLE_ID,
  name: 'Auto Editor',
  mood: 'The Remotion agent designs the look for each video from its script and Brand Kit.',
  bestFor: ['avatar videos'],
  colorRoles: BASE_COLOR_ROLES,
  typography: { headingFont: 'Manrope', bodyFont: 'Inter', headingWeight: 800, scale: 'large' },
  motion: { easing: 'cubic-bezier(0.16, 1, 0.3, 1)', transition: 'chosen per video', enterMs: 380, exitMs: 260, pace: 'medium' },
  elements: { titleCard: 'agent-directed', lowerThird: 'agent-directed', dataCallout: 'agent-directed', brollFrame: 'agent-directed', captions: 'script words with speech timing', listReveal: 'agent-directed' },
  avatarTreatment: 'split',
  doNot: ['no invented facts', 'no overlap with captions or CTA'],
};

export const FORGE_STYLES: StylePreset[] = [AUTO_EDITOR_PRESET];

export const STYLE_PRESET_MAP: Record<string, StylePreset> = { [AUTO_EDITOR_STYLE_ID]: AUTO_EDITOR_PRESET };

export function getStylePreset(_id?: string | null): StylePreset {
  return AUTO_EDITOR_PRESET;
}
