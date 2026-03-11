#!/usr/bin/env node
/**
 * Unit Test for New Skills (Mocked)
 *
 * Tests: PowerFlowAnalysisSkill, N1ContingencyAnalysisSkill, BatchSimulationEnhancedSkill
 * Uses mocked data to avoid API dependencies
 */

const { CloudPSSSkills } = require('../src/index');

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * 运行测试用例
 */
async function runTest(name, testFn) {
  console.log(`\n🧪 ${name}`);
  const startTime = Date.now();

  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.passed++;
    results.tests.push({ name, status: 'PASSED', duration });
    console.log(`   ✅ PASSED (${duration}ms)`);
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    results.failed++;
    results.tests.push({ name, status: 'FAILED', error: error.message, duration });
    console.log(`   ❌ FAILED: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       Unit Test: PowerFlow, N-1, Batch Skills (Mocked)        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== PowerFlowAnalysisSkill Tests ==========
  console.log('\n📦 PowerFlowAnalysisSkill\n');

  await runTest('PowerFlow: Skill initialization', async () => {
    if (!skills.powerFlow) throw new Error('powerFlow not initialized');
    if (typeof skills.powerFlow.runPowerFlow !== 'function') throw new Error('runPowerFlow missing');
    if (typeof skills.powerFlow.getBusVoltages !== 'function') throw new Error('getBusVoltages missing');
    if (typeof skills.powerFlow.getBranchFlows !== 'function') throw new Error('getBranchFlows missing');
    if (typeof skills.powerFlow.checkViolations !== 'function') throw new Error('checkViolations missing');
    if (typeof skills.powerFlow.generateReport !== 'function') throw new Error('generateReport missing');
  });

  await runTest('PowerFlow: Default limits', async () => {
    const pf = skills.powerFlow;
    if (pf.defaultLimits.voltage.min !== 0.95) throw new Error('Wrong voltage.min');
    if (pf.defaultLimits.voltage.max !== 1.05) throw new Error('Wrong voltage.max');
    if (pf.defaultLimits.lineLoading.warning !== 0.8) throw new Error('Wrong lineLoading.warning');
    if (pf.defaultLimits.lineLoading.critical !== 1.0) throw new Error('Wrong lineLoading.critical');
  });

  await runTest('PowerFlow: Bus table parsing', async () => {
    const tableData = {
      columns: [{ name: 'Bus' }, { name: 'Vm' }, { name: 'Va' }],
      data: [['Bus1', 1.02, 0.5], ['Bus2', 0.98, -1.2]]
    };
    const parsed = skills.powerFlow._parseBusTable(tableData);
    if (parsed.length !== 2) throw new Error('Wrong length');
    if (parsed[0].voltage !== 1.02) throw new Error('Wrong voltage');
    if (parsed[0].angle !== 0.5) throw new Error('Wrong angle');
  });

  await runTest('PowerFlow: Branch table parsing', async () => {
    const tableData = {
      columns: [{ name: 'Branch' }, { name: 'Pij' }, { name: 'Loading' }],
      data: [['Line1', 100, 0.85]]
    };
    const parsed = skills.powerFlow._parseBranchTable(tableData);
    if (parsed.length !== 1) throw new Error('Wrong length');
    if (parsed[0].pij !== 100) throw new Error('Wrong pij');
    if (parsed[0].loading !== 0.85) throw new Error('Wrong loading');
  });

  await runTest('PowerFlow: Recommendations generation', async () => {
    const violations = {
      voltageViolations: { count: 2, details: [{ type: 'undervoltage' }, { type: 'overvoltage' }] },
      lineOverloads: { count: 1, details: [{ severity: 'critical' }] }
    };
    const buses = { summary: {} };
    const branches = { summary: { totalPLoss: 150 } };

    const recommendations = skills.powerFlow._generateRecommendations(violations, buses, branches);
    if (!Array.isArray(recommendations)) throw new Error('Not array');
    if (recommendations.length < 2) throw new Error('Missing recommendations');
  });

  // ========== N1ContingencyAnalysisSkill Tests ==========
  console.log('\n📦 N1ContingencyAnalysisSkill\n');

  await runTest('N-1: Skill initialization', async () => {
    if (!skills.n1Analysis) throw new Error('n1Analysis not initialized');
    if (typeof skills.n1Analysis.runFullScan !== 'function') throw new Error('runFullScan missing');
    if (typeof skills.n1Analysis.scanLines !== 'function') throw new Error('scanLines missing');
    if (typeof skills.n1Analysis.analyzeWeaknesses !== 'function') throw new Error('analyzeWeaknesses missing');
  });

  await runTest('N-1: Element identification', async () => {
    const components = {
      '/line1': { definition: 'TLine_3p', label: 'Line 1' },
      '/xfmr1': { definition: 'Transformer', label: 'Transformer 1' },
      '/gen1': { definition: 'SyncGen', label: 'Generator 1' }
    };
    const elements = skills.n1Analysis._identifyScanElements(components, ['line', 'transformer', 'generator']);
    if (elements.length !== 3) throw new Error(`Expected 3, got ${elements.length}`);
    const types = elements.map(e => e.type).sort();
    if (types.join(',') !== 'generator,line,transformer') throw new Error('Wrong types');
  });

  await runTest('N-1: Limit merging', async () => {
    const merged = skills.n1Analysis._mergeLimits({ voltage: { min: 0.90 } });
    if (merged.voltage.min !== 0.90) throw new Error('Custom not applied');
    if (merged.voltage.max !== 1.05) throw new Error('Default not preserved');
  });

  await runTest('N-1: Severity score calculation', async () => {
    const score = skills.n1Analysis._calculateSeverityScore({
      violations: {
        voltageViolations: { critical: 2, warning: 3 },
        lineOverloads: { critical: 1, warning: 2 }
      }
    });
    // 2*10 + 1*8 + 3*3 + 2*2 = 41
    if (score !== 41) throw new Error(`Expected 41, got ${score}`);

    const zeroScore = skills.n1Analysis._calculateSeverityScore({});
    if (zeroScore !== 0) throw new Error('Expected 0 for empty');
  });

  await runTest('N-1: Summary generation', async () => {
    const contingencies = [
      { severity: 'critical', element: { type: 'line' }, violations: { voltageViolations: { count: 2 }, lineOverloads: { count: 1 } } },
      { severity: 'warning', element: { type: 'transformer' }, violations: { voltageViolations: { count: 1 }, lineOverloads: { count: 0 } } },
      { severity: 'normal', element: { type: 'line' }, violations: { voltageViolations: { count: 0 }, lineOverloads: { count: 0 } } },
      { status: 'error', element: { type: 'generator' } }
    ];
    const summary = skills.n1Analysis._generateSummary(contingencies);
    if (summary.totalScenarios !== 4) throw new Error('Wrong total');
    if (summary.criticalCount !== 1) throw new Error('Wrong critical');
    if (summary.warningCount !== 1) throw new Error('Wrong warning');
  });

  await runTest('N-1: Weakness analysis', async () => {
    const scanResults = {
      contingencies: [
        { severity: 'critical', element: { label: 'Line1', type: 'line' }, violations: { voltageViolations: { count: 2, details: [{ busName: 'Bus1', voltage: 0.85 }] }, lineOverloads: { count: 1, details: [{ branchName: 'Branch1', loading: 120 }] } } },
        { severity: 'normal', element: { label: 'Line2', type: 'line' }, violations: { voltageViolations: { count: 0 }, lineOverloads: { count: 0 } } }
      ]
    };
    const weaknesses = skills.n1Analysis.analyzeWeaknesses(scanResults);
    if (weaknesses.vulnerableElements.length !== 1) throw new Error('Wrong vulnerable count');
    if (weaknesses.recommendations.length < 1) throw new Error('Missing recommendations');
  });

  // ========== BatchSimulationEnhancedSkill Tests ==========
  console.log('\n📦 BatchSimulationEnhancedSkill\n');

  await runTest('Batch: Skill initialization', async () => {
    if (!skills.batchEnhanced) throw new Error('batchEnhanced not initialized');
    if (typeof skills.batchEnhanced.runPowerFlowBatch !== 'function') throw new Error('runPowerFlowBatch missing');
    if (typeof skills.batchEnhanced.parameterSweep !== 'function') throw new Error('parameterSweep missing');
    if (typeof skills.batchEnhanced.generateReport !== 'function') throw new Error('generateReport missing');
  });

  await runTest('Batch: Result aggregation', async () => {
    const results = [
      { status: 'success', name: 'test1', executionTime: 1000, summary: { voltage: { min: 0.95, max: 1.02, avg: 0.98 }, power: { totalPLoss: 50 } }, violations: { hasViolations: false } },
      { status: 'success', name: 'test2', executionTime: 1200, summary: { voltage: { min: 0.93, max: 1.05, avg: 0.99 }, power: { totalPLoss: 55 } }, violations: { hasViolations: true } }
    ];
    const aggregated = skills.batchEnhanced._aggregateResults(results);
    if (aggregated.totalScenarios !== 2) throw new Error('Wrong total');
    if (aggregated.successCount !== 2) throw new Error('Wrong success');
    if (aggregated.voltageStats.min !== 0.93) throw new Error('Wrong voltage min');
    if (aggregated.lossStats.avg !== 52.5) throw new Error('Wrong loss avg');
  });

  await runTest('Batch: Sensitivity analysis', async () => {
    const results = [
      { index: 0, status: 'success', paramValue: 0.9, summary: { voltage: { min: 0.95, max: 1.02, avg: 0.98 }, power: { totalPLoss: 50 } } },
      { index: 1, status: 'success', paramValue: 1.1, summary: { voltage: { min: 0.92, max: 1.08, avg: 1.00 }, power: { totalPLoss: 60 } } }
    ];
    const sensitivity = skills.batchEnhanced._analyzeSensitivity(results, 'testParam', [0.9, 1.1]);
    if (!sensitivity.available) throw new Error('Not available');
    if (!sensitivity.sensitivityCoefficients.voltage) throw new Error('Missing voltage coefficient');
  });

  await runTest('Batch: Severity score calculation', async () => {
    const score = skills.batchEnhanced._calculateSeverityScore({
      voltageViolations: { critical: 2, warning: 3 },
      lineOverloads: { critical: 1, warning: 2 }
    });
    if (score !== 41) throw new Error(`Expected 41, got ${score}`);
  });

  await runTest('Batch: Report generation', async () => {
    const batchResult = {
      rid: 'test/model',
      timestamp: new Date().toISOString(),
      totalScenarios: 2,
      totalExecutionTime: 2000,
      results: [
        { name: 'test1', status: 'success', executionTime: 1000, summary: { voltage: { min: 0.95, max: 1.02 } } }
      ],
      aggregated: {
        successCount: 1,
        failedCount: 0,
        successRate: 100,
        voltageStats: { min: 0.95, max: 1.02, avg: 0.985 },
        severityRanking: []
      }
    };
    const report = skills.batchEnhanced.generateReport(batchResult);
    if (!report.includes('批量仿真分析报告')) throw new Error('Missing title');
    if (!report.includes('test/model')) throw new Error('Missing RID');
  });

  await runTest('Batch: CSV export', async () => {
    const batchResult = {
      results: [
        { name: 'test1', status: 'success', executionTime: 1000, summary: { voltage: { min: 0.95, max: 1.02, avg: 0.98 }, power: { totalPLoss: 50 } }, violations: { hasViolations: false } }
      ]
    };
    const csv = skills.batchEnhanced.exportResults(batchResult, 'csv');
    if (!csv.includes('Scenario')) throw new Error('Missing header');
    if (!csv.includes('test1')) throw new Error('Missing data');
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
    results.tests.filter(t => t.status === 'FAILED').forEach(t => {
      console.log(`  ❌ ${t.name}: ${t.error}`);
    });
  }

  console.log('\n详细测试结果:');
  results.tests.forEach(t => {
    const icon = t.status === 'PASSED' ? '✅' : '❌';
    console.log(`  ${icon} ${t.name} (${t.duration}ms)`);
  });

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(console.error);