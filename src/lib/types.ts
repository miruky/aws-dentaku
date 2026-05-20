// 料金データと使用量入力の型。prices.json は scripts/update-prices.mjs が生成する。

/** 段階料金: [開始量, 終了量(nullは無制限), USD単価] */
export type Tier = [number, number | null, number];

export interface LambdaPrices {
  requests: Tier[];
  requestsArm: Tier[];
  gbSecond: Tier[];
  gbSecondArm: Tier[];
}

export interface ApiGatewayPrices {
  httpRequests: Tier[];
  restRequests: Tier[];
}

export interface DynamoDbPrices {
  readRequestUnits: Tier[];
  writeRequestUnits: Tier[];
  storage: Tier[];
}

export interface S3Prices {
  storage: Tier[];
  tier1Requests: Tier[];
  tier2Requests: Tier[];
}

export interface RegionPrices {
  lambda: LambdaPrices;
  apiGateway: ApiGatewayPrices;
  dynamoDb: DynamoDbPrices;
  s3: S3Prices;
}

export interface PriceData {
  generatedAt: string;
  endpoint: string;
  regions: Record<string, RegionPrices>;
}

export type Architecture = 'x86' | 'arm';

/** 月あたりの使用量。すべて0以上の数値。 */
export interface Usage {
  lambda: {
    requests: number;
    durationMs: number;
    memoryMb: number;
    architecture: Architecture;
  };
  apiGateway: {
    httpRequests: number;
    restRequests: number;
  };
  dynamoDb: {
    reads: number;
    writes: number;
    storageGb: number;
  };
  s3: {
    storageGb: number;
    putRequests: number;
    getRequests: number;
  };
}

export const REGION_LABELS: Record<string, string> = {
  'ap-northeast-1': 'アジアパシフィック(東京)',
  'us-east-1': '米国東部(バージニア北部)',
  'us-west-2': '米国西部(オレゴン)',
  'eu-west-1': '欧州(アイルランド)',
};

export function emptyUsage(): Usage {
  return {
    lambda: { requests: 0, durationMs: 0, memoryMb: 128, architecture: 'x86' },
    apiGateway: { httpRequests: 0, restRequests: 0 },
    dynamoDb: { reads: 0, writes: 0, storageGb: 0 },
    s3: { storageGb: 0, putRequests: 0, getRequests: 0 },
  };
}
