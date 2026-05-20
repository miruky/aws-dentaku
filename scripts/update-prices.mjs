// Price List Bulk APIから対象サービスのオファーを取得し、src/data/prices.json を再生成する。
// 認証不要の公開エンドポイントのみを使う。GitHub Actionsの定期実行からも呼ばれる。

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegionPrices, REGION_PREFIXES } from './transform.mjs';

const ENDPOINT = 'https://pricing.us-east-1.amazonaws.com';
const SERVICES = ['AWSLambda', 'AmazonApiGateway', 'AmazonDynamoDB', 'AmazonS3'];
const REGIONS = Object.keys(REGION_PREFIXES);

async function fetchOffer(service, region) {
  const url = `${ENDPOINT}/offers/v1.0/aws/${service}/current/${region}/index.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${service}/${region}: HTTP ${res.status}`);
  return res.json();
}

const regions = {};
for (const region of REGIONS) {
  const offers = {};
  for (const service of SERVICES) {
    process.stdout.write(`fetch ${service} ${region}\n`);
    offers[service] = await fetchOffer(service, region);
  }
  const { prices, missing } = buildRegionPrices(region, offers);
  if (missing.length > 0) {
    throw new Error(`${region}: 料金が見つからないusagetype: ${missing.join(', ')}`);
  }
  regions[region] = prices;
}

const data = {
  generatedAt: new Date().toISOString(),
  endpoint: ENDPOINT,
  regions,
};

const out = join(dirname(fileURLToPath(import.meta.url)), '../src/data/prices.json');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(data, null, 2)}\n`);
process.stdout.write(`wrote ${out}\n`);
