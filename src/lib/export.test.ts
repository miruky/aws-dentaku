import { describe, expect, it } from 'vitest';
import { breakdownMarkdown } from './export';
import { computeCosts } from './calc';
import { emptyUsage, type RegionPrices } from './types';
import priceData from '../data/prices.json';

const tokyo = priceData.regions['ap-northeast-1'] as unknown as RegionPrices;

function sampleResult() {
  const usage = emptyUsage();
  usage.lambda = { requests: 3_000_000, durationMs: 120, memoryMb: 512, architecture: 'arm' };
  usage.s3 = { storageGb: 50, putRequests: 100_000, getRequests: 2_000_000 };
  return computeCosts(tokyo, usage);
}

describe('breakdownMarkdown', () => {
  it('リージョン名と表の見出しを含む', () => {
    const md = breakdownMarkdown(sampleResult(), {
      region: 'ap-northeast-1',
      generatedAt: '2026-05-01T00:00:00Z',
    });
    expect(md).toContain('アジアパシフィック(東京)');
    expect(md).toContain('| サービス | 項目 | 数量 | 月額(USD) |');
    expect(md).toContain('**合計**');
  });

  it('使用量0のサービスは表に出さない', () => {
    const md = breakdownMarkdown(sampleResult(), {
      region: 'ap-northeast-1',
      generatedAt: '2026-05-01T00:00:00Z',
    });
    // この構成では API Gateway も DynamoDB も0なので行が出ない
    expect(md).not.toContain('HTTP APIリクエスト');
    expect(md).toContain('Lambda');
  });

  it('円換算を渡すと合計の下に行が増える', () => {
    const md = breakdownMarkdown(sampleResult(), {
      region: 'us-east-1',
      generatedAt: '2026-05-01T00:00:00Z',
      jpy: { rate: 150, total: '¥1,614' },
    });
    expect(md).toContain('円換算');
    expect(md).toContain('1USD=150円');
  });
});
