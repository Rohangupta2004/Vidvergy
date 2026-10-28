/**
 * Search-query normalisation for the Faceless asset index.
 *
 * The active workflow no longer searches Pexels or any other stock-video
 * provider. Beats first reuse workspace-owned footage or stills, then generate
 * a durable still and animate that exact frame with an AI video model.
 */

/**
 * Asset matching rewards concrete nouns and punishes editorial language. The
 * director writes intent ("one point multiplying to forty points on a world
 * map"); the workspace index wants "world map network nodes".
 */
export function stockQueryFrom(searchQuery: string | undefined, visualIntent: string): string {
  const source = String(searchQuery || visualIntent || '');
  return source
    .toLowerCase()
    .replace(/\b(shot|footage|clip|b-?roll|cinematic|slow motion|close up|wide|camera|pushes?|pulls?)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
    .trim();
}
