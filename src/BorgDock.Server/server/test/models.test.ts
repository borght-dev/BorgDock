import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelCatalogue } from '../src/t3/models.ts';
import { thread } from './fixtures.ts';

const dir = mkdtempSync(join(tmpdir(), 'dispatch-models-'));
const codexCache = join(dir, 'codex.json');
const manifest = join(dir, 'manifest.json');
writeFileSync(codexCache, JSON.stringify({ models: [
  { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6-Sol', visibility: 'list', priority: 5, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }] },
  { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', visibility: 'list', priority: 1, default_reasoning_level: 'low', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'xhigh' }, { effort: 'ultra' }] },
  { slug: 'codex-auto-review', display_name: 'Review', visibility: 'hide', priority: 43, supported_reasoning_levels: [] },
] }));
writeFileSync(manifest, JSON.stringify({ manifest: { providers: { claudeAgent: {
  models: [{ slug: 'claude-opus-5-5', name: 'Claude Opus 5.5', profile: 'opus-5-5' }, { slug: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', profile: 'haiku-4-5' }],
  profiles: {
    'opus-5-5': { capabilities: { optionDescriptors: [
      { id: 'effort', options: [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium', isDefault: true }, { id: 'xhigh', label: 'Extra High' }] },
      { id: 'fastMode', options: [] },
      { id: 'contextWindow', options: [{ id: '200k' }, { id: '1m', isDefault: true }] },
    ] } },
    'haiku-4-5': { capabilities: { optionDescriptors: [{ id: 'thinking', options: [] }] } },
  },
} } } }));

const recent = new Date().toISOString();

test('recently used models come first, newest use first', () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const catalogue = modelCatalogue(manifest, [
    thread({ id: 'old', createdAt: day(30), model: 'gpt-5.6-sol', modelInstance: 'codex', effort: 'high' }),
    thread({ id: 'a', createdAt: day(3), model: 'claude-opus-5-5', modelInstance: 'claudeAgent', effort: 'low' }),
    thread({ id: 'b', createdAt: day(1), model: 'gpt-6.1-sol', modelInstance: 'codex', effort: 'xhigh' }),
  ], codexCache);
  assert.deepEqual(catalogue.models.filter((m) => m.recent).map((m) => m.id), ['codex/gpt-6.1-sol', 'claudeAgent/claude-opus-5-5']);
  assert.equal(catalogue.recentEffort.get('codex/gpt-5.6-sol'), 'high', 'older use still informs the default level');
});

test('lists visible Codex models in Codex order, then Claude, with recently used ones first', () => {
  const catalogue = modelCatalogue(manifest, [thread({ id: 'a', createdAt: recent, model: 'claude-opus-5-5', modelInstance: 'claudeAgent_outlook', effort: 'xhigh' })], codexCache);
  assert.deepEqual(catalogue.models.map((m) => m.id), ['claudeAgent/claude-opus-5-5', 'codex/gpt-6.1-sol', 'codex/gpt-5.6-sol', 'claudeAgent/claude-haiku-4-5']);
  assert.equal(catalogue.fallbackModel, 'codex/gpt-6.1-sol', "Codex's first pick when nothing is remembered");
  assert.equal(catalogue.recentEffort.get('claudeAgent/claude-opus-5-5'), 'xhigh');
  assert.deepEqual(catalogue.models.find((m) => m.id === 'codex/gpt-6.1-sol')!.efforts.map((e) => e.label), ['Low', 'High', 'Extra high', 'Ultra']);
});

test('builds the T3 model selection each provider expects', () => {
  const catalogue = modelCatalogue(manifest, [], codexCache);
  assert.deepEqual(catalogue.selection('codex/gpt-6.1-sol', 'xhigh'), {
    instanceId: 'codex', model: 'gpt-6.1-sol', options: [{ id: 'reasoningEffort', value: 'xhigh' }, { id: 'serviceTier', value: 'default' }],
  });
  assert.deepEqual(catalogue.selection('claudeAgent/claude-opus-5-5', null), {
    instanceId: 'claudeAgent', model: 'claude-opus-5-5',
    options: [{ id: 'effort', value: 'medium' }, { id: 'fastMode', value: false }, { id: 'contextWindow', value: '1m' }],
  });
  assert.deepEqual(catalogue.selection('claudeAgent/claude-haiku-4-5', null).options, [], 'a model without reasoning levels gets none');
  assert.throws(() => catalogue.selection('codex/gpt-6.1-sol', 'max'), /no max reasoning level/);
  assert.throws(() => catalogue.selection('codex/gpt-reserve', null), /can't start/);
});

test('live catalogs preserve custom provider instances and host-specific reasoning options', async () => {
  const { liveModelCatalogue } = await import('../src/t3/models.ts');
  const catalogue = liveModelCatalogue([
    { instanceId: 'codex_work', displayName: 'Work', driver: 'codex', enabled: true, installed: true, status: 'ready', models: [{ slug: 'custom-sol', name: 'Custom Sol', capabilities: { optionDescriptors: [{ id: 'reasoningEffort', type: 'select', options: [{ id: 'high', isDefault: true }] }, { id: 'serviceTier', type: 'select', options: [{ id: 'default', isDefault: true }] }] } }] },
    { instanceId: 'disabled', driver: 'codex', enabled: false, installed: true, status: 'ready', models: [{ slug: 'hidden' }] },
  ], []);
  assert.deepEqual(catalogue.models.map((m) => m.id), ['codex_work/custom-sol']);
  assert.deepEqual(catalogue.selection('codex_work/custom-sol', 'high'), { instanceId: 'codex_work', model: 'custom-sol', options: [{ id: 'reasoningEffort', value: 'high' }, { id: 'serviceTier', value: 'default' }] });
  assert.throws(() => catalogue.selection('codex_work/custom-sol', 'ultra'));
});
