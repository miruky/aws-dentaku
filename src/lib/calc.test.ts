import { describe, it, expect } from 'vitest';
import {
  tieredCost,
  lambdaGbSeconds,
  computeCosts,
  formatUsd,
  formatQuantity,
  formatJpy,
} from './calc';
import { emptyUsage, type RegionPrices, type Tier } from './types';
import priceData from '../data/prices.json';

const flat = (rate: number): Tier[] => [[0, null, rate]];

const prices: RegionPrices = {
  lambda: {
    requests: flat(2e-7),
    requestsArm: flat(2e-7),
    gbSecond: [
      [0, 6_000_000_000, 0.0000166667],
      [6_000_000_000, 15_000_000_000, 0.000015],
      [15_000_000_000, null, 0.0000133334],
    ],
    gbSecondArm: flat(0.0000133334),
  },
  apiGateway: {
    httpRequests: [
      [0, 300_000_000, 0.00000129],
      [300_000_000, null, 0.00000118],
    ],
    restRequests: flat(0.00000425),
  },
  dynamoDb: {
    readRequestUnits: flat(1.425e-7),
    writeRequestUnits: flat(7.15e-7),
    storage: [
      [0, 25, 0],
      [25, null, 0.285],
    ],
  },
  s3: {
    storage: [
      [0, 51_200, 0.025],
      [51_200, 512_000, 0.024],
      [512_000, null, 0.023],
    ],
    tier1Requests: flat(0.0000047),
    tier2Requests: flat(3.7e-7),
  },
};

describe('tieredCost', () => {
  it('単一の無制限段階を計算する', () => {
    expect(tieredCost(flat(0.1), 50)).toBeCloseTo(5);
  });

  it('境界をまたぐ使用量を段階ごとに分割する', () => {
    // 60,000GB: 51,200GBまで0.025、残り8,800GBは0.024
    expect(tieredCost(prices.s3.storage, 60_000)).toBeCloseTo(51_200 * 0.025 + 8_800 * 0.024);
  });

  it('最終段階(無制限)も加算する', () => {
    const expected = 51_200 * 0.025 + (512_000 - 51_200) * 0.024 + 88_000 * 0.023;
    expect(tieredCost(prices.s3.storage, 600_000)).toBeCloseTo(expected);
  });

  it('0円の段階(DynamoDBの25GB無料分)を扱う', () => {
    expect(tieredCost(prices.dynamoDb.storage, 25)).toBe(0);
    expect(tieredCost(prices.dynamoDb.storage, 30)).toBeCloseTo(5 * 0.285);
  });

  it('0以下の使用量は0', () => {
    expect(tieredCost(prices.s3.storage, 0)).toBe(0);
    expect(tieredCost(prices.s3.storage, -1)).toBe(0);
  });
});

describe('lambdaGbSeconds', () => {
  it('リクエスト数・時間・メモリからGB秒を求める', () => {
    // 100万回 x 200ms x 512MB = 100,000 GB秒
    expect(lambdaGbSeconds(1_000_000, 200, 512)).toBeCloseTo(100_000);
  });
});

describe('computeCosts', () => {
  it('未入力なら合計0', () => {
    const result = computeCosts(prices, emptyUsage());
    expect(result.total).toBe(0);
    expect(result.services).toHaveLength(4);
  });

  it('Lambdaのリクエストと実行時間を合算する', () => {
    const usage = emptyUsage();
    usage.lambda = { requests: 10_000_000, durationMs: 100, memoryMb: 1024, architecture: 'x86' };
    const result = computeCosts(prices, usage);
    const lambda = result.services.find((s) => s.service === 'lambda');
    // リクエスト: 1e7 * 2e-7 = 2、実行時間: 1e7 * 0.1 * 1 = 1e6 GB秒 * 0.0000166667
    expect(lambda?.usd).toBeCloseTo(2 + 1_000_000 * 0.0000166667, 4);
  });

  it('ARM選択時はARM単価を使う', () => {
    const usage = emptyUsage();
    usage.lambda = { requests: 1_000_000, durationMs: 1000, memoryMb: 1024, architecture: 'arm' };
    const result = computeCosts(prices, usage);
    const lambda = result.services.find((s) => s.service === 'lambda');
    expect(lambda?.usd).toBeCloseTo(1_000_000 * 2e-7 + 1_000_000 * 0.0000133334, 4);
  });

  it('合計はサービス計と一致する', () => {
    const usage = emptyUsage();
    usage.s3 = { storageGb: 100, putRequests: 100_000, getRequests: 1_000_000 };
    usage.dynamoDb = { reads: 5_000_000, writes: 1_000_000, storageGb: 50 };
    const result = computeCosts(prices, usage);
    const sum = result.services.reduce((acc, s) => acc + s.usd, 0);
    expect(result.total).toBeCloseTo(sum, 10);
  });
});

describe('実データ(prices.json)', () => {
  it('全リージョンが必要な料金キーを持つ', () => {
    const regions = Object.keys(priceData.regions);
    expect(regions.length).toBeGreaterThanOrEqual(4);
    for (const region of regions) {
      const p = priceData.regions[
        region as keyof typeof priceData.regions
      ] as unknown as RegionPrices;
      for (const tiers of [
        p.lambda.requests,
        p.lambda.gbSecond,
        p.apiGateway.httpRequests,
        p.apiGateway.restRequests,
        p.dynamoDb.readRequestUnits,
        p.dynamoDb.writeRequestUnits,
        p.dynamoDb.storage,
        p.s3.storage,
        p.s3.tier1Requests,
        p.s3.tier2Requests,
      ]) {
        expect(tiers.length).toBeGreaterThan(0);
        for (const [begin, , rate] of tiers) {
          expect(begin).toBeGreaterThanOrEqual(0);
          expect(rate).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('生成日時がISO形式で入っている', () => {
    expect(Number.isNaN(Date.parse(priceData.generatedAt))).toBe(false);
  });
});

describe('表示フォーマット', () => {
  it('formatUsd は小さい金額の精度を保つ', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.002)).toBe('$0.002000');
    expect(formatUsd(12.345)).toBe('$12.35');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
  });

  it('formatQuantity は桁区切りする', () => {
    expect(formatQuantity(1_000_000)).toBe('1,000,000');
    expect(formatQuantity(1234.567)).toBe('1,234.57');
  });

  it('formatJpy はレートで円へ概算し整数まるめする', () => {
    expect(formatJpy(10.76, 150)).toBe('¥1,614');
    expect(formatJpy(0, 150)).toBe('¥0');
    expect(formatJpy(10, 0)).toBe('—');
  });
});
