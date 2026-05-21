// 画面の組み立て。計算は src/lib/calc.ts、状態の共有は src/lib/share.ts に分離してあり、
// ここでは入力の読み書きと描画だけを行う。

import { computeCosts, formatQuantity, formatUsd, type CostResult } from './lib/calc';
import { decodeState, encodeState } from './lib/share';
import {
  REGION_LABELS,
  emptyUsage,
  type PriceData,
  type Usage,
  type Architecture,
} from './lib/types';
import priceData from './data/prices.json';

const PRICES = priceData as unknown as PriceData;

const SERVICE_COLORS: Record<string, string> = {
  lambda: '#c47c1f',
  apiGateway: '#7d4fbe',
  dynamoDb: '#3b66db',
  s3: '#2e8b57',
};

const BRAND_MARK =
  '<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="6" width="44" height="52" rx="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 16h28v10H18z" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linejoin="round"/><path d="M20 36h6M29 36h6M38 36h6M20 46h6M29 46h6M38 46h6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function numberField(id: string, label: string, unit: string, step = 1): string {
  return `<label class="field" for="${id}">
    <span class="field-label">${label}</span>
    <span class="field-input"><input id="${id}" type="number" min="0" step="${step}" inputmode="decimal" /><span class="unit">${unit}</span></span>
  </label>`;
}

