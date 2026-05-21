// 見積もりの内訳を、貼り付けやすいMarkdownの表にする。

import { formatQuantity, formatUsd, type CostResult } from './calc';
import { REGION_LABELS } from './types';

export interface ExportContext {
  region: string;
  generatedAt: string;
  jpy?: { rate: number; total: string };
}

export function breakdownMarkdown(result: CostResult, ctx: ExportContext): string {
  const regionLabel = REGION_LABELS[ctx.region] ?? ctx.region;
  const lines: string[] = [];
  lines.push(`# AWS月額見積もり(${regionLabel})`);
  lines.push('');
  lines.push('| サービス | 項目 | 数量 | 月額(USD) |');
  lines.push('| :-- | :-- | --: | --: |');
  for (const service of result.services) {
    const active = service.lines.filter((line) => line.quantity > 0);
    if (active.length === 0) continue;
    active.forEach((line, i) => {
      const name = i === 0 ? service.label : '';
      lines.push(
        `| ${name} | ${line.label} | ${formatQuantity(line.quantity)} ${line.unit} | ${formatUsd(line.usd)} |`,
      );
    });
  }
  lines.push(`| **合計** | | | **${formatUsd(result.total)}** |`);
  if (ctx.jpy) {
    lines.push(`| **円換算** | | | **${ctx.jpy.total}**(1USD=${ctx.jpy.rate}円) |`);
  }
  lines.push('');
  lines.push(`料金データ: ${ctx.generatedAt.slice(0, 10)} 時点・オンデマンド・税抜。`);
  return lines.join('\n');
}
