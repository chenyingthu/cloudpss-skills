/**
 * HybridAPIManager Tests
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const HybridAPIManager = require('../../src/api/hybrid-manager');

// Mock client
const mockClient = {
  getTopology: async (rid, type) => ({ components: { comp1: { definition: 'Bus' } }, type }),
  getAllComponents: async (rid) => ({ components: { comp1: { definition: 'Bus' } } }),
  runSimulation: async (rid) => ({ job_id: 'job-123' })
};

test('HybridAPIManager', async (t) => {
  let testDir;
  let manager;

  t.beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hybrid-manager-test-'));

    const metadataDir = path.join(testDir, 'local-models', '.metadata');
    const modelsDir = path.join(testDir, 'local-models', 'models');
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.mkdirSync(modelsDir, { recursive: true });

    fs.writeFileSync(path.join(metadataDir, 'index.json'), JSON.stringify({
      models: {},
      aliases: {}
    }));

    manager = new HybridAPIManager(mockClient, {
      localModelsPath: path.join(testDir, 'local-models')
    });
  });

  t.afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  await t.test('should default to auto mode', () => {
    assert.strictEqual(manager.getMode(), 'auto');
  });

  await t.test('should set mode to local', () => {
    manager.setMode('local');
    assert.strictEqual(manager.getMode(), 'local');
  });

  await t.test('should set mode to api', () => {
    manager.setMode('api');
    assert.strictEqual(manager.getMode(), 'api');
  });

  await t.test('should throw for invalid mode', () => {
    assert.throws(() => {
      manager.setMode('invalid');
    }, /Invalid mode/);
  });

  await t.test('should return false for non-existent model', () => {
    assert.strictEqual(manager.hasLocalModel('nonexistent'), false);
  });

  await t.test('should return true for registered model with file', () => {
    manager.registerLocalModel('test_model', { rid: 'model/owner/test' });

    // Create the model file so hasLocalModel returns true
    const modelDir = path.join(testDir, 'local-models', 'models', 'test_model');
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(path.join(modelDir, 'model.yaml.gz'), zlib.gzipSync('test: data'));

    assert.strictEqual(manager.hasLocalModel('test_model'), true);
  });

  await t.test('should register model in registry', () => {
    manager.registerLocalModel('my_model', {
      rid: 'model/owner/my_model',
      description: 'Test model'
    });

    const info = manager.getLocalModelInfo('my_model');
    assert.strictEqual(info.rid, 'model/owner/my_model');
    assert.strictEqual(info.description, 'Test model');
    assert.ok(info.registeredAt);
  });

  await t.test('should add alias for model', () => {
    manager.registerLocalModel('original', { rid: 'model/owner/original' });
    manager.addAlias('original', 'alias1');

    assert.strictEqual(manager._resolveTag('alias1'), 'original');
  });

  await t.test('should throw for non-existent model when adding alias', () => {
    assert.throws(() => {
      manager.addAlias('nonexistent', 'alias');
    }, /Model not found/);
  });

  await t.test('should list all registered models', () => {
    manager.registerLocalModel('model1', { rid: 'r1' });
    manager.registerLocalModel('model2', { rid: 'r2' });

    const models = manager.listLocalModels();
    assert.strictEqual(models.length, 2);
  });

  await t.test('should return empty array when no models', () => {
    const models = manager.listLocalModels();
    assert.deepStrictEqual(models, []);
  });

  await t.test('should remove model from registry', () => {
    manager.registerLocalModel('to_remove', { rid: 'r1' });
    manager.removeLocalModel('to_remove');
    assert.strictEqual(manager.hasLocalModel('to_remove'), false);
  });

  await t.test('should remove associated aliases', () => {
    manager.registerLocalModel('model', { rid: 'r1' });
    manager.addAlias('model', 'my_alias');
    manager.removeLocalModel('model');

    assert.strictEqual(manager._resolveTag('my_alias'), null);
  });

  await t.test('should return status summary', () => {
    manager.registerLocalModel('m1', { rid: 'r1' });
    manager.addAlias('m1', 'a1');

    const status = manager.getStatus();

    assert.strictEqual(status.mode, 'auto');
    assert.strictEqual(status.localModelsCount, 1);
    assert.strictEqual(status.aliasesCount, 1);
  });

  await t.test('should return API source in api mode', () => {
    manager.setMode('api');
    const source = manager._resolveSource('model/owner/key');
    assert.strictEqual(source.isLocal, false);
  });

  await t.test('should throw in local mode for non-existent model', () => {
    manager.setMode('local');

    assert.throws(() => {
      manager._resolveSource('nonexistent_tag');
    }, /Local model not found/);
  });
});