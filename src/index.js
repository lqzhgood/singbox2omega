// sing-box JSON rule-set → SwitchyOmega / ZeroOmega 规则列表（Switchy 格式）

// 要合并的 sing-box 源格式 rule-set，新增源只需往这里加地址
export const SOURCES = [
  'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/anthropic.json',
  'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo/geosite/openai.json',
];

const CACHE_TTL = 6 * 60 * 60; // 秒

// sing-box 默认规则中这些字段彼此是"或"关系，且都能用 Switchy 条件表达
const CONVERTIBLE = new Set(['domain', 'domain_suffix', 'domain_keyword', 'domain_regex', 'ip_cidr']);

const toArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * 转换单个 rule-set 对象。
 * @returns {{ conditions: string[], skipped: string[] }}
 */
export function convertRuleSet(ruleSet) {
  if (!ruleSet || !Array.isArray(ruleSet.rules)) {
    throw new Error('不是有效的 sing-box rule-set：缺少 rules 数组');
  }
  const conditions = [];
  const skipped = [];

  ruleSet.rules.forEach((rule, i) => {
    if (rule.type && rule.type !== 'default') {
      skipped.push(`rules[${i}]: 不支持 type=${rule.type}`);
      return;
    }
    if (rule.invert) {
      skipped.push(`rules[${i}]: 不支持 invert`);
      return;
    }
    const extra = Object.keys(rule).filter((k) => !CONVERTIBLE.has(k) && k !== 'type');
    if (extra.length) {
      // 其它字段与域名条件是"与"关系，只取域名部分会让匹配变宽，整条跳过
      skipped.push(`rules[${i}]: 含无法表达的字段 ${extra.join(', ')}`);
      return;
    }
    for (const d of toArray(rule.domain)) conditions.push(d);
    for (const s of toArray(rule.domain_suffix)) {
      // "x.com" 匹配自身及子域 → *.x.com；".x.com" 只匹配子域 → **.x.com
      conditions.push(s.startsWith('.') ? `**${s}` : `*.${s}`);
    }
    for (const k of toArray(rule.domain_keyword)) conditions.push(`Keyword: ${k}`);
    for (const r of toArray(rule.domain_regex)) conditions.push(`HostRegex: ${r}`);
    for (const c of toArray(rule.ip_cidr)) conditions.push(`Ip: ${c.includes('/') ? c : c.includes(':') ? `${c}/128` : `${c}/32`}`);
  });

  return { conditions, skipped };
}

/** 把多个源的转换结果合并成 Switchy 格式文本 */
export function buildRuleList(results, now = new Date()) {
  const seen = new Set();
  const body = [];
  const skippedLines = [];
  for (const { url, conditions, skipped } of results) {
    for (const c of conditions) {
      if (!seen.has(c)) {
        seen.add(c);
        body.push(c);
      }
    }
    for (const s of skipped) skippedLines.push(`; 跳过 ${url} ${s}`);
  }
  return [
    '[SwitchyOmega Conditions]',
    '; 由 singbox2omega 从 sing-box rule-set 生成',
    `; 生成时间: ${now.toISOString()}`,
    ...results.map((r) => `; 源: ${r.url}`),
    `; 规则数: ${body.length}`,
    ...skippedLines,
    '',
    ...body,
    '',
  ].join('\n');
}

async function fetchRuleSet(url, noCache) {
  // nocache 时加时间戳改变 Cloudflare 缓存键，从而绕过边缘缓存
  const target = noCache ? `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}` : url;
  const res = await fetch(target, {
    cf: noCache ? { cacheTtl: 0 } : { cacheTtl: CACHE_TTL, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`${url} 返回 HTTP ${res.status}`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`${url} 不是合法 JSON`);
  }
  return { url, ...convertRuleSet(json) };
}

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    if (reqUrl.pathname !== '/rules.txt') {
      return new Response('Not Found', { status: 404 });
    }
    const noCache = reqUrl.searchParams.get('nocache') === '1';
    try {
      // 任一源失败都整体返回 502，避免输出不完整的列表；ZeroOmega 会保留旧列表
      const results = await Promise.all(SOURCES.map((u) => fetchRuleSet(u, noCache)));
      return new Response(buildRuleList(results), {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-cache',
        },
      });
    } catch (err) {
      return new Response(`上游拉取或转换失败: ${err.message}\n`, {
        status: 502,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
