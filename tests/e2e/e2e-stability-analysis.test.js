#!/usr/bin/env node
/**
 * E2E Tests for Stability Analysis Stories
 *
 * US-028: 稳定裕度评估
 * US-035: 潮流收敛性诊断
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
const TEST_TIMEOUT = 300000; // 5 minutes for stability analysis

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
  console.log('║       E2E Test: Stability Analysis Stories                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();
  let testRid = TEST_RID;

  // 获取测试算例
  console.log('\n📋 准备测试数据');
  await runTest('搜索IEEE测试算例', async () => {
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
  });

  // ========== US-028: 稳定裕度评估 ==========
  console.log('\n📦 US-028: 稳定裕度评估');

  await runTest('US-028: 配置稳定裕度分析参数', async () => {
    global.stabilityConfig = {
      startPercent: 100,
      endPercent: 140,
      step: 10,
      direction: 'uniform',
      checkViolations: true
    };

    console.log(`   扫描范围: ${global.stabilityConfig.startPercent}% ~ ${global.stabilityConfig.endPercent}%`);
    console.log(`   步长: ${global.stabilityConfig.step}%`);
  });

  await runTest('US-028: 执行电压稳定裕度分析', async () => {
    const rid = global.testRid || TEST_RID;

    const result = await skills.stabilityAnalysis.voltageStabilityMargin(rid, global.stabilityConfig);

    if (!result.loadGrowthResults || result.loadGrowthResults.length === 0) {
      throw new Error('稳定裕度分析未返回结果');
    }

    console.log(`   分析点数: ${result.loadGrowthResults.length}`);
    console.log(`   稳定裕度: ${result.marginPercent}`);

    // 显示收敛情况
    const converged = result.loadGrowthResults.filter(r => r.converged);
    console.log(`   收敛点数: ${converged.length}/${result.loadGrowthResults.length}`);

    // 显示临界点信息
    if (result.criticalPoint) {
      console.log(`   临界点: 负荷 ${result.criticalPoint.percent}%`);
      console.log(`   临界类型: ${result.criticalPoint.type}`);
    }

    // 显示评估结果
    if (result.assessment) {
      console.log(`   评估等级: ${result.assessment.level}`);
      console.log(`   评估信息: ${result.assessment.message}`);
    }

    global.stabilityResult = result;
  });

  await runTest('US-028: 识别薄弱节点', async () => {
    if (!global.stabilityResult) {
      throw new Error('无稳定分析结果');
    }

    const weakBuses = global.stabilityResult.weakBuses || [];

    console.log(`   薄弱节点数量: ${weakBuses.length}`);

    if (weakBuses.length > 0) {
      console.log(`\n   薄弱节点列表:`);
      weakBuses.slice(0, 5).forEach((bus, i) => {
        console.log(`     ${i + 1}. ${bus.name}: ${bus.voltage.toFixed(4)} p.u.`);
      });
    } else {
      console.log(`   ✅ 未识别到明显薄弱节点`);
    }
  });

  await runTest('US-028: 生成稳定分析建议', async () => {
    if (!global.stabilityResult) {
      throw new Error('无稳定分析结果');
    }

    const recommendations = global.stabilityResult.recommendations || [];

    console.log(`   建议数量: ${recommendations.length}`);

    if (recommendations.length > 0) {
      console.log(`\n   稳定分析建议:`);
      recommendations.forEach((rec, i) => {
        console.log(`     ${i + 1}. [${rec.priority}] ${rec.message}`);
      });
    }
  });

  // ========== US-035: 潮流收敛性诊断 ==========
  console.log('\n📦 US-035: 潮流收敛性诊断');

  await runTest('US-035: 执行收敛性诊断', async () => {
    const rid = global.testRid || TEST_RID;

    const diagnosis = await skills.stabilityAnalysis.diagnoseConvergence(rid);

    if (!diagnosis) {
      throw new Error('收敛性诊断未返回结果');
    }

    console.log(`   诊断时间: ${diagnosis.timestamp}`);
    console.log(`   健康评分: ${diagnosis.healthScore}/100`);
    console.log(`   问题数量: ${diagnosis.issues.length}`);

    global.diagnosis = diagnosis;
  });

  await runTest('US-035: 分析诊断问题', async () => {
    if (!global.diagnosis) {
      throw new Error('无诊断结果');
    }

    const issues = global.diagnosis.issues || [];

    if (issues.length === 0) {
      console.log(`   ✅ 系统诊断正常，未发现问题`);
    } else {
      console.log(`   发现问题:`);

      const critical = issues.filter(i => i.severity === 'critical');
      const warning = issues.filter(i => i.severity === 'warning');

      console.log(`     - 严重问题: ${critical.length} 个`);
      console.log(`     - 警告问题: ${warning.length} 个`);

      // 显示具体问题
      issues.forEach(issue => {
        console.log(`\n     [${issue.severity.toUpperCase()}] ${issue.type}`);
        console.log(`       ${issue.message}`);
      });
    }
  });

  await runTest('US-035: 检查孤立节点', async () => {
    if (!global.diagnosis) {
      throw new Error('无诊断结果');
    }

    const isolatedIssue = global.diagnosis.issues.find(i => i.type === 'isolated-nodes');

    if (isolatedIssue) {
      console.log(`   ⚠️ 发现孤立节点: ${isolatedIssue.details?.length || 0} 个`);
      if (isolatedIssue.details) {
        isolatedIssue.details.slice(0, 5).forEach(node => {
          console.log(`     - ${node.label}`);
        });
      }
    } else {
      console.log(`   ✅ 未发现孤立节点`);
    }
  });

  await runTest('US-035: 检查功率平衡', async () => {
    if (!global.diagnosis) {
      throw new Error('无诊断结果');
    }

    const balanceIssue = global.diagnosis.issues.find(i => i.type === 'power-balance');

    if (balanceIssue) {
      console.log(`   ⚠️ 功率平衡问题: ${balanceIssue.message}`);
    } else {
      console.log(`   ✅ 功率平衡正常`);
    }
  });

  await runTest('US-035: 获取修复建议', async () => {
    if (!global.diagnosis) {
      throw new Error('无诊断结果');
    }

    const suggestions = global.diagnosis.suggestions || [];

    console.log(`   修复建议数量: ${suggestions.length}`);

    if (suggestions.length > 0) {
      console.log(`\n   修复建议:`);
      suggestions.forEach((sug, i) => {
        console.log(`     ${i + 1}. ${sug.message}`);
      });
    } else {
      console.log(`   ✅ 无需修复`);
    }

    console.log(`\n   自动修复可用: ${global.diagnosis.autoFixAvailable ? '是' : '否'}`);
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('稳定分析测试结果汇总');
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