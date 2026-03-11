#!/usr/bin/env node
/**
 * E2E Tests for Optimization Stories
 *
 * US-031: 发电机出力优化
 * US-033: 网损优化分析
 * US-034: 设备检修计划优化
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
  console.log('║       E2E Test: Optimization Stories                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== US-031: 发电机出力优化 ==========
  console.log('\n📦 US-031: 发电机出力优化');

  await runTest('US-031: 经济调度优化', async () => {
    const rid = TEST_RID;

    const result = await skills.optimization.economicDispatch(rid, {
      method: 'lambda',
      constraints: {}
    });

    if (!result.success) {
      throw new Error('优化失败');
    }

    console.log(`   优化方法: 等微增率法`);
    console.log(`   系统Lambda: ${result.systemLambda?.toFixed(4) || 'N/A'}`);
    console.log(`   总发电成本: ${result.totalCost.toFixed(2)} $/h`);
    console.log(`   总发电量: ${result.totalGeneration.toFixed(2)} MW`);

    // 显示优化结果
    console.log(`\n   发电机出力优化结果:`);
    result.dispatch.slice(0, 5).forEach((g, i) => {
      console.log(`     ${i + 1}. ${g.name}: ${g.P} MW (成本: ${g.cost} $/h)`);
    });

    global.dispatchResult = result;
  });

  await runTest('US-031: 查看出力调整量', async () => {
    if (!global.dispatchResult) {
      throw new Error('无优化结果');
    }

    console.log(`\n   出力调整量:`);
    global.dispatchResult.dispatch.forEach((g, i) => {
      console.log(`     ${g.name}: ${g.deltaP} MW`);
    });
  });

  // ========== US-033: 网损优化分析 ==========
  console.log('\n📦 US-033: 网损优化分析');

  await runTest('US-033: 计算基准网损', async () => {
    const rid = TEST_RID;

    const result = await skills.optimization.optimizeLosses(rid, {
      methods: ['reactive', 'tap']
    });

    if (!result.success) {
      throw new Error('网损分析失败');
    }

    console.log(`   基准网损: ${result.baseLoss.toFixed(2)} MW`);
    console.log(`   网损率: ${(result.baseLoss / 6000 * 100).toFixed(2)}%`);

    // 显示高损耗线路
    if (result.lossDistribution?.topLosses) {
      console.log(`\n   高损耗线路:`);
      result.lossDistribution.topLosses.slice(0, 5).forEach((l, i) => {
        console.log(`     ${i + 1}. ${l.name}: ${l.loss} MW`);
      });
    }

    global.lossResult = result;
  });

  await runTest('US-033: 分析降损措施', async () => {
    if (!global.lossResult) {
      throw new Error('无网损分析结果');
    }

    console.log(`\n   优化措施分析:`);

    for (const measure of global.lossResult.measures) {
      console.log(`\n   ${measure.description}:`);
      console.log(`     预期降损: ${measure.expectedSaving?.toFixed(2) || 'N/A'} MW`);
      console.log(`     实施成本: ${measure.cost || 0} 万元`);
    }
  });

  await runTest('US-033: 生成推荐方案', async () => {
    if (!global.lossResult) {
      throw new Error('无网损分析结果');
    }

    const plan = global.lossResult.recommendedPlan;

    console.log(`\n   推荐优化方案:`);
    console.log(`     可降低网损: ${plan.saving.toFixed(2)} MW`);
    console.log(`     降损比例: ${global.lossResult.savingPercent}%`);
    console.log(`     总投资: ${plan.cost} 万元`);

    if (plan.actions && plan.actions.length > 0) {
      console.log(`\n   具体措施:`);
      plan.actions.forEach((a, i) => {
        console.log(`     ${i + 1}. ${a.description}: 降损 ${a.saving} MW`);
      });
    }
  });

  // ========== US-034: 设备检修计划优化 ==========
  console.log('\n📦 US-034: 设备检修计划优化');

  await runTest('US-034: 配置检修计划', async () => {
    global.maintenanceConfig = {
      devices: [
        { key: 'TLine_3p-15', name: '线路15', duration: '8h' },
        { key: 'TLine_3p-16', name: '线路16', duration: '8h' }
      ],
      timeWindow: {
        start: '2024-03-01',
        end: '2024-03-31'
      },
      constraints: [],
      priorities: {}
    };

    console.log(`   检修设备: ${global.maintenanceConfig.devices.length} 台`);
    global.maintenanceConfig.devices.forEach((d, i) => {
      console.log(`     ${i + 1}. ${d.name} (${d.duration})`);
    });
    console.log(`   时间窗口: ${global.maintenanceConfig.timeWindow.start} ~ ${global.maintenanceConfig.timeWindow.end}`);
  });

  await runTest('US-034: 执行检修计划优化', async () => {
    const rid = TEST_RID;

    const result = await skills.optimization.optimizeMaintenanceSchedule(
      rid,
      global.maintenanceConfig
    );

    if (!result.success) {
      throw new Error('检修计划优化失败');
    }

    console.log(`   优化场景数: ${result.scenarios.length}`);
    console.log(`   风险评估:`);
    console.log(`     高风险: ${result.riskAssessment.highRiskCount}`);
    console.log(`     中风险: ${result.riskAssessment.mediumRiskCount}`);
    console.log(`     总体风险: ${result.riskAssessment.overallRisk}`);

    global.maintenanceResult = result;
  });

  await runTest('US-034: 查看检修计划', async () => {
    if (!global.maintenanceResult) {
      throw new Error('无检修计划结果');
    }

    console.log(`\n   优化后的检修计划:`);

    global.maintenanceResult.schedule.forEach((item, i) => {
      console.log(`     ${item.sequence}. ${item.device}`);
      console.log(`        持续时间: ${item.duration}`);
      console.log(`        推荐时段: ${item.recommendedPeriod}`);
      console.log(`        风险等级: ${item.riskLevel}`);
    });
  });

  await runTest('US-034: 查看配套措施建议', async () => {
    if (!global.maintenanceResult) {
      throw new Error('无检修计划结果');
    }

    const recommendations = global.maintenanceResult.recommendations;

    if (recommendations.length > 0) {
      console.log(`\n   配套措施建议:`);
      recommendations.forEach((r, i) => {
        console.log(`     ${i + 1}. [${r.priority}] ${r.device}: ${r.message}`);
      });
    } else {
      console.log(`   ✅ 无需特殊配套措施`);
    }
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('优化分析测试结果汇总');
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