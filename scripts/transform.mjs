// Price List Bulk APIのオファーJSONから、電卓が使う料金表へ変換する純粋関数群。
// 料金は [開始量, 終了量(nullは無制限), USD単価] の段階料金リストへ正規化する。

// リージョンごとのusagetype接頭辞の候補。us-east-1は接頭辞なしが基本だが
// API Gatewayのように "USE1-" を付けるサービスもあるため複数候補を順に試す。
// eu-west-1は歴史的に "EU-" を使う。
export const REGION_PREFIXES = {
  'us-east-1': ['', 'USE1-'],
  'us-west-2': ['USW2-'],
  'eu-west-1': ['EU-', 'EUW1-'],
  'ap-northeast-1': ['APN1-'],
};

/** オファーから usagetype(接頭辞候補+完全一致)のOnDemand段階料金を取り出す。 */
export function tiersFor(offer, prefixes, usagetype) {
  const wanted = new Set(prefixes.map((p) => `${p}${usagetype}`));
  for (const [sku, product] of Object.entries(offer.products)) {
    if (!wanted.has(product.attributes?.usagetype)) continue;
    const term = offer.terms?.OnDemand?.[sku];
    if (!term) continue;
    const dims = Object.values(term).flatMap((t) => Object.values(t.priceDimensions));
    const tiers = dims
      .map((d) => [
        Number(d.beginRange),
        d.endRange === 'Inf' ? null : Number(d.endRange),
        Number(d.pricePerUnit?.USD ?? NaN),
      ])
      .filter(([b, , p]) => Number.isFinite(b) && Number.isFinite(p))
      .sort((a, b) => a[0] - b[0]);
    if (tiers.length > 0) return tiers;
  }
  return undefined;
}

/** 1リージョン分のオファー群を電卓用の料金表へまとめる。欠けたキーは missing に列挙する。 */
export function buildRegionPrices(region, offers) {
  const prefixes = REGION_PREFIXES[region];
  if (prefixes === undefined) throw new Error(`unknown region: ${region}`);
  const missing = [];
  const pick = (offer, usagetype) => {
    const tiers = tiersFor(offer, prefixes, usagetype);
    if (!tiers) missing.push(usagetype);
    return tiers;
  };
  const prices = {
    lambda: {
      requests: pick(offers.AWSLambda, 'Request'),
      requestsArm: pick(offers.AWSLambda, 'Request-ARM'),
      gbSecond: pick(offers.AWSLambda, 'Lambda-GB-Second'),
      gbSecondArm: pick(offers.AWSLambda, 'Lambda-GB-Second-ARM'),
    },
    apiGateway: {
      httpRequests: pick(offers.AmazonApiGateway, 'ApiGatewayHttpRequest'),
      restRequests: pick(offers.AmazonApiGateway, 'ApiGatewayRequest'),
    },
    dynamoDb: {
      readRequestUnits: pick(offers.AmazonDynamoDB, 'ReadRequestUnits'),
      writeRequestUnits: pick(offers.AmazonDynamoDB, 'WriteRequestUnits'),
      storage: pick(offers.AmazonDynamoDB, 'TimedStorage-ByteHrs'),
    },
    s3: {
      storage: pick(offers.AmazonS3, 'TimedStorage-ByteHrs'),
      tier1Requests: pick(offers.AmazonS3, 'Requests-Tier1'),
      tier2Requests: pick(offers.AmazonS3, 'Requests-Tier2'),
    },
  };
  return { prices, missing };
}
