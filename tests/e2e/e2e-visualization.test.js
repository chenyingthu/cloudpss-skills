#!/usr/bin/env node
/**
 * E2E Tests for Visualization Stories
 *
 * US-020: 结果可视化
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
  console.log('║       E2E Test: Visualization Stories                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();
  let testRid = TEST_RID;

  // 准备测试数据
  console.log('\n📋 准备测试数据');
  await runTest('运行潮流计算获取可视化数据', async () => {
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

  // ========== US-020: 结果可视化 ==========
  console.log('\n📦 US-020: 结果可视化');

  await runTest('US-020: 生成电压等高线数据', async () => {
    if (!global.jobId) {
      throw new Error('无潮流计算结果');
    }

    const contour = await skills.visualization.voltageContour(global.jobId, {
      levels: 15,
      minVoltage: 0.85,
      maxVoltage: 1.15
    });

    if (!contour.levels || contour.levels.length === 0) {
      throw new Error('等高线数据生成失败');
    }

    console.log(`   等高线级数: ${contour.levels.length}`);
    console.log(`   节点数量: ${contour.summary.total}`);
    console.log(`   电压分布:`);
    console.log(`     - 严重偏低 (<0.90): ${contour.summary.criticalLow}`);
    console.log(`     - 警告偏低 (0.90-0.95): ${contour.summary.warningLow}`);
    console.log(`     - 正常 (0.95-1.05): ${contour.summary.normal}`);
    console.log(`     - 警告偏高 (1.05-1.10): ${contour.summary.warningHigh}`);
    console.log(`     - 严重偏高 (>1.10): ${contour.summary.criticalHigh}`);

    global.voltageContour = contour;
  });

  await runTest('US-020: 生成线路负载热力图数据', async () => {
    if (!global.jobId) {
      throw new Error('无潮流计算结果');
    }

    const heatmap = await skills.visualization.branchHeatmap(global.jobId, {
      warningThreshold: 0.8,
      criticalThreshold: 1.0
    });

    if (!heatmap.branches || heatmap.branches.length === 0) {
      throw new Error('热力图数据生成失败');
    }

    console.log(`   支路数量: ${heatmap.statistics.total}`);
    console.log(`   负载分布:`);
    console.log(`     - 过载 (>100%): ${heatmap.statistics.overload}`);
    console.log(`     - 重载 (80-100%): ${heatmap.statistics.heavy}`);
    console.log(`     - 中载 (50-80%): ${heatmap.statistics.moderate}`);
    console.log(`     - 轻载 (<50%): ${heatmap.statistics.light}`);

    // 显示最高负载线路
    const topLoaded = heatmap.branches.slice(0, 3);
    if (topLoaded.length > 0) {
      console.log(`\n   最高负载线路:`);
      topLoaded.forEach(b => {
        console.log(`     - ${b.name}: ${b.loadingPercent}%`);
      });
    }

    global.branchHeatmap = heatmap;
  });

  await runTest('US-020: 生成潮流流向图数据', async () => {
    if (!global.jobId) {
      throw new Error('无潮流计算结果');
    }

    const flowDiagram = await skills.visualization.powerFlowDiagram(global.jobId, {
      minFlowMW: 10,
      showLosses: true
    });

    if (!flowDiagram.nodes || flowDiagram.nodes.length === 0) {
      throw new Error('流向图数据生成失败');
    }

    console.log(`   节点数量: ${flowDiagram.nodes.length}`);
    console.log(`   边数量: ${flowDiagram.edges.length}`);
    console.log(`   潮流统计:`);
    console.log(`     - 总发电: ${flowDiagram.summary.totalGeneration.toFixed(2)} MW`);
    console.log(`     - 总负荷: ${flowDiagram.summary.totalLoad.toFixed(2)} MW`);
    console.log(`     - 总损耗: ${flowDiagram.summary.totalLoss.toFixed(2)} MW`);
    console.log(`     - 平均负载率: ${(flowDiagram.summary.avgLoading * 100).toFixed(1)}%`);

    global.flowDiagram = flowDiagram;
  });

  await runTest('US-020: 生成综合可视化报告', async () => {
    if (!global.jobId) {
      throw new Error('无潮流计算结果');
    }

    const vizReport = await skills.visualization.generateVisualizationReport(global.jobId, {
      includeContour: true,
      includeHeatmap: true,
      includeFlowDiagram: true
    });

    if (!vizReport.voltageContour || !vizReport.branchHeatmap || !vizReport.powerFlowDiagram) {
      throw new Error('综合报告生成不完整');
    }

    console.log(`   报告时间: ${vizReport.timestamp}`);
    console.log(`   包含组件:`);
    console.log(`     - 电压等高线: ✅`);
    console.log(`     - 负载热力图: ✅`);
    console.log(`     - 潮流流向图: ✅`);

    // 导出为JSON格式
    const exportData = skills.visualization.exportChart(vizReport, 'json');
    console.log(`\n   导出数据大小: ${exportData.length} 字符`);
  });

  await runTest('US-020: 验证数据导出格式', async () => {
    // 验证各种导出格式
    const contourExport = skills.visualization.exportChart(global.voltageContour, 'json');
    const heatmapExport = skills.visualization.exportChart(global.branchHeatmap, 'json');

    // 验证JSON格式
    try {
      const contourData = JSON.parse(contourExport);
      const heatmapData = JSON.parse(heatmapExport);

      console.log(`   JSON导出验证:`);
      console.log(`     - 电压等高线: ${contourData.summary?.total || 0} 节点`);
      console.log(`     - 负载热力图: ${heatmapData.statistics?.total || 0} 支路`);
      console.log(`   ✅ 导出格式正确`);
    } catch (error) {
      throw new Error(`导出格式验证失败: ${error.message}`);
    }
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('可视化测试结果汇总');
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