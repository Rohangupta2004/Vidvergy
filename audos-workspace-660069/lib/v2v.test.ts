import { chooseV2VRoute, planV2VWindows } from './v2v';

export function runV2VRegression() {
  const windows = planV2VWindows(20);
  if (windows.length !== 3) throw new Error(`Expected 3 Omni windows for 20 seconds, got ${windows.length}.`);
  if (chooseV2VRoute('make it night', false) !== 'omni') throw new Error('Style edits must route to Omni.');
  if (chooseV2VRoute('put my bottle in her hand', true) !== 'runway-product-swap') throw new Error('Product replacement must route to Runway product_swap.');
  return { pass: true, windows };
}

export const V2V_REGRESSION = runV2VRegression();
