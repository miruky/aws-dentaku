// よくある規模のサーバーレス構成を、触る前の出発点として用意する。
// 小→中→大の順で使用量が増え、見積もりもこの順に大きくなる。

import { emptyUsage, type Usage } from './types';

export interface Preset {
  id: string;
  label: string;
  description: string;
  usage: Usage;
}

function make(partial: {
  lambda: Usage['lambda'];
  apiGateway: Usage['apiGateway'];
  dynamoDb: Usage['dynamoDb'];
  s3: Usage['s3'];
}): Usage {
  return { ...emptyUsage(), ...partial };
}

export const PRESETS: Preset[] = [
  {
    id: 'hobby',
    label: '個人開発',
    description: '月数十万リクエストの小さなAPI',
    usage: make({
      lambda: { requests: 300_000, durationMs: 80, memoryMb: 256, architecture: 'arm' },
      apiGateway: { httpRequests: 300_000, restRequests: 0 },
      dynamoDb: { reads: 600_000, writes: 150_000, storageGb: 1 },
      s3: { storageGb: 5, putRequests: 10_000, getRequests: 200_000 },
    }),
  },
  {
    id: 'startup',
    label: 'スタートアップ',
    description: '月数百万リクエストの実運用API',
    usage: make({
      lambda: { requests: 3_000_000, durationMs: 120, memoryMb: 512, architecture: 'arm' },
      apiGateway: { httpRequests: 3_000_000, restRequests: 0 },
      dynamoDb: { reads: 5_000_000, writes: 1_000_000, storageGb: 10 },
      s3: { storageGb: 50, putRequests: 100_000, getRequests: 2_000_000 },
    }),
  },
  {
    id: 'scale',
    label: '成長期',
    description: '月数千万〜億リクエストの本番',
    usage: make({
      lambda: { requests: 80_000_000, durationMs: 150, memoryMb: 1024, architecture: 'arm' },
      apiGateway: { httpRequests: 80_000_000, restRequests: 0 },
      dynamoDb: { reads: 150_000_000, writes: 40_000_000, storageGb: 200 },
      s3: { storageGb: 1_000, putRequests: 5_000_000, getRequests: 80_000_000 },
    }),
  },
];
