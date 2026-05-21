import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';
import { computeCosts } from './calc';
import priceData from '../data/prices.json';
import type { RegionPrices } from './types';

const tokyo = priceData.regions['ap-northeast-1'] as unknown as RegionPrices;

describe('PRESETS', () => {
  it('小→中→大の順に月額が増える', () => {
    const totals = PRESETS.map((p) => computeCosts(tokyo, p.usage).total);
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThan(totals[i - 1] as number);
    }
  });

  it('どのプリセットも0より大きい見積もりになる', () => {
    for (const preset of PRESETS) {
      expect(computeCosts(tokyo, preset.usage).total).toBeGreaterThan(0);
    }
  });

  it('IDが重複しない', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});
