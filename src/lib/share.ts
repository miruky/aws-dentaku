// 見積もり状態のURL共有。リージョンと使用量をURLハッシュへ可逆に詰める。

import { emptyUsage, type Architecture, type Usage } from './types';

export interface ShareState {
  region: string;
  usage: Usage;
}

// キーを短縮した配列表現にして、URLに収まる長さへ圧縮する
type Packed = [string, number[], Architecture];

function pack(state: ShareState): Packed {
  const u = state.usage;
  return [
    state.region,
    [
      u.lambda.requests,
      u.lambda.durationMs,
      u.lambda.memoryMb,
      u.apiGateway.httpRequests,
      u.apiGateway.restRequests,
      u.dynamoDb.reads,
      u.dynamoDb.writes,
      u.dynamoDb.storageGb,
      u.s3.storageGb,
      u.s3.putRequests,
      u.s3.getRequests,
    ],
    u.lambda.architecture,
  ];
}

/** 状態をURLハッシュ用の文字列へ変換する。 */
export function encodeState(state: ShareState): string {
  const json = JSON.stringify(pack(state));
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URLハッシュ文字列から状態を復元する。壊れた入力は undefined。 */
export function decodeState(hash: string): ShareState | undefined {
  try {
    const b64 = hash.replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    const parsed: unknown = JSON.parse(atob(b64));
    if (!Array.isArray(parsed) || parsed.length !== 3) return undefined;
    const [region, values, architecture] = parsed as [unknown, unknown, unknown];
    if (typeof region !== 'string') return undefined;
    if (architecture !== 'x86' && architecture !== 'arm') return undefined;
    if (
      !Array.isArray(values) ||
      values.length !== 11 ||
      !values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    ) {
      return undefined;
    }
    const v = values as number[];
    const usage = emptyUsage();
    usage.lambda = {
      requests: v[0] as number,
      durationMs: v[1] as number,
      memoryMb: v[2] as number,
      architecture,
    };
    usage.apiGateway = { httpRequests: v[3] as number, restRequests: v[4] as number };
    usage.dynamoDb = {
      reads: v[5] as number,
      writes: v[6] as number,
      storageGb: v[7] as number,
    };
    usage.s3 = {
      storageGb: v[8] as number,
      putRequests: v[9] as number,
      getRequests: v[10] as number,
    };
    return { region, usage };
  } catch {
    return undefined;
  }
}
