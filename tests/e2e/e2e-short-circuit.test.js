#!/usr/bin/env node
/**
 * E2E Tests for Short Circuit Analysis Story
 *
 * US-027: 短路电流计算
 */

const path = require('path');
const fs = require('fs');
const { CloudPSSSkills } = require('../../src/index');

// 加载 CloudPSS Token
const tokenPath = path.join(__dirname, '../../../.cloudpss_token');
if (fs.existsSync(tokenPath)) {
  const token = fs.readFileSync(tokenPath, 'utf-8').trim();
  process.env.CLOUDPSS_TOKEN = token;
}

const TEST_RID = 'model/holdme/IEEE39';
const TEST_TIMEOUT = 180000;

const results = { passed: 0, failed: 0, tests: [] };

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

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       E2E Test: Short Circuit Analysis                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== US-027: 短路电流计算 ==========
  console.log('\n📦 US-027: 短路电流计算');

  await runTest('US-027: 三相短路电流计算', async () => {
    const rid = TEST_RID;

    const result = await skills.shortCircuit.calculateThreePhase(rid, {
      buses: null,  // 计算所有母线
      includeImpedance: true
    });

    if (!result.success || !result.results || result.results.length === 0) {
      throw new Error('短路计算未返回结果');
    }

    console.log(`   计算节点数: ${result.results.length}`);
    console.log(`   最大短路电流: ${result.summary.maxIsc_kA} kA (${result.summary.maxBus})`);
    console.log(`   最小短路电流: ${result.summary.minIsc_kA} kA (${result.summary.minBus})`);
    console.log(`   平均短路电流: ${result.summary.avgIsc_kA} kA`);

    global.scResults = result;
  });

  await runTest('US-027: 查看短路电流分布', async () => {
    if (!global.scResults) {
      throw new Error('无短路计算结果');
    }

    console.log(`\n   短路电流分布 (前5个母线):`);
    global.scResults.results.slice(0, 5).forEach((r, i) => {
      console.log(`     ${i + 1}. ${r.bus}: ${r.Isc_kA} kA, X/R=${r.XR_ratio}`);
    });
  });

  await runTest('US-027: 生成短路报告', async () => {
    if (!global.scResults) {
      throw new Error('无短路计算结果');
    }

    const report = skills.shortCircuit.generateReport(global.scResults, {
      format: 'table'
    });

    console.log(`   报告标题: ${report.title}`);
    console.log(`   短路类型: ${report.type}`);

    // 显示前3条记录
    console.log(`\n   短路容量数据 (前3条):`);
    report.data.slice(0, 3).forEach(r => {
      console.log(`     ${r.bus}: ${r.Isc_kA} kA, ${r.Ssc_MVA} MVA`);
    });
  });

  await runTest('US-027: 检查短路电流超标', async () => {
    if (!global.scResults) {
      throw new Error('无短路计算结果');
    }

    const violations = skills.shortCircuit.checkViolations(global.scResults, {
      maxIsc_kA: 50,
      voltageLevels: {
        110: 31.5,
        220: 50,
        500: 63
      }
    });

    console.log(`   检查总数: ${violations.total}`);
    console.log(`   超标数量: ${violations.violationCount}`);
    console.log(`   严重超标: ${violations.criticalCount}`);

    if (violations.violations.length > 0) {
      console.log(`\n   超标母线:`);
      violations.violations.slice(0, 5).forEach(v => {
        console.log(`     - ${v.bus}: ${v.Isc_kA} kA (限值 ${v.limit} kA, 超标 ${v.exceed_percent}%)`);
        console.log(`       建议: ${v.recommendation}`);
      });
    } else {
      console.log(`   ✅ 无超标节点`);
    }
  });

  await runTest('US-027: 指定母线短路计算', async () => {
    const rid = TEST_RID;

    // 只计算部分母线
    const result = await skills.shortCircuit.calculateThreePhase(rid, {
      buses: ['newBus_3p-1', 'newBus_3p-2', 'newBus_3p-3'],
      includeImpedance: true
    });

    console.log(`   指定母线数: ${result.results.length}`);

    result.results.forEach(r => {
      console.log(`     ${r.bus}: ${r.Isc_kA} kA`);
    });
  });

  await runTest('US-027: 单相短路电流计算', async () => {
    const rid = TEST_RID;

    const result = await skills.shortCircuit.calculateSinglePhase(rid, {
      buses: ['newBus_3p-1', 'newBus_3p-2'],
      groundImpedance: 0
    });

    if (!result.success) {
      throw new Error('单相短路计算失败');
    }

    console.log(`   单相短路计算节点数: ${result.results.length}`);

    result.results.forEach(r => {
      console.log(`     ${r.bus}: ${r.Isc_kA} kA`);
    });
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('短路电流计算测试结果汇总');
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

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});