/**
 * LocalModelManagerSkill Tests
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const LocalModelManagerSkill = require('../../src/skills/local-model-manager');

// Mock client
const mockClient = {
  getTopology: async () => ({
    components: {
      bus1: { definition: 'Bus', label: 'Bus 1', pins: {}, args: {} }
    }
  }),
  getAllComponents: async () => ({
    components: { bus1: { definition: 'Bus' } }
  }),
  fetchModel: async (rid) => ({ name: 'Test Model', owner: 'test', rid }),
  dumpModel: async (rid, filePath) => {
    const yaml = require('js-yaml');
    const data = { rid, components: {} };
    const content = yaml.dump(data);
    fs.writeFileSync(filePath, zlib.gzipSync(content));
  }
};

test('LocalModelManagerSkill', async (t) => {
  let testDir;
  let skill;

  t.beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-model-manager-test-'));

    const metadataDir = path.join(testDir, 'local-models', '.metadata');
    const modelsDir = path.join(testDir, 'local-models', 'models');
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.mkdirSync(modelsDir, { recursive: true });

    fs.writeFileSync(path.join(metadataDir, 'index.json'), JSON.stringify({
      models: {},
      aliases: {}
    }));

    skill = new LocalModelManagerSkill(mockClient, {
      localModelsPath: path.join(testDir, 'local-models')
    });
  });

  t.afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await t.test('dumpToLocal() should dump model with generated tag', async () => {
    const result = await skill.dumpToLocal('model/owner/test', {
      validate: false,
      overwrite: true
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.tag);
    assert.ok(result.filePath);
  });

  await t.test('dumpToLocal() should dump model with custom tag', async () => {
    const result = await skill.dumpToLocal('model/owner/test', {
      tag: 'my_custom_tag',
      validate: false,
      overwrite: true
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.tag, 'my_custom_tag');
  });

  await t.test('dumpToLocal() should fail for existing tag without overwrite', async () => {
    await skill.dumpToLocal('model/owner/test', {
      tag: 'existing_tag',
      validate: false
    });

    await assert.rejects(async () => {
      await skill.dumpToLocal('model/owner/other', {
        tag: 'existing_tag',
        validate: false
      });
    }, /模型已存在/);
  });

  await t.test('loadFromLocal() should load dumped model', async () => {
    await skill.dumpToLocal('model/owner/test', {
      tag: 'test_model',
      validate: false
    });

    const loaded = skill.loadFromLocal('test_model');

    assert.strictEqual(loaded.tag, 'test_model');
    assert.ok(loaded.data);
    assert.ok(loaded.components);
    assert.strictEqual(loaded.source, 'local');
  });

  await t.test('loadFromLocal() should throw for non-existent tag', () => {
    assert.throws(() => {
      skill.loadFromLocal('nonexistent');
    }, /模型不存在/);
  });

  await t.test('loadFromLocal() should load via alias', async () => {
    await skill.dumpToLocal('model/owner/test', {
      tag: 'original_tag',
      validate: false
    });

    skill.addAlias('original_tag', 'my_alias');

    const loaded = skill.loadFromLocal('my_alias');
    assert.strictEqual(loaded.tag, 'original_tag');
  });

  await t.test('setTag() should rename model tag', async () => {
    await skill.dumpToLocal('model/owner/test', {
      tag: 'old_tag',
      validate: false
    });

    skill.setTag('old_tag', 'new_tag');

    assert.strictEqual(skill.hasModel('new_tag'), true);
    assert.strictEqual(skill.hasModel('old_tag'), false);
  });

  await t.test('setTag() should throw for non-existent old tag', () => {
    assert.throws(() => {
      skill.setTag('nonexistent', 'new_tag');
    }, /模型不存在/);
  });

  await t.test('addAlias() should add alias', async () => {
    await skill.dumpToLocal('model/owner/test', {
      tag: 'model',
      validate: false
    });

    skill.addAlias('model', 'alias1');

    const info = skill.getModelInfo('alias1');
    assert.strictEqual(info.tag, 'model');
  });

  await t.test('removeAlias() should remove alias', async () => {
    await skill.dumpToLocal('model/owner/test', {
      tag: 'model',
      validate: false
    });

    skill.addAlias('model', 'alias1');
    skill.removeAlias('alias1');

    assert.strictEqual(skill.hasModel('alias1'), false);
  });

  await t.test('listModels() should list all models', async () => {
    await skill.dumpToLocal('model/owner/a', { tag: 'model_a', validate: false });
    await skill.dumpToLocal('model/owner/b', { tag: 'model_b', validate: false });

    const models = skill.listModels();
    assert.strictEqual(models.length, 2);
  });

  await t.test('listModels() should filter models by string', async () => {
    await skill.dumpToLocal('model/owner/test', { tag: 'test_model', validate: false });
    await skill.dumpToLocal('model/owner/prod', { tag: 'prod_model', validate: false });

    const models = skill.listModels({ filter: 'test' });

    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].tag, 'test_model');
  });

  await t.test('hasModel() should return true for existing model', async () => {
    await skill.dumpToLocal('model/owner/test', { tag: 'exists', validate: false });
    assert.strictEqual(skill.hasModel('exists'), true);
  });

  await t.test('hasModel() should return false for non-existent model', () => {
    assert.strictEqual(skill.hasModel('nonexistent'), false);
  });

  await t.test('deleteModel() should delete model', async () => {
    await skill.dumpToLocal('model/owner/test', { tag: 'to_delete', validate: false });

    const result = skill.deleteModel('to_delete');

    assert.strictEqual(result.success, true);
    assert.strictEqual(skill.hasModel('to_delete'), false);
  });

  await t.test('getStats() should return storage statistics', async () => {
    await skill.dumpToLocal('model/owner/test', { tag: 'model', validate: false });

    const stats = skill.getStats();

    assert.strictEqual(stats.modelCount, 1);
    assert.ok(stats.totalSizeBytes >= 0);
    assert.ok(stats.localModelsPath);
  });

  await t.test('cleanup() should remove invalid registry entries', async () => {
    skill.hybridManager.registerLocalModel('phantom', { rid: 'model/owner/phantom' });

    const result = skill.cleanup();

    assert.ok(result.cleaned.includes('phantom'));
    assert.strictEqual(skill.hasModel('phantom'), false);
  });

  await t.test('_generateTag() should generate tag from RID', () => {
    const tag = skill._generateTag('model/owner/key123');
    assert.strictEqual(tag, 'owner_key123');
  });

  await t.test('_generateTag() should generate hash-based tag for invalid RID', () => {
    const tag = skill._generateTag('invalid-rid');
    assert.ok(tag.startsWith('model_'));
    assert.strictEqual(tag.length, 14);
  });
});