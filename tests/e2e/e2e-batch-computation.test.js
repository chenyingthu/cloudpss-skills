#!/usr/bin/env node
/**
 * E2E Tests for Batch Computation Stories
 *
 * US-030: 负荷增长极限分析
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
const TEST_TIMEOUT = 300000; // 5 minutes for batch operations

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
  console.log('║       E2E Test: Batch Computation Stories                       ║');
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

  // ========== US-030: 负荷增长极限分析 ==========
  console.log('\n📦 US-030: 负荷增长极限分析');

  await runTest('US-030: 获取当前负荷水平', async () => {
    const rid = global.testRid || TEST_RID;
    const components = await skills.client.getAllComponents(rid);

    // 统计负荷
    let totalLoadP = 0;
    let totalLoadQ = 0;
    const loads = [];

    for (const [key, comp] of Object.entries(components || {})) {
      const def = (comp.definition || '').toLowerCase();
      const label = (comp.label || '').toLowerCase();

      if (def.includes('load') || def.includes('pq') || label.includes('负荷')) {
        // 处理可能的NaN值
        const pRaw = comp.args?.P || comp.args?.p || comp.args?.P0 || comp.args?.p0;
        const qRaw = comp.args?.Q || comp.args?.q || comp.args?.Q0 || comp.args?.q0;
        const p = pRaw !== undefined ? parseFloat(pRaw) : 0;
        const q = qRaw !== undefined ? parseFloat(qRaw) : 0;
        totalLoadP += isNaN(p) ? 0 : p;
        totalLoadQ += isNaN(q) ? 0 : q;
        loads.push({ key, label: comp.label, P: isNaN(p) ? 0 : p, Q: isNaN(q) ? 0 : q });
      }
    }

    console.log(`   负荷元件数量: ${loads.length}`);
    console.log(`   当前总有功负荷: ${totalLoadP.toFixed(2)} MW`);
    console.log(`   当前总无功负荷: ${totalLoadQ.toFixed(2)} MVar`);

    global.loads = loads;
    global.totalLoadP = totalLoadP;
    global.totalLoadQ = totalLoadQ;
    global.baseLoadP = totalLoadP > 0 ? totalLoadP : 1000;  // 默认1000MW如果无法获取
  });

  await runTest('US-030: 配置负荷增长扫描', async () => {
    // 配置扫描参数 - 使用百分比格式，与loadGrowthScan函数参数匹配
    // startPercent/endPercent 是百分比值，step 是百分比步长
    global.loadGrowthConfig = {
      startPercent: 100,    // 从100%开始
      endPercent: 130,      // 增长到130%
      step: 10,             // 步长10% (只生成4个场景)
      checkViolations: true
    };

    console.log(`   扫描配置:`);
    console.log(`   - 起始负荷: ${global.loadGrowthConfig.startPercent}%`);
    console.log(`   - 终止负荷: ${global.loadGrowthConfig.endPercent}%`);
    console.log(`   - 步长: ${global.loadGrowthConfig.step}%`);
    console.log(`   - 基准有功负荷: ${global.baseLoadP.toFixed(2)} MW`);
  });

  await runTest('US-030: 执行负荷增长扫描', async () => {
    const rid = global.testRid || TEST_RID;

    const scanResult = await skills.batchEnhanced.loadGrowthScan(rid, {
      startPercent: global.loadGrowthConfig.startPercent,
      endPercent: global.loadGrowthConfig.endPercent,
      step: global.loadGrowthConfig.step,
      checkViolations: true
    });

    if (!scanResult || !scanResult.results) {
      throw new Error('负荷增长扫描未返回结果');
    }

    console.log(`   扫描点数: ${scanResult.results.length}`);

    // 显示扫描进度
    scanResult.results.forEach((r, i) => {
      const percent = r.percent || (global.loadGrowthConfig.startPercent + i * global.loadGrowthConfig.step);
      const status = r.converged ? '✅ 收敛' : '❌ 不收敛';
      const violations = r.violationCount || 0;
      console.log(`   - 负荷 ${percent}%: ${status}, 越限 ${violations} 处`);
    });

    // ========== 数值合理性验证 ==========
    // 1. 验证结果数量正确
    const expectedCount = Math.ceil((global.loadGrowthConfig.endPercent - global.loadGrowthConfig.startPercent) / global.loadGrowthConfig.step) + 1;
    if (scanResult.results.length < expectedCount - 1) {  // 允许1个差异
      throw new Error(`结果数量不匹配: 期望约${expectedCount}个, 实际${scanResult.results.length}个`);
    }

    // 2. 验证每个结果都有percent字段
    for (let i = 0; i < scanResult.results.length; i++) {
      const r = scanResult.results[i];
      if (r.percent === undefined || r.percent === null) {
        console.log(`   ⚠️ 结果${i}缺少percent字段`);
      }
    }

    // 3. 验证电压值在合理范围内 (0.7 ~ 1.3 p.u.)
    for (const r of scanResult.results) {
      if (r.summary?.voltage) {
        const v = r.summary.voltage;
        if (v.min < 0.7 || v.max > 1.3) {
          throw new Error(`电压值超出合理范围: min=${v.min}, max=${v.max}`);
        }
        console.log(`   ✓ 电压范围合理: ${v.min.toFixed(4)} ~ ${v.max.toFixed(4)} p.u.`);
      }
    }

    // 4. 验证网损值为正数
    for (const r of scanResult.results) {
      if (r.summary?.power?.totalPLoss !== undefined) {
        const loss = r.summary.power.totalPLoss;
        if (loss < 0) {
          throw new Error(`网损为负数: ${loss}`);
        }
        if (loss > 1000) {
          throw new Error(`网损异常大: ${loss} MW`);
        }
      }
    }

    console.log(`   ✅ 数值验证通过`);

    global.loadGrowthResult = scanResult;
  });

  await runTest('US-030: 确定临界负荷水平', async () => {
    if (!global.loadGrowthResult || !global.loadGrowthResult.results) {
      throw new Error('没有扫描结果');
    }

    // 找到第一个不收敛的点（status === 'error'）
    const results = global.loadGrowthResult.results;
    let criticalIndex = results.findIndex(r => r.status === 'error');

    if (criticalIndex === -1) {
      // 如果全部收敛，找到第一个严重越限的点
      criticalIndex = results.findIndex(r => (r.summary?.violations?.voltageCount || 0) + (r.summary?.violations?.overloadCount || 0) > 5);
    }

    let criticalPercent;
    let previousPercent;

    if (criticalIndex > 0) {
      criticalPercent = results[criticalIndex].percent || (global.loadGrowthConfig.startPercent + criticalIndex * global.loadGrowthConfig.step);
      previousPercent = results[criticalIndex - 1].percent || (global.loadGrowthConfig.startPercent + (criticalIndex - 1) * global.loadGrowthConfig.step);
    } else if (criticalIndex === 0) {
      criticalPercent = results[0].percent || global.loadGrowthConfig.startPercent;
      previousPercent = results[0].percent || global.loadGrowthConfig.startPercent;
    } else {
      // 全部可接受
      criticalPercent = results[results.length - 1].percent || global.loadGrowthConfig.endPercent;
      previousPercent = criticalPercent;
    }

    // 确保criticalPercent是有效数字
    if (typeof criticalPercent !== 'number' || isNaN(criticalPercent)) {
      criticalPercent = global.loadGrowthConfig.endPercent;
      previousPercent = criticalPercent;
    }

    const criticalFactor = criticalPercent / 100;
    const criticalLoad = global.baseLoadP * criticalFactor;

    // ========== 数值合理性验证 ==========
    // 1. 验证临界负荷为有效数值
    if (isNaN(criticalLoad) || criticalLoad < 0) {
      throw new Error(`临界负荷计算异常: ${criticalLoad}`);
    }

    // 2. 验证临界百分比在合理范围内
    if (criticalPercent < 50 || criticalPercent > 200) {
      throw new Error(`临界百分比异常: ${criticalPercent}%`);
    }

    console.log(`   临界分析结果:`);
    console.log(`   - 临界负荷水平: ${criticalPercent}%`);
    console.log(`   - 临界有功负荷: ${criticalLoad?.toFixed(2) || 'N/A'} MW`);
    console.log(`   - 相对当前负荷增长: ${(criticalPercent - 100).toFixed(1)}%`);

    // 计算安全裕度
    const safePercent = criticalIndex > 0 ? previousPercent : criticalPercent;
    const margin = (safePercent - 100).toFixed(1);
    console.log(`   - 安全负荷裕度: ${margin}%`);

    global.criticalPercent = criticalPercent;
    global.criticalLoad = criticalLoad;
    global.safeMargin = parseFloat(margin);
  });

  await runTest('US-030: 识别瓶颈设备', async () => {
    if (!global.loadGrowthResult || !global.loadGrowthResult.results) {
      throw new Error('没有扫描结果');
    }

    // 找到越限点
    const violationPoints = global.loadGrowthResult.results
      .filter(r => r.violations && r.violations.length > 0)
      .flatMap(r => r.violations || []);

    if (violationPoints.length > 0) {
      // 统计越限设备频率
      const violationCount = {};
      violationPoints.forEach(v => {
        const key = v.element || v.branch || v.bus;
        if (key) {
          violationCount[key] = (violationCount[key] || 0) + 1;
        }
      });

      const bottlenecks = Object.entries(violationCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      console.log(`   瓶颈设备识别:`);
      bottlenecks.forEach(([element, count]) => {
        console.log(`   - ${element}: 越限 ${count} 次`);
      });

      global.bottlenecks = bottlenecks;
    } else {
      console.log(`   ✅ 在扫描范围内未识别到瓶颈设备`);
      global.bottlenecks = [];
    }
  });

  await runTest('US-030: 生成分析报告', async () => {
    const rid = global.testRid || TEST_RID;

    // 生成负荷增长极限分析报告
    const reportPath = `/tmp/load_growth_analysis_${Date.now()}.txt`;

    let report = '═════════════════════════════════════════════════════\n';
    report += '           负荷增长极限分析报告\n';
    report += '═════════════════════════════════════════════════════\n\n';
    report += `算例: ${rid}\n`;
    report += `分析时间: ${new Date().toLocaleString()}\n\n`;

    report += '─── 基本信息 ───\n';
    report += `基准有功负荷: ${global.baseLoadP?.toFixed(2) || 'N/A'} MW\n`;
    report += `扫描范围: ${global.loadGrowthConfig.startPercent}% ~ ${global.loadGrowthConfig.endPercent}%\n`;
    report += `步长: ${global.loadGrowthConfig.step}%\n\n`;

    report += '─── 扫描结果 ───\n';
    global.loadGrowthResult.results.forEach((r, i) => {
      const status = r.converged ? '✅' : '❌';
      const violations = r.violationCount ?? 'N/A';
      const loss = r.totalLoss?.toFixed(2) || 'N/A';
      const percent = r.percent || (global.loadGrowthConfig.startPercent + i * global.loadGrowthConfig.step);
      report += `负荷 ${percent}%: ${status} 越限=${violations} 网损=${loss} MW\n`;
    });

    report += '\n─── 临界分析 ───\n';
    report += `临界负荷水平: ${global.criticalPercent || 'N/A'}%\n`;
    report += `临界有功负荷: ${global.criticalLoad?.toFixed(2) || 'N/A'} MW\n`;
    report += `安全负荷裕度: ${global.safeMargin || 'N/A'}%\n\n`;

    if (global.bottlenecks && global.bottlenecks.length > 0) {
      report += '─── 瓶颈设备 ───\n';
      global.bottlenecks.forEach(([element, count]) => {
        report += `${element}: 越限 ${count} 次\n`;
      });
      report += '\n';
    }

    report += '─── 结论与建议 ───\n';
    if (global.safeMargin > 20) {
      report += '系统具有充足的负荷增长空间。\n';
    } else if (global.safeMargin > 10) {
      report += '系统负荷裕度适中，建议关注瓶颈设备。\n';
    } else {
      report += '系统负荷裕度较小，建议采取措施提升供电能力。\n';
    }

    report += '\n═════════════════════════════════════════════════════\n';

    fs.writeFileSync(reportPath, report);
    console.log(`   报告已生成: ${reportPath}`);

    // 显示报告
    console.log(`\n   报告内容:`);
    report.split('\n').forEach(line => {
      console.log(`   ${line}`);
    });

    // 清理
    fs.unlinkSync(reportPath);
    console.log(`\n   测试文件已清理`);
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('批量计算测试结果汇总');
  console.log('═'.repeat(70));
  console.log(`\n✅ 通过: ${results.passed}`);
  console.log(`❌ 失败: ${results.failed}`);
  console.log(`📊 总计: ${results.passed + results.failed}`);

  // 关键发现
  console.log('\n📋 关键发现:');
  if (global.criticalFactor) {
    console.log(`   🎯 临界负荷系数: ${global.criticalFactor.toFixed(2)}`);
    console.log(`   📈 安全裕度: ${global.safeMargin}%`);
  }
  if (global.bottlenecks && global.bottlenecks.length > 0) {
    console.log(`   ⚠️ 瓶颈设备: ${global.bottlenecks.length} 个`);
  }

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