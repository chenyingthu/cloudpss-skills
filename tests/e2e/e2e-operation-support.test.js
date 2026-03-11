#!/usr/bin/env node
/**
 * E2E Tests for Operation Support Stories
 *
 * US-044: 设备台账提取
 * US-046: 设备过载预警
 * US-047: 检修影响评估
 * US-048: 系统运行方式档案
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
  console.log('║       E2E Test: Operation Support Stories                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();
  let testRid = TEST_RID;

  // 获取测试算例并运行潮流
  console.log('\n📋 准备测试数据');
  await runTest('搜索并运行潮流计算', async () => {
    const models = await skills.modelManagement.searchModels({
      keyword: 'IEEE',
      pageSize: 10
    });

    if (models.results && models.results.length > 0) {
      const ieee39 = models.results.find(m => m.rid.includes('IEEE39') || m.rid.includes('39'));
      if (ieee39) {
        testRid = ieee39.rid;
      }
    }

    console.log(`   使用算例: ${testRid}`);
    global.testRid = testRid;

    // 运行潮流计算
    const pfResult = await skills.powerFlow.runPowerFlow(testRid);
    console.log(`   潮流计算完成: ${pfResult.status}`);
    global.jobId = pfResult.jobId;
  });

  // ========== US-044: 设备台账提取 ==========
  console.log('\n📦 US-044: 设备台账提取');

  await runTest('US-044: 提取所有设备类型台账', async () => {
    const rid = global.testRid || TEST_RID;

    const inventory = await skills.operationSupport.extractAssetInventory(rid, {
      deviceTypes: ['generator', 'transformer', 'line', 'load'],
      format: 'table'
    });

    if (!inventory.summary || Object.keys(inventory.summary).length === 0) {
      throw new Error('台账提取失败');
    }

    console.log(`   台账提取时间: ${inventory.timestamp}`);
    console.log(`   设备统计:`);

    for (const [type, count] of Object.entries(inventory.summary)) {
      console.log(`     - ${type}: ${count} 台`);
    }

    global.inventory = inventory;
  });

  await runTest('US-044: 按类型查看设备详情', async () => {
    if (!global.inventory) {
      throw new Error('无台账数据');
    }

    // 查看发电机详情
    const generators = global.inventory.devices.generator || [];
    if (generators.length > 0) {
      console.log(`\n   发电机详情 (${generators.length} 台):`);
      generators.slice(0, 3).forEach((gen, i) => {
        console.log(`     ${i + 1}. ${gen.label}`);
        const args = gen.args || {};
        if (args.P) console.log(`        有功: ${args.P} MW`);
        if (args.V) console.log(`        电压: ${args.V} p.u.`);
      });
    }

    // 查看线路详情
    const lines = global.inventory.devices.line || [];
    if (lines.length > 0) {
      console.log(`\n   线路详情 (${lines.length} 条):`);
      lines.slice(0, 3).forEach((line, i) => {
        console.log(`     ${i + 1}. ${line.label}`);
      });
    }
  });

  await runTest('US-044: 导出台账CSV格式', async () => {
    if (!global.inventory) {
      throw new Error('无台账数据');
    }

    const csv = global.inventory.csv;
    if (!csv || csv.length === 0) {
      throw new Error('CSV导出失败');
    }

    console.log(`   CSV数据大小: ${csv.length} 字符`);
    console.log(`   ✅ CSV导出成功`);
  });

  // ========== US-046: 设备过载预警 ==========
  console.log('\n📦 US-046: 设备过载预警');

  await runTest('US-046: 生成过载预警', async () => {
    if (!global.jobId) {
      throw new Error('无潮流计算结果');
    }

    const warnings = await skills.operationSupport.generateOverloadWarnings(global.jobId, {
      warningThreshold: 0.8,
      criticalThreshold: 1.0,
      includeVoltage: true
    });

    console.log(`   预警时间: ${warnings.timestamp}`);
    console.log(`   预警统计:`);
    console.log(`     - 紧急: ${warnings.summary.criticalCount} 项`);
    console.log(`     - 警告: ${warnings.summary.warningCount} 项`);
    console.log(`     - 提示: ${warnings.summary.noticeCount} 项`);

    global.warnings = warnings;
  });

  await runTest('US-046: 查看紧急预警详情', async () => {
    if (!global.warnings) {
      throw new Error('无预警数据');
    }

    const critical = global.warnings.critical || [];

    if (critical.length === 0) {
      console.log(`   ✅ 无紧急预警`);
    } else {
      console.log(`\n   紧急预警列表:`);
      critical.forEach((w, i) => {
        console.log(`     ${i + 1}. [${w.type}] ${w.deviceName}`);
        console.log(`        ${w.message}`);
        console.log(`        建议: ${w.suggestion}`);
      });
    }
  });

  await runTest('US-046: 查看警告和提示', async () => {
    if (!global.warnings) {
      throw new Error('无预警数据');
    }

    const warningList = global.warnings.warning || [];
    const noticeList = global.warnings.notice || [];

    if (warningList.length > 0) {
      console.log(`\n   警告列表 (${warningList.length} 项):`);
      warningList.slice(0, 3).forEach((w, i) => {
        console.log(`     ${i + 1}. ${w.deviceName}: ${w.message}`);
      });
    }

    if (noticeList.length > 0) {
      console.log(`\n   提示列表 (${noticeList.length} 项):`);
      noticeList.slice(0, 3).forEach((w, i) => {
        console.log(`     ${i + 1}. ${w.deviceName}: ${w.message}`);
      });
    }

    if (warningList.length === 0 && noticeList.length === 0) {
      console.log(`   ✅ 无警告和提示`);
    }
  });

  // ========== US-047: 检修影响评估 ==========
  console.log('\n📦 US-047: 检修影响评估');

  await runTest('US-047: 配置检修场景', async () => {
    // 选择一个设备进行检修评估
    const lines = global.inventory?.devices?.line || [];
    if (lines.length === 0) {
      console.log('   ⚠️ 无线路数据，使用模拟配置');
      global.maintenanceConfig = {
        deviceKey: 'line_test',
        deviceName: 'Test Line',
        maintenanceType: 'planned',
        duration: '8h'
      };
    } else {
      global.maintenanceConfig = {
        deviceKey: lines[0].key,
        deviceName: lines[0].label,
        maintenanceType: 'planned',
        duration: '8h'
      };
    }

    console.log(`   检修设备: ${global.maintenanceConfig.deviceName}`);
    console.log(`   检修类型: ${global.maintenanceConfig.maintenanceType}`);
    console.log(`   检修时长: ${global.maintenanceConfig.duration}`);
  });

  await runTest('US-047: 执行检修影响评估', async () => {
    const rid = global.testRid || TEST_RID;

    const assessment = await skills.operationSupport.assessMaintenanceImpact(
      rid,
      global.maintenanceConfig
    );

    console.log(`   评估时间: ${assessment.timestamp}`);
    console.log(`   基准潮流状态: ${assessment.baseCase?.status || 'N/A'}`);

    if (assessment.baseCase?.violations) {
      console.log(`   基准越限情况:`);
      console.log(`     - 电压越限: ${assessment.baseCase.violations.voltageViolations?.count || 0}`);
      console.log(`     - 线路过载: ${assessment.baseCase.violations.lineOverloads?.count || 0}`);
    }

    if (assessment.impact) {
      console.log(`   影响类型: ${assessment.impact.type || 'N/A'}`);
      console.log(`   影响描述: ${assessment.impact.description || 'N/A'}`);
    }

    global.assessment = assessment;
  });

  await runTest('US-047: 查看检修风险评估', async () => {
    if (!global.assessment) {
      throw new Error('无评估数据');
    }

    const risk = global.assessment.riskLevel;
    if (risk) {
      console.log(`   风险等级: ${risk.level}`);
      console.log(`   风险描述: ${risk.message}`);
    }

    const recommendations = global.assessment.recommendations || [];
    if (recommendations.length > 0) {
      console.log(`\n   检修建议:`);
      recommendations.forEach((rec, i) => {
        console.log(`     ${i + 1}. [${rec.priority}] ${rec.message}`);
      });
    }
  });

  // ========== US-048: 系统运行方式档案 ==========
  console.log('\n📦 US-048: 系统运行方式档案');

  await runTest('US-048: 保存运行方式快照', async () => {
    const rid = global.testRid || TEST_RID;

    const snapshot = await skills.operationSupport.saveOperatingModeSnapshot(rid, {
      name: 'E2E测试运行方式',
      description: '自动化测试创建的运行方式快照',
      tags: ['e2e', 'test', 'power-flow']
    });

    console.log(`   快照ID: ${snapshot.id}`);
    console.log(`   快照名称: ${snapshot.name}`);
    console.log(`   元件数量: ${snapshot.componentSummary?.total || 0}`);
    console.log(`   状态: ${snapshot.status}`);

    global.snapshot = snapshot;
  });

  await runTest('US-048: 查看快照元件统计', async () => {
    if (!global.snapshot) {
      throw new Error('无快照数据');
    }

    const summary = global.snapshot.componentSummary;
    if (summary && summary.byType) {
      console.log(`   元件类型统计:`);
      Object.entries(summary.byType).forEach(([type, count]) => {
        console.log(`     - ${type}: ${count}`);
      });
    }
  });

  await runTest('US-048: 搜索运行方式档案', async () => {
    const result = await skills.operationSupport.searchOperatingModeArchive({
      name: 'E2E'
    });

    console.log(`   搜索结果: ${result.results?.length || 0} 条`);
    console.log(`   ${result.message || ''}`);
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('运维支持测试结果汇总');
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