/**
 * ModelValidationSkill Tests
 */

const test = require('node:test');
const assert = require('node:assert');
const ModelValidationSkill = require('../../src/skills/model-validation');

// Mock client
const mockClient = {
  getTopology: async () => ({
    components: {
      bus1: { definition: 'Bus', label: 'Bus 1', pins: { '0': 'n1' }, args: { Vbase: 110 } },
      gen1: { definition: 'SyncGen', label: 'Gen 1', pins: { '0': 'n1' }, args: { P: 100, V: 1.0 } },
      line1: { definition: 'Line', label: 'Line 1', pins: { '0': 'n1', '1': 'n2' }, args: { R: 0.01, X: 0.1 } },
      bus2: { definition: 'Bus', label: 'Bus 2', pins: { '0': 'n2' }, args: { Vbase: 110 } }
    }
  }),
  runSimulation: async () => ({ job_id: 'job-123' }),
  waitForCompletion: async () => true,
  getPowerFlowResults: async () => ({
    buses: {
      columns: ['Bus', 'Vm', 'Va', 'Pgen', 'Qgen', 'Pload', 'Qload'],
      data: [
        ['Bus 1', 1.02, 0, 100, 20, 0, 0],
        ['Bus 2', 0.98, -2, 0, 0, 90, 10]
      ]
    },
    branches: {
      columns: ['Branch', 'From', 'To', 'Pij', 'Qij', 'Pji', 'Qji', 'Loading'],
      data: [
        ['Line 1', 'Bus 1', 'Bus 2', 99, 15, -97, -8, 0.65]
      ]
    }
  }),
  getLogs: async () => [],
  getEMTResults: async () => ({ channels: [] }),
  fetchModel: async () => ({ jobs: [] })
};

test('ModelValidationSkill', async (t) => {
  let skill;

  t.beforeEach(() => {
    skill = new ModelValidationSkill(mockClient);
  });

  await t.test('validate() should return validation result structure', async () => {
    const result = await skill.validate('model/owner/test', {
      checkTopology: true,
      checkPowerFlow: false,
      checkEMT: false
    });

    assert.ok(result.rid);
    assert.ok(result.timestamp);
    assert.ok(result.checks);
    assert.ok(result.overallStatus);
    assert.ok(typeof result.healthScore === 'number');
    assert.ok(Array.isArray(result.issues));
    assert.ok(Array.isArray(result.recommendations));
  });

  await t.test('quickValidate() should run topology and power flow checks only', async () => {
    const result = await skill.quickValidate('model/owner/test');

    assert.ok(result.checks.topology);
    assert.ok(result.checks.powerFlow);
    assert.strictEqual(result.checks.emt, undefined);
  });

  await t.test('_determineStatus() should return invalid for critical issues', () => {
    const status = skill._determineStatus(40, [{ severity: 'critical' }]);
    assert.strictEqual(status, 'invalid');
  });

  await t.test('_determineStatus() should return valid for high health score', () => {
    const status = skill._determineStatus(95, []);
    assert.strictEqual(status, 'valid');
  });

  await t.test('_determineStatus() should return warning for moderate health score', () => {
    const status = skill._determineStatus(65, [{ severity: 'warning' }]);
    assert.strictEqual(status, 'warning');
  });

  await t.test('_determineStatus() should return acceptable for good health score', () => {
    const status = skill._determineStatus(80, []);
    assert.strictEqual(status, 'acceptable');
  });

  await t.test('generateReport() should generate markdown report', () => {
    const validationResult = {
      rid: 'model/owner/test',
      timestamp: '2026-03-12T00:00:00.000Z',
      overallStatus: 'valid',
      healthScore: 95,
      checks: {
        topology: { valid: true }
      },
      issues: [],
      recommendations: []
    };

    const report = skill.generateReport(validationResult, 'markdown');

    assert.ok(report.includes('# 模型验证报告'));
    assert.ok(report.includes('model/owner/test'));
    assert.ok(report.includes('valid'));
    assert.ok(report.includes('95'));
  });

  await t.test('generateReport() should return JSON when format is json', () => {
    const validationResult = {
      rid: 'model/owner/test',
      overallStatus: 'valid',
      healthScore: 95
    };

    const report = skill.generateReport(validationResult, 'json');
    assert.deepStrictEqual(report, validationResult);
  });

  await t.test('_generateRecommendations() should generate topology recommendations', () => {
    const result = {
      healthScore: 60,
      issues: [
        { severity: 'critical', type: 'isolated-nodes', message: 'Found isolated nodes' }
      ]
    };

    const recommendations = skill._generateRecommendations(result);
    assert.ok(recommendations.some(r => r.category === 'topology'));
  });

  await t.test('_generateRecommendations() should generate voltage recommendations', () => {
    const result = {
      healthScore: 70,
      issues: [
        { severity: 'warning', type: 'voltage-violation', message: 'Voltage violation' }
      ]
    };

    const recommendations = skill._generateRecommendations(result);
    assert.ok(recommendations.some(r => r.category === 'voltage'));
  });

  await t.test('_generateRecommendations() should generate general recommendations for low health', () => {
    const result = {
      healthScore: 50,
      issues: []
    };

    const recommendations = skill._generateRecommendations(result);
    assert.ok(recommendations.some(r => r.category === 'general'));
  });
});