/**
 * LocalLoader Tests
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { LocalLoader, localLoader } = require('../../src/utils/local-loader');

test('LocalLoader', async (t) => {
  let testDir;
  let loader;

  t.beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-loader-test-'));
    loader = new LocalLoader({ cacheEnabled: true });
  });

  t.afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    loader.clearCache();
  });

  await t.test('should load JSON file', () => {
    const jsonPath = path.join(testDir, 'test.json');
    const data = { key: 'value', nested: { a: 1 } };
    fs.writeFileSync(jsonPath, JSON.stringify(data));

    const result = loader.load(jsonPath);
    assert.deepStrictEqual(result, data);
  });

  await t.test('should load YAML file', () => {
    const yamlPath = path.join(testDir, 'test.yaml');
    fs.writeFileSync(yamlPath, 'key: value\nnested:\n  a: 1\n');

    const result = loader.load(yamlPath);
    assert.strictEqual(result.key, 'value');
    assert.strictEqual(result.nested.a, 1);
  });

  await t.test('should load gzip compressed file', () => {
    const gzPath = path.join(testDir, 'test.yaml.gz');
    const yamlContent = 'key: value\nnumber: 42\n';
    fs.writeFileSync(gzPath, zlib.gzipSync(yamlContent));

    const result = loader.load(gzPath);
    assert.strictEqual(result.key, 'value');
    assert.strictEqual(result.number, 42);
  });

  await t.test('should throw error for non-existent file', () => {
    assert.throws(() => {
      loader.load('/non/existent/file.json');
    }, /文件不存在/);
  });

  await t.test('should cache loaded files', () => {
    const jsonPath = path.join(testDir, 'cached.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ data: 'cached' }));

    loader.load(jsonPath);
    loader.load(jsonPath);

    const stats = loader.getCacheStats();
    assert.strictEqual(stats.size, 1);
  });

  await t.test('should respect cache size limit', () => {
    const limitedLoader = new LocalLoader({ maxCacheSize: 2 });

    for (let i = 0; i < 3; i++) {
      const filePath = path.join(testDir, `file${i}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ index: i }));
      limitedLoader.load(filePath);
    }

    const stats = limitedLoader.getCacheStats();
    assert.strictEqual(stats.size, 2);
  });

  await t.test('should extract components from CloudPSS dump format', () => {
    const dumpData = {
      revision: {
        implements: {
          diagram: {
            cells: {
              'comp1': {
                id: 'comp1',
                label: 'Generator 1',
                definition: 'cloudpss/Generator',
                args: { P: 100 },
                pins: { '0': 'bus1' }
              },
              'comp2': {
                id: 'comp2',
                label: 'Bus 1',
                definition: 'cloudpss/Bus',
                args: { Vbase: 110 },
                pins: {}
              }
            }
          }
        }
      }
    };

    const components = loader.extractComponents(dumpData);

    assert.strictEqual(Object.keys(components).length, 2);
    assert.strictEqual(components['comp1'].label, 'Generator 1');
    assert.strictEqual(components['comp2'].definition, 'cloudpss/Bus');
  });

  await t.test('should handle empty dump data', () => {
    const components = loader.extractComponents({});
    assert.deepStrictEqual(components, {});
  });

  await t.test('should save data as JSON', () => {
    const jsonPath = path.join(testDir, 'output.json');
    const data = { key: 'value' };

    loader.save(jsonPath, data, { format: 'json', compress: false });

    const loaded = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    assert.deepStrictEqual(loaded, data);
  });

  await t.test('should save data as compressed YAML', () => {
    const gzPath = path.join(testDir, 'output.yaml.gz');
    const data = { key: 'value', nested: { a: 1 } };

    const savedPath = loader.save(gzPath, data, { format: 'yaml', compress: true });

    assert.ok(savedPath.endsWith('.gz'));
    assert.ok(fs.existsSync(savedPath));
  });

  await t.test('should clear all cache entries', () => {
    const jsonPath = path.join(testDir, 'test.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ test: true }));

    loader.load(jsonPath);
    assert.strictEqual(loader.getCacheStats().size, 1);

    loader.clearCache();
    assert.strictEqual(loader.getCacheStats().size, 0);
  });

  await t.test('should clear specific file cache', () => {
    const path1 = path.join(testDir, 'file1.json');
    const path2 = path.join(testDir, 'file2.json');
    fs.writeFileSync(path1, JSON.stringify({ a: 1 }));
    fs.writeFileSync(path2, JSON.stringify({ b: 2 }));

    loader.load(path1);
    loader.load(path2);

    loader.clearCache(path1);

    const stats = loader.getCacheStats();
    assert.strictEqual(stats.size, 1);
  });
});

test('localLoader singleton', () => {
  assert.ok(localLoader instanceof LocalLoader);
});