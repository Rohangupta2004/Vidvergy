import { WORKSPACE_ID } from './workspace';

export type AmbientTrackId = 'inspiring' | 'cinematic-dark' | 'energetic' | 'calm' | 'luxury' | 'lofi';

export interface AmbientTrack {
  id: AmbientTrackId;
  label: string;
  url: string;
}

const audioBase = `https://storage.googleapis.com/audos-images/workspaces/${WORKSPACE_ID}/audio`;

/** Durable, preloaded music. Playback never starts a generation request. */
export const AMBIENT_TRACKS: readonly AmbientTrack[] = [
  { id: 'inspiring', label: 'Inspiring', url: `${audioBase}/background-music-1790352381300.mp3` },
  { id: 'cinematic-dark', label: 'Cinematic Dark', url: `${audioBase}/background-music-1790352397219.mp3` },
  { id: 'energetic', label: 'Energetic', url: `${audioBase}/background-music-1790352412992.mp3` },
  { id: 'calm', label: 'Calm', url: `${audioBase}/background-music-1790352426863.mp3` },
  { id: 'luxury', label: 'Luxury', url: `${audioBase}/background-music-1790352446075.mp3` },
  // The dedicated Lo-fi render has not been materialized in this workspace yet.
  // Keep playback deterministic and generation-free by reusing the calm bed
  // until the owner-authorized one-time asset generation stores its durable URL.
  { id: 'lofi', label: 'Lo-fi', url: `${audioBase}/background-music-1790352426863.mp3` },
] as const;

export const DEFAULT_AMBIENT_TRACK_ID: AmbientTrackId = 'calm';
export const DEFAULT_AMBIENT_VOLUME = 0.12;

export function ambientTrack(id: AmbientTrackId): AmbientTrack {
  return AMBIENT_TRACKS.find((track) => track.id === id) || AMBIENT_TRACKS[3];
}
