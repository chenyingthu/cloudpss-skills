#!/usr/bin/env node
/**
 * End-to-End Test for New Skills
 *
 * Tests: PowerFlowAnalysisSkill, N1ContingencyAnalysisSkill, BatchSimulationEnhancedSkill
 *
 * Usage: node tests/e2e-new-skills.test.js
 */

const path = require('path');
const fs = require('fs');
const { CloudPSSSkills } = require('../src/index');

// 加载 CloudPSS Token
const tokenPath = path.join(__dirname, '../../.cloudpss_token');
if (fs.existsSync(tokenPath)) {
  const token = fs.readFileSync(tokenPath, 'utf-8').trim();
  process.env.CLOUDPSS_TOKEN = token;
}

// 测试配置
const TEST_RID = 'model/holdme/IEEE39';
const TEST_TIMEOUT = 180000; // 3 minutes

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * 运行测试用例
 */
async function runTest(name, testFn, timeout = TEST_TIMEOUT) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🧪 Test: ${name}`);
  console.log('─'.repeat(60));

  const startTime = Date.now();

  try {
    await Promise.race([
      testFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
      )
    ]);

    const duration = Date.now() - startTime;
    results.passed++;
    results.tests.push({ name, status: 'PASSED', duration });
    console.log(`✅ PASSED (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    results.failed++;
    results.tests.push({ name, status: 'FAILED', error: error.message, duration });
    console.log(`❌ FAILED: ${error.message}`);
    return false;
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       End-to-End Test: PowerFlow, N-1, Batch Skills           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== Test 1: PowerFlowAnalysisSkill ==========
  console.log('\n📦 Testing PowerFlowAnalysisSkill\n');

  await runTest('PowerFlow: Skill initialization', async () => {
    if (!skills.powerFlow) throw new Error('powerFlow skill not initialized');
    if (typeof skills.powerFlow.runPowerFlow !== 'function') {
      throw new Error('runPowerFlow method missing');
    }
    if (typeof skills.powerFlow.getBusVoltages !== 'function') {
      throw new Error('getBusVoltages method missing');
    }
    if (typeof skills.powerFlow.checkViolations !== 'function') {
      throw new Error('checkViolations method missing');
    }
  });

  await runTest('PowerFlow: Default limits configuration', async () => {
    const pf = skills.powerFlow;
    if (!pf.defaultLimits) throw new Error('defaultLimits not defined');
    if (!pf.defaultLimits.voltage) throw new Error('voltage limits missing');
    if (pf.defaultLimits.voltage.min !== 0.95) {
      throw new Error(`Expected voltage.min 0.95, got ${pf.defaultLimits.voltage.min}`);
    }
    if (!pf.defaultLimits.lineLoading) throw new Error('lineLoading limits missing');
  });

  await runTest('PowerFlow: Run simulation and get results', async () => {
    console.log('   Running power flow simulation...');
    const job = await skills.powerFlow.runPowerFlow(TEST_RID, 0, 0);
    console.log(`   Job ID: ${job.jobId}`);

    if (!job.jobId) throw new Error('No jobId returned');
    if (job.status !== 'completed') throw new Error(`Job status: ${job.status}`);

    // Get bus voltages
    const buses = await skills.powerFlow.getBusVoltages(job.jobId);
    console.log(`   Buses: ${buses.count} nodes`);

    if (!buses.count || buses.count === 0) throw new Error('No buses returned');
    if (!buses.summary) throw new Error('No bus summary');

    // Get branch flows
    const branches = await skills.powerFlow.getBranchFlows(job.jobId);
    console.log(`   Branches: ${branches.count} elements`);

    if (!branches.count || branches.count === 0) throw new Error('No branches returned');

    // Store jobId for subsequent tests
    global.testJobId = job.jobId;
    global.testBuses = buses;
    global.testBranches = branches;
  });

  await runTest('PowerFlow: Check violations', async () => {
    if (!global.testJobId) throw new Error('No testJobId available');

    const violations = await skills.powerFlow.checkViolations(global.testJobId);

    if (typeof violations.hasViolations !== 'boolean') {
      throw new Error('hasViolations not boolean');
    }
    if (!violations.voltageViolations) throw new Error('voltageViolations missing');
    if (!violations.lineOverloads) throw new Error('lineOverloads missing');

    console.log(`   Voltage violations: ${violations.voltageViolations.count}`);
    console.log(`   Line overloads: ${violations.lineOverloads.count}`);
  });

  await runTest('PowerFlow: Generate report', async () => {
    if (!global.testJobId) throw new Error('No testJobId available');

    const report = await skills.powerFlow.generateReport(global.testJobId);

    if (!report.jobId) throw new Error('report missing jobId');
    if (!report.system) throw new Error('report missing system info');
    if (!report.voltage) throw new Error('report missing voltage info');
    if (!report.power) throw new Error('report missing power info');
    if (!Array.isArray(report.recommendations)) {
      throw new Error('recommendations not array');
    }

    console.log(`   Report: ${report.system.busCount} buses, ${report.system.branchCount} branches`);
  });

  // ========== Test 2: N1ContingencyAnalysisSkill ==========
  console.log('\n📦 Testing N1ContingencyAnalysisSkill\n');

  await runTest('N-1: Skill initialization', async () => {
    if (!skills.n1Analysis) throw new Error('n1Analysis skill not initialized');
    if (typeof skills.n1Analysis.runFullScan !== 'function') {
      throw new Error('runFullScan method missing');
    }
    if (typeof skills.n1Analysis.scanLines !== 'function') {
      throw new Error('scanLines method missing');
    }
    if (typeof skills.n1Analysis.generateReport !== 'function') {
      throw new Error('generateReport method missing');
    }
  });

  await runTest('N-1: Element identification', async () => {
    const topology = await skills.client.getTopology(TEST_RID, 'powerFlow');
    const elements = skills.n1Analysis._identifyScanElements(
      topology.components || {},
      ['line', 'transformer', 'generator']
    );

    console.log(`   Identified: ${elements.length} scannable elements`);

    if (!elements || elements.length === 0) {
      throw new Error('No elements identified');
    }

    // Check element structure
    const sample = elements[0];
    if (!sample.key) throw new Error('element missing key');
    if (!sample.label) throw new Error('element missing label');
    if (!sample.type) throw new Error('element missing type');

    // Count by type
    const byType = {};
    elements.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });
    console.log(`   By type: ${JSON.stringify(byType)}`);

    global.n1Elements = elements;
  });

  await runTest('N-1: Limit merging', async () => {
    const merged = skills.n1Analysis._mergeLimits({
      voltage: { min: 0.90 }
    });

    if (merged.voltage.min !== 0.90) {
      throw new Error('Custom voltage.min not applied');
    }
    if (merged.voltage.max !== 1.05) {
      throw new Error('Default voltage.max not preserved');
    }
  });

  await runTest('N-1: Severity calculation', async () => {
    // Note: The function expects contingency.violations structure
    const score1 = skills.n1Analysis._calculateSeverityScore({
      violations: {
        voltageViolations: { critical: 2, warning: 3 },
        lineOverloads: { critical: 1, warning: 2 }
      }
    });

    // Expected: 2*10 + 1*8 + 3*3 + 2*2 = 20 + 8 + 9 + 4 = 41
    if (score1 !== 41) {
      throw new Error(`Expected score 41, got ${score1}`);
    }

    const score2 = skills.n1Analysis._calculateSeverityScore({});
    if (score2 !== 0) throw new Error('Empty object should return 0');
  });

  // ========== Test 3: BatchSimulationEnhancedSkill ==========
  console.log('\n📦 Testing BatchSimulationEnhancedSkill\n');

  await runTest('Batch: Skill initialization', async () => {
    if (!skills.batchEnhanced) throw new Error('batchEnhanced skill not initialized');
    if (typeof skills.batchEnhanced.runPowerFlowBatch !== 'function') {
      throw new Error('runPowerFlowBatch method missing');
    }
    if (typeof skills.batchEnhanced.parameterSweep !== 'function') {
      throw new Error('parameterSweep method missing');
    }
    if (typeof skills.batchEnhanced.generateReport !== 'function') {
      throw new Error('generateReport method missing');
    }
  });

  await runTest('Batch: Result aggregation', async () => {
    const mockResults = [
      {
        status: 'success',
        name: 'test1',
        executionTime: 1000,
        summary: {
          voltage: { min: 0.95, max: 1.02, avg: 0.98 },
          power: { totalPLoss: 50 }
        },
        violations: { hasViolations: false }
      },
      {
        status: 'success',
        name: 'test2',
        executionTime: 1200,
        summary: {
          voltage: { min: 0.93, max: 1.05, avg: 0.99 },
          power: { totalPLoss: 55 }
        },
        violations: { hasViolations: true }
      }
    ];

    const aggregated = skills.batchEnhanced._aggregateResults(mockResults);

    if (aggregated.totalScenarios !== 2) {
      throw new Error('Wrong totalScenarios');
    }
    if (aggregated.successCount !== 2) {
      throw new Error('Wrong successCount');
    }
    if (aggregated.voltageStats.min !== 0.93) {
      throw new Error('Wrong voltageStats.min');
    }
    if (aggregated.lossStats.avg !== 52.5) {
      throw new Error('Wrong lossStats.avg');
    }

    console.log(`   Aggregated: ${aggregated.successRate}% success rate`);
  });

  await runTest('Batch: Sensitivity analysis', async () => {
    const mockResults = [
      {
        index: 0, status: 'success', name: 'test1',
        paramValue: 0.9,
        summary: { voltage: { min: 0.95, max: 1.02, avg: 0.98 }, power: { totalPLoss: 50 } }
      },
      {
        index: 1, status: 'success', name: 'test2',
        paramValue: 1.1,
        summary: { voltage: { min: 0.92, max: 1.08, avg: 1.00 }, power: { totalPLoss: 60 } }
      }
    ];

    const sensitivity = skills.batchEnhanced._analyzeSensitivity(mockResults, 'testParam', [0.9, 1.1]);

    if (!sensitivity.available) throw new Error('Sensitivity not available');
    if (!sensitivity.trends) throw new Error('No trends data');
    if (!sensitivity.sensitivityCoefficients) {
      throw new Error('No sensitivity coefficients');
    }

    // Voltage sensitivity: (1.00 - 0.98) / (1.1 - 0.9) = 0.02 / 0.2 = 0.1
    console.log(`   Sensitivity coefficients: ${JSON.stringify(sensitivity.sensitivityCoefficients)}`);
  });

  await runTest('Batch: Report generation', async () => {
    const mockBatchResult = {
      rid: TEST_RID,
      timestamp: new Date().toISOString(),
      totalScenarios: 2,
      totalExecutionTime: 2000,
      results: [
        { name: 'scenario1', status: 'success', executionTime: 1000, summary: { voltage: { min: 0.95, max: 1.02 } } },
        { name: 'scenario2', status: 'error', executionTime: 500, error: 'Test error' }
      ],
      aggregated: {
        successCount: 1,
        failedCount: 1,
        successRate: 50,
        voltageStats: { min: 0.95, max: 1.02, avg: 0.985 },
        severityRanking: []
      }
    };

    const report = skills.batchEnhanced.generateReport(mockBatchResult);

    if (!report.includes('批量仿真分析报告')) {
      throw new Error('Report missing title');
    }
    if (!report.includes(TEST_RID)) {
      throw new Error('Report missing RID');
    }
    if (!report.includes('50')) {
      throw new Error('Report missing success rate');
    }

    console.log('   Report generated successfully');
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('测试结果汇总');
  console.log('═'.repeat(70));
  console.log(`\n✅ 通过: ${results.passed}`);
  console.log(`❌ 失败: ${results.failed}`);
  console.log(`📊 总计: ${results.passed + results.failed}`);

  if (results.failed > 0) {
    console.log('\n失败的测试:');
    results.tests
      .filter(t => t.status === 'FAILED')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }

  console.log('\n详细测试结果:');
  results.tests.forEach(t => {
    const icon = t.status === 'PASSED' ? '✅' : '❌';
    console.log(`  ${icon} ${t.name} (${t.duration}ms)`);
  });

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});