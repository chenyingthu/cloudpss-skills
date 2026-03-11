#!/usr/bin/env node
/**
 * E2E Tests for IEEE39 Testable Stories
 *
 * US-016: 无功优化计算
 * US-029: 年度方式批量计算
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
const TEST_TIMEOUT = 300000;

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
  console.log('║       E2E Test: IEEE39 Testable Stories (US-016, US-029)       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== US-016: 无功优化计算 ==========
  console.log('\n📦 US-016: 无功优化计算');

  await runTest('US-016: 执行无功优化', async () => {
    const rid = TEST_RID;

    const result = await skills.optimization.optimizeReactivePowerOnly(rid, {
      targetVoltage: { min: 0.95, max: 1.05 },
      maxIterations: 10
    });

    if (!result.success) {
      throw new Error('无功优化失败');
    }

    console.log(`   电压越限: ${result.violations.count} 处`);
    console.log(`   低电压节点: ${result.violations.undervoltage.length} 个`);
    console.log(`   高电压节点: ${result.violations.overvoltage.length} 个`);

    global.reactiveResult = result;
  });

  await runTest('US-016: 查看优化调整建议', async () => {
    if (!global.reactiveResult) {
      throw new Error('无无功优化结果');
    }

    const adjustments = global.reactiveResult.adjustments;

    if (adjustments && adjustments.length > 0) {
      console.log(`\n   调整建议:`);
      adjustments.slice(0, 5).forEach((adj, i) => {
        console.log(`     ${i + 1}. ${adj.bus}:`);
        console.log(`        当前电压: ${adj.currentVoltage?.toFixed(4) || 'N/A'} p.u.`);
        console.log(`        目标电压: ${adj.targetVoltage || 'N/A'} p.u.`);

        if (adj.suggestedActions && adj.suggestedActions.length > 0) {
          adj.suggestedActions.forEach(action => {
            console.log(`        建议: ${action.device} ${action.action} ${action.value} MVar`);
          });
        }
      });
    } else {
      console.log(`   ✅ 电压水平良好，无需调整`);
    }
  });

  await runTest('US-016: 查看预期改善效果', async () => {
    if (!global.reactiveResult) {
      throw new Error('无无功优化结果');
    }

    const improvement = global.reactiveResult.expectedImprovement;
    console.log(`\n   预期改善: ${improvement}`);
  });

  // ========== US-029: 年度方式批量计算 ==========
  console.log('\n📦 US-029: 年度方式批量计算');

  await runTest('US-029: 配置年度方式', async () => {
    global.annualConfig = {
      year: 2024,
      modes: 'typical',
      includeHolidays: true
    };

    console.log(`   年份: ${global.annualConfig.year}`);
    console.log(`   方式类型: ${global.annualConfig.modes}`);
    console.log(`   包含节假日: ${global.annualConfig.includeHolidays}`);
  });

  await runTest('US-029: 执行年度方式计算', async () => {
    const rid = TEST_RID;

    const result = await skills.batchEnhanced.runAnnualModes(rid, global.annualConfig);

    if (!result.success) {
      throw new Error('年度方式计算失败');
    }

    console.log(`   方式数量: ${result.modesAnalyzed}`);
    console.log(`   成功: ${result.summary.successCount}`);
    console.log(`   失败: ${result.summary.failedCount}`);

    global.annualResult = result;
  });

  await runTest('US-029: 查看各方式计算结果', async () => {
    if (!global.annualResult) {
      throw new Error('无年度方式计算结果');
    }

    console.log(`\n   各方式计算结果:`);

    global.annualResult.results.forEach((r, i) => {
      const status = r.status === 'success' ? '✅' : '❌';
      console.log(`     ${i + 1}. ${status} ${r.name}`);

      if (r.status === 'success' && r.summary) {
        const v = r.summary.voltage;
        const p = r.summary.power;
        console.log(`        电压: ${v?.min?.toFixed(4) || 'N/A'} - ${v?.max?.toFixed(4) || 'N/A'} p.u.`);
        console.log(`        网损: ${p?.totalPLoss?.toFixed(2) || 'N/A'} MW`);

        if (r.violations?.hasViolations) {
          console.log(`        ⚠️ 越限: 电压${r.summary.violations.voltageCount}处, 过载${r.summary.violations.overloadCount}处`);
        }
      }
    });
  });

  await runTest('US-029: 查看电压范围分析', async () => {
    if (!global.annualResult || !global.annualResult.annualAnalysis.voltageRange) {
      throw new Error('无电压范围分析结果');
    }

    const voltageRange = global.annualResult.annualAnalysis.voltageRange;

    console.log(`\n   电压范围:`);
    console.log(`     全年最低: ${voltageRange.min.toFixed(4)} p.u.`);
    console.log(`     全年最高: ${voltageRange.max.toFixed(4)} p.u.`);

    if (voltageRange.byMode && voltageRange.byMode.length > 0) {
      console.log(`\n   各方式电压:`);
      voltageRange.byMode.forEach(m => {
        console.log(`     ${m.mode}: ${m.min.toFixed(4)} - ${m.max.toFixed(4)} p.u.`);
      });
    }
  });

  await runTest('US-029: 查看网损范围分析', async () => {
    if (!global.annualResult || !global.annualResult.annualAnalysis.lossRange) {
      throw new Error('无网损范围分析结果');
    }

    const lossRange = global.annualResult.annualAnalysis.lossRange;

    console.log(`\n   网损范围:`);
    console.log(`     最低网损: ${lossRange.min.toFixed(2)} MW`);
    console.log(`     最高网损: ${lossRange.max.toFixed(2)} MW`);

    if (lossRange.byMode && lossRange.byMode.length > 0) {
      console.log(`\n   各方式网损:`);
      lossRange.byMode.forEach(m => {
        console.log(`     ${m.mode}: ${m.loss.toFixed(2)} MW`);
      });
    }
  });

  await runTest('US-029: 查看关键方式识别', async () => {
    if (!global.annualResult) {
      throw new Error('无年度方式计算结果');
    }

    const criticalModes = global.annualResult.annualAnalysis.criticalModes;

    if (criticalModes && criticalModes.length > 0) {
      console.log(`\n   关键方式 (存在越限):`);
      criticalModes.forEach((m, i) => {
        console.log(`     ${i + 1}. ${m.name}`);
        console.log(`        电压越限: ${m.voltageViolations} 处`);
        console.log(`        过载: ${m.overloads} 处`);
        if (m.minVoltage) {
          console.log(`        最低电压: ${m.minVoltage.toFixed(4)} p.u.`);
        }
      });
    } else {
      console.log(`   ✅ 所有方式运行正常`);
    }
  });

  await runTest('US-029: 查看年度建议', async () => {
    if (!global.annualResult) {
      throw new Error('无年度方式计算结果');
    }

    const recommendations = global.annualResult.annualAnalysis.recommendations;

    if (recommendations && recommendations.length > 0) {
      console.log(`\n   年度运行建议:`);
      recommendations.forEach((r, i) => {
        console.log(`     ${i + 1}. [${r.priority}] ${r.message}`);
      });
    } else {
      console.log(`   ✅ 系统年度运行状态良好`);
    }
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('IEEE39可测试故事测试结果汇总');
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