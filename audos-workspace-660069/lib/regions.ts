export interface RegionLanguage {
  code: string;
  label: string;
  script: 'Latn' | 'Deva' | 'Arab' | string;
  rtl?: boolean;
}

export interface Region {
  id: string;
  label: string;
  languages: RegionLanguage[];
  defaultLanguage: string;
  voices: string[];
  promptNotes: string;
  launched: boolean;
}

export const UGC_RUNWAY_CREDITS_PER_SECOND = 1;
export const CUSTOM_ACTOR_LIMITS = { free: 0, creator: 3, pro: 10, payg: 0 } as const;

export const REGIONS: Region[] = [
  {
    id: 'in-north-west',
    label: 'North & West India',
    languages: [
      { code: 'hi-Latn', label: 'Hinglish (Roman)', script: 'Latn' },
      { code: 'hi-Deva', label: 'Hindi (Devanagari)', script: 'Deva' },
      { code: 'en-IN', label: 'Indian English', script: 'Latn' },
    ],
    defaultLanguage: 'hi-Latn',
    voices: ['EXAVITQu4vr4xnSDxMaL'],
    promptNotes: 'Contemporary everyday settings and clothes across Delhi, Punjab, Uttar Pradesh, Rajasthan, Mumbai and Gujarat. Keep details specific and natural; never use costumes, caricatures or regional stereotypes.',
    launched: true,
  },
  { id: 'in-south', label: 'South India', languages: [{ code: 'en-IN', label: 'Indian English', script: 'Latn' }], defaultLanguage: 'en-IN', voices: [], promptNotes: 'Modern everyday settings with locally appropriate details and no stereotypes.', launched: false },
  { id: 'in-east', label: 'East India', languages: [{ code: 'en-IN', label: 'Indian English', script: 'Latn' }], defaultLanguage: 'en-IN', voices: [], promptNotes: 'Modern everyday settings with locally appropriate details and no stereotypes.', launched: false },
  { id: 'us', label: 'United States', languages: [{ code: 'en-US', label: 'English (US)', script: 'Latn' }], defaultLanguage: 'en-US', voices: [], promptNotes: 'Contemporary everyday American settings and clothes; avoid regional caricature.', launched: false },
  { id: 'uk', label: 'United Kingdom', languages: [{ code: 'en-GB', label: 'English (UK)', script: 'Latn' }], defaultLanguage: 'en-GB', voices: [], promptNotes: 'Contemporary everyday British settings and clothes; avoid regional caricature.', launched: false },
  { id: 'gulf', label: 'Gulf', languages: [{ code: 'ar', label: 'Arabic', script: 'Arab', rtl: true }, { code: 'en', label: 'English', script: 'Latn' }], defaultLanguage: 'ar', voices: [], promptNotes: 'Contemporary everyday Gulf settings and respectful modern clothing; no ceremonial costumes or stereotypes.', launched: false },
  { id: 'sea-id', label: 'Indonesia', languages: [{ code: 'id', label: 'Bahasa Indonesia', script: 'Latn' }], defaultLanguage: 'id', voices: [], promptNotes: 'Contemporary Indonesian settings and everyday clothing; no stereotypes.', launched: false },
  { id: 'latam', label: 'Latin America', languages: [{ code: 'es-419', label: 'Spanish (Latin America)', script: 'Latn' }], defaultLanguage: 'es-419', voices: [], promptNotes: 'Contemporary everyday Latin American settings; avoid collapsing distinct countries into stereotypes.', launched: false },
  { id: 'br', label: 'Brazil', languages: [{ code: 'pt-BR', label: 'Portuguese (Brazil)', script: 'Latn' }], defaultLanguage: 'pt-BR', voices: [], promptNotes: 'Contemporary everyday Brazilian settings and clothes; no stereotypes.', launched: false },
  { id: 'eu', label: 'Europe', languages: [{ code: 'en', label: 'English', script: 'Latn' }], defaultLanguage: 'en', voices: [], promptNotes: 'Use the selected country and language for concrete everyday details; no pan-European stereotypes.', launched: false },
];

export const LAUNCHED_REGIONS = REGIONS.filter((region) => region.launched);
export function regionById(id: string): Region | undefined { return REGIONS.find((region) => region.id === id); }
export function languageByCode(regionId: string, code: string): RegionLanguage | undefined { return regionById(regionId)?.languages.find((language) => language.code === code); }
