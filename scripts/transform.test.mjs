import { describe, it, expect } from 'vitest';
import { tiersFor, buildRegionPrices } from './transform.mjs';

// オファーJSONの最小構造を組み立てるヘルパー
function offer(entries) {
  const products = {};
  const onDemand = {};
  entries.forEach(({ usagetype, dims }, i) => {
    const sku = `SKU${i}`;
    products[sku] = { attributes: { usagetype } };
    const priceDimensions = {};
    dims.forEach(([begin, end, usd], j) => {
      priceDimensions[`${sku}.D${j}`] = {
        beginRange: String(begin),
        endRange: end === null ? 'Inf' : String(end),
        pricePerUnit: { USD: String(usd) },
      };
    });
    onDemand[sku] = { [`${sku}.T`]: { priceDimensions } };
  });
  return { products, terms: { OnDemand: onDemand } };
}

describe('tiersFor', () => {
  it('接頭辞つきusagetypeの段階料金を開始量順で返す', () => {
    const o = offer([
      {
        usagetype: 'APN1-Lambda-GB-Second',
        dims: [
          [6e9, 15e9, '0.000015'],
          [0, 6e9, '0.0000166667'],
          [15e9, null, '0.0000133334'],
        ],
      },
    ]);
    expect(tiersFor(o, ['APN1-'], 'Lambda-GB-Second')).toEqual([
      [0, 6e9, 0.0000166667],
      [6e9, 15e9, 0.000015],
      [15e9, null, 0.0000133334],
    ]);
  });

  it('複数の接頭辞候補を順に試す', () => {
    const o = offer([{ usagetype: 'USE1-ApiGatewayRequest', dims: [[0, null, '0.0000035']] }]);
    expect(tiersFor(o, ['', 'USE1-'], 'ApiGatewayRequest')).toEqual([[0, null, 0.0000035]]);
  });

  it('完全一致のみ拾う(IA-付きや別名は拾わない)', () => {
    const o = offer([
      { usagetype: 'APN1-IA-TimedStorage-ByteHrs', dims: [[0, null, '0.114']] },
      { usagetype: 'APN1-TimedStorage-ByteHrs', dims: [[0, null, '0.285']] },
    ]);
    expect(tiersFor(o, ['APN1-'], 'TimedStorage-ByteHrs')).toEqual([[0, null, 0.285]]);
  });

  it('見つからなければ undefined', () => {
    const o = offer([{ usagetype: 'APN1-Request', dims: [[0, null, '0.0000002']] }]);
    expect(tiersFor(o, ['APN1-'], 'Missing-Type')).toBeUndefined();
  });
});

describe('buildRegionPrices', () => {
  it('4サービスのオファーから料金表を組み立て、欠落を報告する', () => {
    const offers = {
      AWSLambda: offer([
        { usagetype: 'APN1-Request', dims: [[0, null, '0.0000002']] },
        { usagetype: 'APN1-Request-ARM', dims: [[0, null, '0.0000002']] },
        { usagetype: 'APN1-Lambda-GB-Second', dims: [[0, null, '0.0000166667']] },
        { usagetype: 'APN1-Lambda-GB-Second-ARM', dims: [[0, null, '0.0000133334']] },
      ]),
      AmazonApiGateway: offer([
        { usagetype: 'APN1-ApiGatewayHttpRequest', dims: [[0, null, '0.00000129']] },
      ]),
      AmazonDynamoDB: offer([
        { usagetype: 'APN1-ReadRequestUnits', dims: [[0, null, '0.0000001425']] },
        { usagetype: 'APN1-WriteRequestUnits', dims: [[0, null, '0.000000715']] },
        {
          usagetype: 'APN1-TimedStorage-ByteHrs',
          dims: [
            [0, 25, '0'],
            [25, null, '0.285'],
          ],
        },
      ]),
      AmazonS3: offer([
        { usagetype: 'APN1-TimedStorage-ByteHrs', dims: [[0, null, '0.025']] },
        { usagetype: 'APN1-Requests-Tier1', dims: [[0, null, '0.0000047']] },
        { usagetype: 'APN1-Requests-Tier2', dims: [[0, null, '0.00000037']] },
      ]),
    };
    const { prices, missing } = buildRegionPrices('ap-northeast-1', offers);
    expect(missing).toEqual(['ApiGatewayRequest']);
    expect(prices.lambda.gbSecond).toEqual([[0, null, 0.0000166667]]);
    expect(prices.dynamoDb.storage).toEqual([
      [0, 25, 0],
      [25, null, 0.285],
    ]);
    expect(prices.apiGateway.restRequests).toBeUndefined();
  });

  it('未知のリージョンを拒否する', () => {
    expect(() => buildRegionPrices('mars-central-1', {})).toThrow('unknown region');
  });
});
