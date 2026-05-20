import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from './share';
import { emptyUsage } from './types';

describe('encodeState / decodeState', () => {
  it('状態を往復で保てる', () => {
    const usage = emptyUsage();
    usage.lambda = { requests: 5_000_000, durationMs: 250, memoryMb: 512, architecture: 'arm' };
    usage.s3 = { storageGb: 120.5, putRequests: 10_000, getRequests: 2_000_000 };
    const encoded = encodeState({ region: 'ap-northeast-1', usage });
    const decoded = decodeState(encoded);
    expect(decoded).toEqual({ region: 'ap-northeast-1', usage });
  });

  it('URLに安全な文字だけを使う', () => {
    const usage = emptyUsage();
    usage.dynamoDb.reads = 123_456_789;
    const encoded = encodeState({ region: 'us-east-1', usage });
    expect(encoded).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('先頭の # を許容する', () => {
    const encoded = encodeState({ region: 'eu-west-1', usage: emptyUsage() });
    expect(decodeState(`#${encoded}`)?.region).toBe('eu-west-1');
  });

  it('壊れた入力は undefined', () => {
    expect(decodeState('')).toBeUndefined();
    expect(decodeState('not-base64!!!')).toBeUndefined();
    expect(decodeState(btoa('{"a":1}'))).toBeUndefined();
    expect(decodeState(btoa('["r",[1,2],"x86"]'))).toBeUndefined();
    expect(decodeState(btoa('["r",[-1,0,0,0,0,0,0,0,0,0,0],"x86"]'))).toBeUndefined();
  });
});
