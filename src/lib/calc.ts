// 月額コストの計算。段階料金(ボリュームディスカウント)を境界で分割して積み上げる。

import type { RegionPrices, Tier, Usage } from './types';

/** 使用量を段階料金へ割り当てて合計USDを返す。 */
export function tieredCost(tiers: Tier[], quantity: number): number {
  if (quantity <= 0) return 0;
  let total = 0;
  for (const [begin, end, rate] of tiers) {
    const upper = end === null ? quantity : Math.min(end, quantity);
    if (upper <= begin) continue;
    total += (upper - begin) * rate;
  }
  return total;
}

export interface CostLine {
  label: string;
  quantity: number;
  unit: string;
  usd: number;
}

export interface ServiceCost {
  service: 'lambda' | 'apiGateway' | 'dynamoDb' | 's3';
  label: string;
  usd: number;
  lines: CostLine[];
}

export interface CostResult {
  total: number;
  services: ServiceCost[];
}

/** Lambdaの実行時間をGB秒へ換算する。 */
export function lambdaGbSeconds(requests: number, durationMs: number, memoryMb: number): number {
  return requests * (durationMs / 1000) * (memoryMb / 1024);
}

/** リージョン料金と使用量から、サービス別の月額内訳を計算する。 */
export function computeCosts(prices: RegionPrices, usage: Usage): CostResult {
  const arm = usage.lambda.architecture === 'arm';
  const gbSeconds = lambdaGbSeconds(
    usage.lambda.requests,
    usage.lambda.durationMs,
    usage.lambda.memoryMb,
  );
  const services: ServiceCost[] = [
    {
      service: 'lambda',
      label: 'Lambda',
      usd: 0,
      lines: [
        {
          label: 'リクエスト',
          quantity: usage.lambda.requests,
          unit: '回',
          usd: tieredCost(
            arm ? prices.lambda.requestsArm : prices.lambda.requests,
            usage.lambda.requests,
          ),
        },
        {
          label: '実行時間',
          quantity: gbSeconds,
          unit: 'GB秒',
          usd: tieredCost(arm ? prices.lambda.gbSecondArm : prices.lambda.gbSecond, gbSeconds),
        },
      ],
    },
    {
      service: 'apiGateway',
      label: 'API Gateway',
      usd: 0,
      lines: [
        {
          label: 'HTTP APIリクエスト',
          quantity: usage.apiGateway.httpRequests,
          unit: '回',
          usd: tieredCost(prices.apiGateway.httpRequests, usage.apiGateway.httpRequests),
        },
        {
          label: 'REST APIリクエスト',
          quantity: usage.apiGateway.restRequests,
          unit: '回',
          usd: tieredCost(prices.apiGateway.restRequests, usage.apiGateway.restRequests),
        },
      ],
    },
    {
      service: 'dynamoDb',
      label: 'DynamoDB',
      usd: 0,
      lines: [
        {
          label: '読み込み(オンデマンド)',
          quantity: usage.dynamoDb.reads,
          unit: 'RRU',
          usd: tieredCost(prices.dynamoDb.readRequestUnits, usage.dynamoDb.reads),
        },
        {
          label: '書き込み(オンデマンド)',
          quantity: usage.dynamoDb.writes,
          unit: 'WRU',
          usd: tieredCost(prices.dynamoDb.writeRequestUnits, usage.dynamoDb.writes),
        },
        {
          label: 'ストレージ',
          quantity: usage.dynamoDb.storageGb,
          unit: 'GB',
          usd: tieredCost(prices.dynamoDb.storage, usage.dynamoDb.storageGb),
        },
      ],
    },
    {
      service: 's3',
      label: 'S3(標準)',
      usd: 0,
      lines: [
        {
          label: 'ストレージ',
          quantity: usage.s3.storageGb,
          unit: 'GB',
          usd: tieredCost(prices.s3.storage, usage.s3.storageGb),
        },
        {
          label: 'PUT / POST / LIST',
          quantity: usage.s3.putRequests,
          unit: '回',
          usd: tieredCost(prices.s3.tier1Requests, usage.s3.putRequests),
        },
        {
          label: 'GET / SELECT',
          quantity: usage.s3.getRequests,
          unit: '回',
          usd: tieredCost(prices.s3.tier2Requests, usage.s3.getRequests),
        },
      ],
    },
  ];
  for (const service of services) {
    service.usd = service.lines.reduce((sum, line) => sum + line.usd, 0);
  }
  return { total: services.reduce((sum, s) => sum + s.usd, 0), services };
}

/** USD表示。1セント未満の端数も意味を持つため、小さい金額は精度を上げる。 */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 数量表示。整数は桁区切り、小数は2桁まで。 */
export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
