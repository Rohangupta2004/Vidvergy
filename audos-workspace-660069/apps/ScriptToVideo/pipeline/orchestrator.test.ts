import { packPlannedBlocks } from './orchestrator';
import { resolveVideoModel } from './videoModelService';

export function testTwentySecondOmniScene() {
  const model = resolveVideoModel('omni-1.1-flash');
  const blocks = packPlannedBlocks([{ script_segment: 'Open on the product. Show the result clearly. Finish on a clean hero frame.', duration_s: 20, summary: 'Product reveal', visual_goal: 'One continuous product reveal', transition: 'new_shot', timed_beats: [] }], model, 20);
  if (blocks.length !== 3) throw new Error(`Expected 3 Omni blocks for 20 seconds, got ${blocks.length}.`);
  if (blocks.some((block) => block.duration_s > 8 || block.duration_s < 4)) throw new Error(`Expected legal 4–8 second blocks, got ${blocks.map((block) => block.duration_s).join(', ')}.`);
  if (blocks.reduce((sum, block) => sum + block.duration_s, 0) !== 20) throw new Error('The planned blocks must total exactly 20 seconds.');
  return blocks;
}

export const TWENTY_SECOND_OMNI_REGRESSION = testTwentySecondOmniScene();
