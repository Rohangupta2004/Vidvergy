/**
 * Models the durable server runner (s2v-recovery-sweeper) can really render
 * with this tab closed. The runner's own RUNNER_MODELS list is the source of
 * truth: Start (stv-scene-generate) reads it and refuses any other model before
 * charging, so this browser copy must name exactly the same ids. Seedance 2.5
 * is not on it and renders only while the tab stays open.
 */
export const RUNNER_MODEL_IDS: ReadonlySet<string> = new Set(['omni-1.1-flash', 'kling-3.0', 'kling-3.0-omni']);

/** Shown on a model card whose clips render only from the open tab. */
export const NEEDS_TAB_NOTE = 'Needs this tab open: it does not render in the background, and each block is charged only when it starts.';
