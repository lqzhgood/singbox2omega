import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertRuleSet, buildRuleList } from '../src/index.js';

test('转换 domain / domain_suffix / domain_regex（字符串形式）', () => {
  const { conditions, skipped } = convertRuleSet({
    version: 2,
    rules: [{
      domain: ['openai.qualtrics.com'],
      domain_suffix: ['openai.com', '.only-sub.com'],
      domain_regex: '^chatgpt-async-\\S+\\.azure\\.com$',
    }],
  });
  assert.deepEqual(conditions, [
    'openai.qualtrics.com',
    '*.openai.com',
    '**.only-sub.com',
    'HostRegex: ^chatgpt-async-\\S+\\.azure\\.com$',
  ]);
  assert.deepEqual(skipped, []);
});

test('转换 domain_keyword 与 ip_cidr', () => {
  const { conditions } = convertRuleSet({
    rules: [{ domain_keyword: ['claude'], ip_cidr: ['10.0.0.0/8', '1.1.1.1', '2001:db8::1'] }],
  });
  assert.deepEqual(conditions, [
    'Keyword: claude', 'Ip: 10.0.0.0/8', 'Ip: 1.1.1.1/32', 'Ip: 2001:db8::1/128',
  ]);
});

test('跳过逻辑规则、invert 和含与条件字段的规则', () => {
  const { conditions, skipped } = convertRuleSet({
    rules: [
      { type: 'logical', mode: 'and', rules: [] },
      { domain: ['a.com'], invert: true },
      { domain_suffix: ['b.com'], port: [443] },
      { domain: ['ok.com'] },
    ],
  });
  assert.deepEqual(conditions, ['ok.com']);
  assert.equal(skipped.length, 3);
  assert.match(skipped[2], /port/);
});

test('无效 rule-set 抛错', () => {
  assert.throws(() => convertRuleSet({ version: 2 }));
});

test('合并去重并输出 Switchy 头部', () => {
  const text = buildRuleList([
    { url: 'u1', conditions: ['*.a.com', 'x.com'], skipped: [] },
    { url: 'u2', conditions: ['*.a.com', 'y.com'], skipped: ['rules[0]: 不支持 invert'] },
  ], new Date('2026-01-01T00:00:00Z'));
  const lines = text.split('\n');
  assert.equal(lines[0], '[SwitchyOmega Conditions]');
  assert.ok(lines.includes('; 规则数: 3'));
  assert.ok(lines.includes('; 跳过 u2 rules[0]: 不支持 invert'));
  assert.deepEqual(lines.filter((l) => l && !l.startsWith(';') && !l.startsWith('[')), ['*.a.com', 'x.com', 'y.com']);
});
