// 画面の組み立て。計算は src/lib/calc.ts、状態の共有は src/lib/share.ts に分離してあり、
// ここでは入力の読み書き、テーマ、保存・共有、描画を受け持つ。

import { computeCosts, formatJpy, formatQuantity, formatUsd, type CostResult } from './lib/calc';
import { decodeState, encodeState, type ShareState } from './lib/share';
import { PRESETS } from './lib/presets';
import { breakdownMarkdown } from './lib/export';
import {
  REGION_LABELS,
  emptyUsage,
  type PriceData,
  type Usage,
  type Architecture,
} from './lib/types';
import {
  isThemePref,
  nextTheme,
  resolveTheme,
  THEME_KEY,
  THEME_LABELS,
  type ThemePref,
} from './lib/theme';
import priceData from './data/prices.json';

const PRICES = priceData as unknown as PriceData;
const STORAGE_KEY = 'aws-dentaku:v1';
const RATE_KEY = 'aws-dentaku:jpy';
const DEFAULT_RATE = 150;

function loadRate(): number {
  try {
    const raw = Number(localStorage.getItem(RATE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RATE;
  } catch {
    return DEFAULT_RATE;
  }
}

// サービスの分類色はテーマに追従させたいので、値はCSS変数で持つ。
const SERVICE_VARS: Record<string, string> = {
  lambda: '--c-lambda',
  apiGateway: '--c-apigw',
  dynamoDb: '--c-ddb',
  s3: '--c-s3',
};

const BRAND_MARK =
  '<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="6" width="44" height="52" rx="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M18 16h28v9H18z" fill="none" stroke="var(--accent)" stroke-width="3"/><path d="M20 36h6M29 36h6M38 36h6M20 46h6M29 46h6M38 46h6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

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
      const seg = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="var(${SERVICE_VARS[s.service]})"
        stroke-width="16" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}"
        stroke-linecap="butt" transform="rotate(-90 70 70)"/>`;
      offset += dash;
      return seg;
    })
    .join('');
  const empty = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--hair-strong)" stroke-width="16"/>`;
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="サービス別コスト構成比">
    <title>サービス別コスト構成比</title>
    ${result.total > 0 ? segments : empty}
  </svg>`;
}

function defaultState(): ShareState {
  // 典型的な小規模サーバーレスAPIを初期値にして、触る前から結果が見えるようにする。
  const usage = emptyUsage();
  usage.lambda = { requests: 3_000_000, durationMs: 120, memoryMb: 512, architecture: 'arm' };
  usage.apiGateway.httpRequests = 3_000_000;
  usage.dynamoDb = { reads: 5_000_000, writes: 1_000_000, storageGb: 10 };
  usage.s3 = { storageGb: 50, putRequests: 100_000, getRequests: 2_000_000 };
  return { region: 'ap-northeast-1', usage };
}

function loadState(): ShareState {
  const fromHash = decodeState(location.hash);
  if (fromHash) return fromHash;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const decoded = decodeState(raw);
      if (decoded) return decoded;
    }
  } catch {
    // localStorageが使えない環境でも既定で動く
  }
  return defaultState();
}

function loadThemePref(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isThemePref(raw) ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export function mountApp(root: HTMLElement): void {
  let themePref = loadThemePref();
  const media =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme(): void {
    document.documentElement.dataset.theme = resolveTheme(themePref, media?.matches ?? false);
  }

  root.innerHTML = `
  <header class="site-header reveal">
    <div class="masthead">
      <div class="brand">${BRAND_MARK}<span class="brand-name">aws-dentaku</span></div>
      <button type="button" id="theme" class="theme-toggle">
        <span class="theme-toggle__label">テーマ</span>
        <span class="theme-toggle__value" data-theme-value></span>
      </button>
    </div>
    <p class="kicker">SERVERLESS COST ESTIMATE</p>
    <h1 class="headline">サーバーレス構成の月額を、<br>公開された料金から見積もる。</h1>
    <p class="lede">Lambda・API Gateway・DynamoDB・S3 の使用量を入れると、AWS Price List のオンデマンド単価で月額を試算します。計算はブラウザ内で完結し、入力は外部へ送られません。</p>
  </header>

  <div class="controls reveal">
    <label class="control">
      <span class="control__label">リージョン</span>
      <select id="region">
        ${Object.entries(REGION_LABELS)
          .map(([id, label]) => `<option value="${id}">${esc(label)} ${id}</option>`)
          .join('')}
      </select>
    </label>
    <fieldset class="control arch">
      <legend class="control__label">Lambda アーキテクチャ</legend>
      <label class="choice"><input type="radio" name="arch" value="x86" checked /> x86_64</label>
      <label class="choice"><input type="radio" name="arch" value="arm" /> arm64</label>
    </fieldset>
    <div class="control presets">
      <span class="control__label">構成プリセット</span>
      <div class="preset-btns">
        ${PRESETS.map(
          (p) =>
            `<button type="button" class="preset" data-preset="${p.id}" title="${esc(p.description)}">${esc(p.label)}</button>`,
        ).join('')}
      </div>
    </div>
  </div>

  <main class="reveal">
    <div class="inputs">
      <section class="pane" aria-labelledby="lambda-h">
        <h2 id="lambda-h" class="pane__title"><span class="dot" style="background:var(--c-lambda)"></span>Lambda</h2>
        ${numberField('lambda-requests', 'リクエスト数', '回/月')}
        ${numberField('lambda-duration', '平均実行時間', 'ms')}
        ${numberField('lambda-memory', 'メモリ', 'MB', 64)}
      </section>
      <section class="pane" aria-labelledby="apigw-h">
        <h2 id="apigw-h" class="pane__title"><span class="dot" style="background:var(--c-apigw)"></span>API Gateway</h2>
        ${numberField('apigw-http', 'HTTP APIリクエスト', '回/月')}
        ${numberField('apigw-rest', 'REST APIリクエスト', '回/月')}
      </section>
      <section class="pane" aria-labelledby="ddb-h">
        <h2 id="ddb-h" class="pane__title"><span class="dot" style="background:var(--c-ddb)"></span>DynamoDB<span class="pane__sub">オンデマンド</span></h2>
        ${numberField('ddb-reads', '読み込み要求', 'RRU/月')}
        ${numberField('ddb-writes', '書き込み要求', 'WRU/月')}
        ${numberField('ddb-storage', 'ストレージ', 'GB', 0.1)}
      </section>
      <section class="pane" aria-labelledby="s3-h">
        <h2 id="s3-h" class="pane__title"><span class="dot" style="background:var(--c-s3)"></span>S3<span class="pane__sub">標準ストレージ</span></h2>
        ${numberField('s3-storage', 'ストレージ', 'GB', 0.1)}
        ${numberField('s3-put', 'PUT / POST / LIST', '回/月')}
        ${numberField('s3-get', 'GET / SELECT', '回/月')}
      </section>
    </div>

    <aside class="result-pane" aria-labelledby="result-h">
      <div class="pane-head">
        <p class="kicker">月額見積もり</p>
        <div class="pane-actions">
          <button type="button" id="export" class="ghost">内訳をコピー</button>
          <button type="button" id="share" class="ghost">共有URLをコピー</button>
        </div>
      </div>
      <div class="total" aria-live="polite">
        <span class="total__usd" data-total>$0.00</span>
        <span class="total__per">/ 月</span>
      </div>
      <div class="jpy">
        <span class="jpy__amount" data-jpy>—</span>
        <label class="jpy__rate">1 USD =
          <input id="rate" type="number" min="1" step="1" inputmode="decimal" />
          円
        </label>
      </div>
      <div class="donut-wrap" data-donut>${donutSvg(
        computeCosts(PRICES.regions['ap-northeast-1']!, emptyUsage()),
      )}</div>
      <div id="result"></div>
      <p class="note" data-note></p>
    </aside>
  </main>

  <footer class="site-footer reveal">
    <p>計算はすべてブラウザ内で完結し、入力が外部へ送信されることはありません。</p>
  </footer>`;

  const $ = <T extends HTMLElement>(sel: string): T => {
    const el = root.querySelector<T>(sel);
    if (el === null) throw new Error(`要素が見つからない: ${sel}`);
    return el;
  };

  const regionEl = $<HTMLSelectElement>('#region');
  const resultEl = $<HTMLDivElement>('#result');
  const totalEl = $('[data-total]');
  const jpyEl = $('[data-jpy]');
  const rateEl = $<HTMLInputElement>('#rate');
  const noteEl = $('[data-note]');
  const shareEl = $<HTMLButtonElement>('#share');
  const exportEl = $<HTMLButtonElement>('#export');
  const themeEl = $<HTMLButtonElement>('#theme');
  const themeValueEl = $('[data-theme-value]');
  const donutWrapEl = $('[data-donut]');
  const field = (id: string) => $<HTMLInputElement>(`#${id}`);

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

  const currentRate = () => {
    const v = Number(rateEl.value);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_RATE;
  };

  function readUsage(): Usage {
    const arch = $<HTMLInputElement>('input[name="arch"]:checked').value as Architecture;
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
    $<HTMLInputElement>(`input[name="arch"][value="${usage.lambda.architecture}"]`).checked = true;
  }

  function render(): void {
    const usage = readUsage();
    const region = regionEl.value;
    const prices = PRICES.regions[region];
    if (!prices) return;
    const result = computeCosts(prices, usage);

    totalEl.textContent = formatUsd(result.total);
    jpyEl.textContent = `≈ ${formatJpy(result.total, currentRate())}`;
    donutWrapEl.innerHTML = donutSvg(result);

    const rows = result.services
      .map((s, i) => {
        const lines = s.lines
          .filter((line) => line.quantity > 0)
          .map(
            (line) =>
              `<li><span class="line-label">${esc(line.label)}<span class="qty">${formatQuantity(line.quantity)} ${esc(line.unit)}</span></span><span class="usd">${esc(formatUsd(line.usd))}</span></li>`,
          )
          .join('');
        return `<div class="svc" style="--i:${i}">
          <div class="svc-head">
            <span class="dot" style="background:var(${SERVICE_VARS[s.service]})"></span>
            <span class="svc-name">${esc(s.label)}</span>
            <span class="svc-usd">${esc(formatUsd(s.usd))}</span>
          </div>
          ${lines ? `<ul class="svc-lines">${lines}</ul>` : ''}
        </div>`;
      })
      .join('');
    resultEl.innerHTML = `<div class="svcs">${rows}</div>`;
    noteEl.textContent = `料金データ: ${new Date(PRICES.generatedAt).toISOString().slice(0, 10)} 時点の AWS Price List Bulk API(オンデマンド・USD・税抜)。無料利用枠・データ転送・Provisioned Concurrency などは含みません。`;

    const state: ShareState = { region, usage };
    const encoded = encodeState(state);
    history.replaceState(null, '', `#${encoded}`);
    try {
      localStorage.setItem(STORAGE_KEY, encoded);
    } catch {
      // 保存できなくても計算は続く
    }
  }

  function syncTheme(): void {
    applyTheme();
    themeValueEl.textContent = THEME_LABELS[themePref];
    themeEl.setAttribute('aria-label', `テーマ: ${THEME_LABELS[themePref]}(押すと切替)`);
  }

  root.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', render));

  rateEl.addEventListener('input', () => {
    try {
      localStorage.setItem(RATE_KEY, String(currentRate()));
    } catch {
      // 保存できなくても表示は更新される
    }
  });

  root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = PRESETS.find((p) => p.id === button.dataset.preset);
      if (preset === undefined) return;
      writeUsage(preset.usage, regionEl.value);
      render();
    });
  });

  exportEl.addEventListener('click', () => {
    const usage = readUsage();
    const prices = PRICES.regions[regionEl.value];
    if (!prices) return;
    const result = computeCosts(prices, usage);
    const rate = currentRate();
    const md = breakdownMarkdown(result, {
      region: regionEl.value,
      generatedAt: PRICES.generatedAt,
      jpy: { rate, total: formatJpy(result.total, rate) },
    });
    void navigator.clipboard
      .writeText(md)
      .then(() => {
        exportEl.textContent = 'コピーしました';
        setTimeout(() => (exportEl.textContent = '内訳をコピー'), 1500);
      })
      .catch(() => {
        exportEl.textContent = 'コピーできません';
        setTimeout(() => (exportEl.textContent = '内訳をコピー'), 1500);
      });
  });

  shareEl.addEventListener('click', () => {
    void navigator.clipboard
      .writeText(location.href)
      .then(() => {
        shareEl.textContent = 'コピーしました';
        setTimeout(() => (shareEl.textContent = '共有URLをコピー'), 1500);
      })
      .catch(() => {
        shareEl.textContent = 'コピーできません';
        setTimeout(() => (shareEl.textContent = '共有URLをコピー'), 1500);
      });
  });

  themeEl.addEventListener('click', () => {
    themePref = nextTheme(themePref);
    try {
      localStorage.setItem(THEME_KEY, themePref);
    } catch {
      // 保存できなくてもセッション中は切り替わる
    }
    syncTheme();
  });

  media?.addEventListener('change', () => {
    if (themePref === 'auto') syncTheme();
  });

  setupReveal(root);

  const initial = loadState();
  rateEl.value = String(loadRate());
  syncTheme();
  writeUsage(initial.usage, initial.region);
  render();
}

// スクロールで各セクションをそっと現す。reduced-motionや
// IntersectionObserver非対応では最初から見えている状態にする。
function setupReveal(root: HTMLElement): void {
  const targets = root.querySelectorAll<HTMLElement>('.reveal');
  const reduce =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof IntersectionObserver !== 'function') {
    targets.forEach((el) => el.classList.add('in'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          obs.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
  );
  targets.forEach((el) => observer.observe(el));
}
