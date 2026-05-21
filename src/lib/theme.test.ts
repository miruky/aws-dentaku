import { describe, expect, it } from 'vitest';
import { isThemePref, nextTheme, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('自動はOSの設定に従う', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('明示指定はOSより優先する', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextTheme', () => {
  it('自動→明→暗→自動と巡回する', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});

describe('isThemePref', () => {
  it('既知の値だけを受け付ける', () => {
    expect(isThemePref('auto')).toBe(true);
    expect(isThemePref('dark')).toBe(true);
    expect(isThemePref('sepia')).toBe(false);
    expect(isThemePref(null)).toBe(false);
  });
});
