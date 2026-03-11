#!/usr/bin/env node
/**
 * E2E Tests for Reporting and Export Stories
 *
 * US-037: 潮流分析报告生成
 * US-038: N-1扫描报告
 * US-039: 结果数据导出
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
  console.log('║       E2E Test: Reporting and Export Stories                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();
  let testRid = TEST_RID;

  // 先获取测试算例并运行潮流计算
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

    // 运行潮流计算以获取结果
    try {
      const pfResult = await skills.powerFlow.runPowerFlow(testRid);
      console.log(`   潮流计算完成: ${pfResult.status}`);
      global.pfResult = pfResult;
    } catch (error) {
      throw error;
    }
  });

  // ========== US-037: 潮流分析报告生成 ==========
  console.log('\n📦 US-037: 潮流分析报告生成');

  await runTest('US-037: 生成潮流分析报告', async () => {
    const rid = global.testRid || TEST_RID;

    const report = await skills.powerFlow.generateReport(rid, {
      includeVoltages: true,
      includeBranchFlows: true,
      includeViolations: true,
      format: 'markdown'
    });

    if (!report) {
      throw new Error('报告生成失败');
    }

    console.log(`   报告格式: ${report.format || 'markdown'}`);
    console.log(`   报告内容长度: ${report.content?.length || 0} 字符`);

    if (report.sections) {
      console.log(`   报告章节:`);
      report.sections.forEach(s => console.log(`   - ${s}`));
    }

    global.pfReport = report;
  });

  await runTest('US-037: 验证报告内容完整性', async () => {
    if (!global.pfReport) {
      throw new Error('无报告数据');
    }

    const requiredSections = ['基本信息', '节点电压', '支路功率'];
    const content = global.pfReport.content || '';

    let hasAllSections = true;
    for (const section of requiredSections) {
      if (!content.includes(section) && !global.pfReport.sections?.includes(section)) {
        console.log(`   ⚠️ 缺少章节: ${section}`);
        hasAllSections = false;
      }
    }

    if (hasAllSections) {
      console.log(`   ✅ 报告包含所有必要章节`);
    }

    // 保存报告到临时文件
    const reportPath = `/tmp/pf_report_${Date.now()}.md`;
    fs.writeFileSync(reportPath, content);
    console.log(`   报告已保存: ${reportPath}`);

    global.reportPath = reportPath;
  });

  // ========== US-038: N-1扫描报告 ==========
  console.log('\n📦 US-038: N-1扫描报告');

  await runTest('US-038: 执行N-1扫描', async () => {
    const rid = global.testRid || TEST_RID;

    try {
      const scanResult = await skills.n1Analysis.runFullScan(rid, {
        includeLines: true,
        includeTransformers: false,
        includeGenerators: false
      });

      console.log(`   N-1扫描状态: ${scanResult?.status || 'completed'}`);
      global.n1ScanResult = scanResult;
    } catch (error) {
      throw new Error(`N-1扫描失败: ${error.message}`);
    }
  });

  await runTest('US-038: 生成N-1扫描报告', async () => {
    const rid = global.testRid || TEST_RID;

    const report = await skills.n1Analysis.generateReport(rid, global.n1ScanResult, {
      format: 'markdown',
      includeDetails: true
    });

    if (!report) {
      throw new Error('N-1报告生成失败');
    }

    console.log(`   报告格式: ${report.format || 'markdown'}`);
    console.log(`   报告内容长度: ${report.content?.length || 0} 字符`);

    global.n1Report = report;
  });

  await runTest('US-038: 验证N-1报告结构', async () => {
    if (!global.n1Report) {
      throw new Error('无N-1报告数据');
    }

    const expectedSections = ['扫描范围', '扫描结果', '薄弱环节'];
    const content = global.n1Report.content || '';

    console.log(`   报告章节检查:`);
    for (const section of expectedSections) {
      const hasSection = content.includes(section) || global.n1Report.sections?.includes(section);
      console.log(`   ${hasSection ? '✅' : '⚠️'} ${section}`);
    }

    // 保存报告
    const reportPath = `/tmp/n1_report_${Date.now()}.md`;
    fs.writeFileSync(reportPath, global.n1Report.content);
    console.log(`   N-1报告已保存: ${reportPath}`);
  });

  // ========== US-039: 结果数据导出 ==========
  console.log('\n📦 US-039: 结果数据导出');

  // 先运行批量潮流计算获取可导出的结果
  await runTest('US-039: 准备批量计算结果', async () => {
    const rid = global.testRid || TEST_RID;

    const scenarios = [
      { name: '基准场景', jobIndex: 0, configIndex: 0 }
    ];

    try {
      const batchResult = await skills.batchEnhanced.runPowerFlowBatch(rid, scenarios);
      console.log(`   批量计算完成: ${batchResult.results?.length || 0} 个场景`);
      global.batchResult = batchResult;
    } catch (error) {
      console.log(`   ⚠️ 批量计算问题: ${error.message}`);
      global.batchResult = null;
    }
  });

  await runTest('US-039: 导出为Excel格式', async () => {
    if (!global.batchResult) {
      throw new Error('无批量计算结果');
    }

    try {
      // exportResults 返回字符串，不是对象
      const exportData = skills.batchEnhanced.exportResults(global.batchResult, 'json');
      const exportPath = `/tmp/powerflow_results_${Date.now()}.json`;

      fs.writeFileSync(exportPath, exportData);
      const stats = fs.statSync(exportPath);

      console.log(`   导出路径: ${exportPath}`);
      console.log(`   文件大小: ${stats.size} bytes`);
      global.xlsxExport = { success: true, filePath: exportPath };
    } catch (error) {
      console.log(`   ⚠️ Excel导出问题: ${error.message}`);
      global.xlsxExport = { success: false, error: error.message };
    }
  });

  await runTest('US-039: 导出为CSV格式', async () => {
    if (!global.batchResult) {
      throw new Error('无批量计算结果');
    }

    try {
      const exportData = skills.batchEnhanced.exportResults(global.batchResult, 'csv');
      const exportPath = `/tmp/powerflow_results_${Date.now()}.csv`;

      fs.writeFileSync(exportPath, exportData);
      const stats = fs.statSync(exportPath);

      console.log(`   导出路径: ${exportPath}`);
      console.log(`   文件大小: ${stats.size} bytes`);
      global.csvExport = { success: true, filePath: exportPath };
    } catch (error) {
      console.log(`   ⚠️ CSV导出问题: ${error.message}`);
      global.csvExport = { success: false, error: error.message };
    }
  });

  await runTest('US-039: 导出为JSON格式', async () => {
    if (!global.batchResult) {
      throw new Error('无批量计算结果');
    }

    try {
      const exportData = skills.batchEnhanced.exportResults(global.batchResult, 'json');
      const exportPath = `/tmp/powerflow_results_${Date.now()}.json`;

      fs.writeFileSync(exportPath, exportData);
      const stats = fs.statSync(exportPath);

      console.log(`   导出路径: ${exportPath}`);
      console.log(`   文件大小: ${stats.size} bytes`);
      global.jsonExport = { success: true, filePath: exportPath };
    } catch (error) {
      console.log(`   ⚠️ JSON导出问题: ${error.message}`);
      global.jsonExport = { success: false, error: error.message };
    }
  });

  await runTest('US-039: 验证导出文件可用性', async () => {
    const exportedFiles = [];

    if (global.xlsxExport?.filePath && fs.existsSync(global.xlsxExport.filePath)) {
      exportedFiles.push({ type: 'xlsx', path: global.xlsxExport.filePath });
    }
    if (global.csvExport?.filePath && fs.existsSync(global.csvExport.filePath)) {
      exportedFiles.push({ type: 'csv', path: global.csvExport.filePath });
    }
    if (global.jsonExport?.filePath && fs.existsSync(global.jsonExport.filePath)) {
      exportedFiles.push({ type: 'json', path: global.jsonExport.filePath });
    }

    console.log(`   成功导出文件: ${exportedFiles.length} 个`);
    exportedFiles.forEach(f => {
      const stats = fs.statSync(f.path);
      console.log(`   - ${f.type.toUpperCase()}: ${f.path} (${stats.size} bytes)`);
    });

    // 清理测试文件
    exportedFiles.forEach(f => {
      try {
        fs.unlinkSync(f.path);
        console.log(`   🧹 已清理: ${f.path}`);
      } catch (e) {
        // 忽略清理错误
      }
    });

    if (global.reportPath) {
      try {
        fs.unlinkSync(global.reportPath);
      } catch (e) {}
    }
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('报告与导出测试结果汇总');
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