function donutSvg(result: CostResult): string {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segments = result.services
    .filter((s) => s.usd > 0)
    .map((s) => {
      const ratio = s.usd / result.total;
      const dash = ratio * c;
      const seg = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${SERVICE_COLORS[s.service]}"
        stroke-width="18" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}"
        transform="rotate(-90 70 70)"/>`;
      offset += dash;
      return seg;
    })
    .join('');
  const empty = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--border)" stroke-width="18"/>`;
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="サービス別コスト構成比">
    <title>サービス別コスト構成比</title>
    ${result.total > 0 ? segments : empty}
    <text class="donut-total" x="70" y="66" text-anchor="middle">${esc(formatUsd(result.total))}</text>
    <text class="donut-caption" x="70" y="84" text-anchor="middle">/ 月</text>
  </svg>`;
}

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
  <header class="site-header">
    <div class="brand">${BRAND_MARK}<span class="brand-name">aws-dentaku</span></div>
    <p class="tagline">サーバーレス構成の月額AWS料金を、公開料金データに基づいて見積もるブラウザ電卓</p>
  </header>
  <div class="controls">
    <label class="control">リージョン
      <select id="region">
        ${Object.entries(REGION_LABELS)
          .map(([id, label]) => `<option value="${id}">${esc(label)} ${id}</option>`)
          .join('')}
      </select>
    </label>
    <fieldset class="control arch">
      <legend>Lambdaアーキテクチャ</legend>
      <label><input type="radio" name="arch" value="x86" checked /> x86_64</label>
      <label><input type="radio" name="arch" value="arm" /> arm64</label>
    </fieldset>
  </div>
  <main>
    <div class="inputs">
      <section class="pane" aria-labelledby="lambda-h">
        <h2 id="lambda-h"><span class="dot" style="background:${SERVICE_COLORS.lambda}"></span>Lambda</h2>
        ${numberField('lambda-requests', 'リクエスト数', '回/月')}
        ${numberField('lambda-duration', '平均実行時間', 'ms')}
        ${numberField('lambda-memory', 'メモリ', 'MB', 64)}
      </section>
      <section class="pane" aria-labelledby="apigw-h">
        <h2 id="apigw-h"><span class="dot" style="background:${SERVICE_COLORS.apiGateway}"></span>API Gateway</h2>
        ${numberField('apigw-http', 'HTTP APIリクエスト', '回/月')}
        ${numberField('apigw-rest', 'REST APIリクエスト', '回/月')}
      </section>
      <section class="pane" aria-labelledby="ddb-h">
        <h2 id="ddb-h"><span class="dot" style="background:${SERVICE_COLORS.dynamoDb}"></span>DynamoDB(オンデマンド)</h2>
        ${numberField('ddb-reads', '読み込み要求', 'RRU/月')}
        ${numberField('ddb-writes', '書き込み要求', 'WRU/月')}
        ${numberField('ddb-storage', 'ストレージ', 'GB', 0.1)}
      </section>
      <section class="pane" aria-labelledby="s3-h">
        <h2 id="s3-h"><span class="dot" style="background:${SERVICE_COLORS.s3}"></span>S3(標準ストレージ)</h2>
        ${numberField('s3-storage', 'ストレージ', 'GB', 0.1)}
        ${numberField('s3-put', 'PUT / POST / LIST', '回/月')}
        ${numberField('s3-get', 'GET / SELECT', '回/月')}
      </section>
    </div>
    <section class="pane result-pane" aria-labelledby="result-h">
      <div class="pane-head">
        <h2 id="result-h">月額見積もり</h2>
        <button type="button" id="share" class="ghost">共有URLをコピー</button>
      </div>
      <div id="result" aria-live="polite"></div>
      <p class="note">料金データ: ${esc(new Date(PRICES.generatedAt).toISOString().slice(0, 10))} 時点の AWS Price List Bulk API(オンデマンド・USD・税抜)。無料利用枠・データ転送・Provisioned Concurrency などは含まない。</p>
    </section>
  </main>
  <footer class="site-footer">
    <p>計算はすべてブラウザ内で完結し、入力が外部へ送信されることはない。</p>
  </footer>`;

  const regionEl = root.querySelector('#region') as HTMLSelectElement;
  const resultEl = root.querySelector('#result') as HTMLDivElement;
  const shareEl = root.querySelector('#share') as HTMLButtonElement;
  const field = (id: string) => root.querySelector(`#${id}`) as HTMLInputElement;

  const fields = {
    lambdaRequests: field('lambda-requests'),
    lambdaDuration: field('lambda-duration'),
    lambdaMemory: field('lambda-memory'),
    apigwHttp: field('apigw-http'),
    apigwRest: field('apigw-rest'),
    ddbReads: field('ddb-reads'),
    ddbWrites: field('ddb-writes'),
    ddbStorage: field('ddb-storage'),
    s3Storage: field('s3-storage'),
    s3Put: field('s3-put'),
    s3Get: field('s3-get'),
  };

  const num = (el: HTMLInputElement) => {
    const v = Number(el.value);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };

  function readUsage(): Usage {
    const arch = (root.querySelector('input[name="arch"]:checked') as HTMLInputElement)
      .value as Architecture;
    return {
      lambda: {
        requests: num(fields.lambdaRequests),
        durationMs: num(fields.lambdaDuration),
        memoryMb: num(fields.lambdaMemory),
        architecture: arch,
      },
      apiGateway: { httpRequests: num(fields.apigwHttp), restRequests: num(fields.apigwRest) },
      dynamoDb: {
        reads: num(fields.ddbReads),
        writes: num(fields.ddbWrites),
        storageGb: num(fields.ddbStorage),
      },
      s3: {
        storageGb: num(fields.s3Storage),
        putRequests: num(fields.s3Put),
        getRequests: num(fields.s3Get),
      },
    };
  }

  function writeUsage(usage: Usage, region: string): void {
    regionEl.value = region in PRICES.regions ? region : 'ap-northeast-1';
    fields.lambdaRequests.value = String(usage.lambda.requests);
    fields.lambdaDuration.value = String(usage.lambda.durationMs);
    fields.lambdaMemory.value = String(usage.lambda.memoryMb);
    fields.apigwHttp.value = String(usage.apiGateway.httpRequests);
    fields.apigwRest.value = String(usage.apiGateway.restRequests);
    fields.ddbReads.value = String(usage.dynamoDb.reads);
    fields.ddbWrites.value = String(usage.dynamoDb.writes);
    fields.ddbStorage.value = String(usage.dynamoDb.storageGb);
    fields.s3Storage.value = String(usage.s3.storageGb);
    fields.s3Put.value = String(usage.s3.putRequests);
    fields.s3Get.value = String(usage.s3.getRequests);
    const arch = root.querySelector(
      `input[name="arch"][value="${usage.lambda.architecture}"]`,
    ) as HTMLInputElement;
    arch.checked = true;
  }

  function render(): void {
    const usage = readUsage();
    const region = regionEl.value;
    const prices = PRICES.regions[region];
    if (!prices) return;
    const result = computeCosts(prices, usage);
    const rows = result.services
      .map((s, i) => {
        const lines = s.lines
          .filter((line) => line.quantity > 0)
          .map(
            (line) =>
              `<li><span>${esc(line.label)} <span class="qty">${formatQuantity(line.quantity)} ${esc(line.unit)}</span></span><span class="usd">${esc(formatUsd(line.usd))}</span></li>`,
          )
          .join('');
        return `<div class="svc" style="--i:${i}">
          <div class="svc-head">
            <span class="dot" style="background:${SERVICE_COLORS[s.service]}"></span>
            <span class="svc-name">${esc(s.label)}</span>
            <span class="svc-usd">${esc(formatUsd(s.usd))}</span>
          </div>
          ${lines ? `<ul class="svc-lines">${lines}</ul>` : ''}
        </div>`;
      })
      .join('');
    resultEl.innerHTML = `${donutSvg(result)}<div class="svcs">${rows}</div>`;
    history.replaceState(null, '', `#${encodeState({ region, usage })}`);
  }

  root.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', render));

  shareEl.addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(() => {
      shareEl.textContent = 'コピーした';
      setTimeout(() => {
        shareEl.textContent = '共有URLをコピー';
      }, 1500);
    });
  });

  const restored = decodeState(location.hash);
  if (restored) {
    writeUsage(restored.usage, restored.region);
  } else {
    // 典型的な小規模サーバーレスAPIを初期値にして、触る前から結果が見えるようにする
    const usage = emptyUsage();
    usage.lambda = { requests: 3_000_000, durationMs: 120, memoryMb: 512, architecture: 'arm' };
    usage.apiGateway.httpRequests = 3_000_000;
    usage.dynamoDb = { reads: 5_000_000, writes: 1_000_000, storageGb: 10 };
    usage.s3 = { storageGb: 50, putRequests: 100_000, getRequests: 2_000_000 };
    writeUsage(usage, 'ap-northeast-1');
  }
  render();
}
