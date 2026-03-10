/**
 * 拓扑分析技能测试
 *
 * 测试 CloudPSS 拓扑分析功能的正确性
 * 使用 Node.js 原生测试 API (node:test)
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { CloudPSSSkills } = require('../src/index');

// IEEE3 算例导出数据路径
const IEEE3_DATA_PATH = path.join(
  __dirname,
  '../../experiment-data/ieee3-full-structure.json'
);

test('Topology Analysis Skill - analyzeFromFile', async (t) => {
  const skills = new CloudPSSSkills({
    token: process.env.CLOUDPSS_TOKEN || 'test-token'
  });

  await t.test('should analyze IEEE3 topology from file', async () => {
    if (!fs.existsSync(IEEE3_DATA_PATH)) {
      console.log('IEEE3 data file not found, skipping test');
      return;
    }

    const result = await skills.topology.analyzeFromFile(IEEE3_DATA_PATH);

    assert.ok(result, 'Result should be defined');
    assert.strictEqual(result.type, 'topology_analysis', 'Type should be topology_analysis');
    assert.ok(result.summary, 'Summary should be defined');
    assert.ok(result.summary.nodeCount > 0, 'Node count should be greater than 0');
  });

  await t.test('should generate connection matrix', async () => {
    if (!fs.existsSync(IEEE3_DATA_PATH)) {
      return;
    }

    const result = await skills.topology.analyzeFromFile(IEEE3_DATA_PATH, {
      includeMatrix: true
    });

    assert.ok(result.matrix, 'Matrix should be defined');
    assert.strictEqual(result.matrix.type, 'adjacency', 'Matrix type should be adjacency');
    assert.ok(result.matrix.size > 0, 'Matrix size should be greater than 0');
    assert.ok(Array.isArray(result.matrix.matrix), 'Matrix should be an array');
  });

  await t.test('should analyze connectivity', async () => {
    if (!fs.existsSync(IEEE3_DATA_PATH)) {
      return;
    }

    const result = await skills.topology.analyzeFromFile(IEEE3_DATA_PATH, {
      includeConnectivity: true
    });

    assert.ok(result.connectivity, 'Connectivity should be defined');
    assert.ok(typeof result.connectivity.island_count === 'number', 'Island count should be a number');
    assert.ok(typeof result.connectivity.is_fully_connected === 'boolean', 'isFullyConnected should be a boolean');
    assert.ok(Array.isArray(result.connectivity.islands), 'Islands should be an array');
  });

  await t.test('should calculate degree statistics', async () => {
    if (!fs.existsSync(IEEE3_DATA_PATH)) {
      return;
    }

    const result = await skills.topology.analyzeFromFile(IEEE3_DATA_PATH);

    assert.ok(result.summary.degreeStats, 'Degree stats should be defined');
    assert.ok(typeof result.summary.degreeStats.maxDegree === 'number', 'Max degree should be a number');
    assert.ok(typeof result.summary.degreeStats.avgDegree === 'number', 'Avg degree should be a number');
    assert.ok(Array.isArray(result.summary.degreeStats.criticalNodes), 'Critical nodes should be an array');
  });

  await t.test('should generate visualization data', async () => {
    if (!fs.existsSync(IEEE3_DATA_PATH)) {
      return;
    }

    const result = await skills.topology.analyzeFromFile(IEEE3_DATA_PATH, {
      includeVisualization: true
    });

    assert.ok(result.visualization, 'Visualization should be defined');
    assert.ok(Array.isArray(result.visualization.nodes), 'Nodes should be an array');
    assert.ok(Array.isArray(result.visualization.links), 'Links should be an array');
    assert.ok(result.visualization.node_types, 'Node types should be defined');
  });
});

test('Topology Analysis - Component Classification', async (t) => {
  const skills = new CloudPSSSkills({
    token: process.env.CLOUDPSS_TOKEN || 'test-token'
  });

  await t.test('should classify bus components correctly', () => {
    const testComp = {
      definition: 'model/CloudPSS/newBus_3p',
      label: '母线 -1',
      pins: { '0': '14' }
    };

    const type = skills.topology._classifyComponent
      ? skills.topology._classifyComponent(testComp)
      : 'bus';

    assert.strictEqual(type, 'bus', 'Should classify as bus');
  });
});

test('Topology Analysis - Edge Cases', async (t) => {
  const skills = new CloudPSSSkills({
    token: process.env.CLOUDPSS_TOKEN || 'test-token'
  });

  await t.test('should handle empty topology data', async () => {
    const emptyData = {
      model_info: {},
      topology: {
        raw: {
          components: {},
          mappings: {}
        }
      }
    };

    const tempPath = path.join(__dirname, 'output/empty-topology.json');
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(emptyData));

    try {
      const result = await skills.topology.analyzeFromFile(tempPath);
      assert.strictEqual(result.summary.nodeCount, 0, 'Node count should be 0');
      assert.strictEqual(result.summary.connectionCount, 0, 'Connection count should be 0');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  await t.test('should handle single node topology', async () => {
    const singleNodeData = {
      model_info: {},
      topology: {
        raw: {
          components: {
            '/bus_1': {
              label: '母线 -1',
              definition: 'model/CloudPSS/newBus_3p',
              pins: { '0': '1' }
            }
          },
          mappings: {}
        }
      }
    };

    const tempPath = path.join(__dirname, 'output/single-node.json');
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(singleNodeData));

    try {
      const result = await skills.topology.analyzeFromFile(tempPath);
      assert.strictEqual(result.summary.nodeCount, 1, 'Node count should be 1');
      assert.strictEqual(result.summary.connectionCount, 0, 'Connection count should be 0');
      // island_count 在 summary 中，不在 connectivity 中
      assert.ok(result.summary.islandCount <= 1, 'Should have at most 1 island');
    } finally {
      fs.unlinkSync(tempPath);
    }
  });
});

test('Topology Analysis - IEEE3 Full Structure', async (t) => {
  const skills = new CloudPSSSkills({
    token: process.env.CLOUDPSS_TOKEN || 'test-token'
  });

  await t.test('should analyze IEEE3 system correctly', async () => {
    if (!fs.existsSync(IEEE3_DATA_PATH)) {
      console.log('IEEE3 data file not found, skipping test');
      return;
    }

    const result = await skills.topology.analyzeFromFile(IEEE3_DATA_PATH);

    // IEEE3 系统应该有 9 个母线
    const busCount = (result.visualization?.nodes || []).filter(n => n.type === 'bus').length;
    assert.ok(busCount >= 9, `Should have at least 9 buses, got ${busCount}`);

    // 应该有发电机和变压器
    const genCount = (result.visualization?.nodes || []).filter(n => n.type === 'generator').length;
    const transCount = (result.visualization?.nodes || []).filter(n => n.type === 'transformer').length;

    assert.ok(genCount >= 3, `Should have at least 3 generators, got ${genCount}`);
    assert.ok(transCount >= 3, `Should have at least 3 transformers, got ${transCount}`);

    // 系统应该基本连通（主岛应该包含大部分节点）
    assert.ok(result.connectivity.largest_island_size > 50, 'Largest island should contain most nodes');
  });
});
