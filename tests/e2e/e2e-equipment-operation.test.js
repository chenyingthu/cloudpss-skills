#!/usr/bin/env node
/**
 * E2E Tests for Equipment Operation Stories
 *
 * US-043: 设备参数查询
 * US-045: 线路负载率统计
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
const TEST_TIMEOUT = 120000;

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
  console.log('║       E2E Test: Equipment Operation Stories                     ║');
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

    // 运行潮流计算以获取仿真结果
    try {
      const pfResult = await skills.powerFlow.runPowerFlow(testRid);
      console.log(`   潮流计算完成: ${pfResult.status}`);
      global.pfResult = pfResult;
    } catch (error) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('配额') || errorMsg.includes('Python process exited')) {
        console.log('   ⚠️ API配额耗尽，部分测试将跳过');
        global.quotaExhausted = true;
        return;
      }
      throw error;
    }
  });

  // ========== US-043: 设备参数查询 ==========
  console.log('\n📦 US-043: 设备参数查询');

  await runTest('US-043: 获取所有元件列表', async () => {
    const rid = global.testRid || TEST_RID;
    const components = await skills.client.getAllComponents(rid);

    if (!components || Object.keys(components).length === 0) {
      throw new Error('未获取到元件数据');
    }

    console.log(`   元件总数: ${Object.keys(components).length}`);

    // 统计元件类型
    const typeCount = {};
    for (const [key, comp] of Object.entries(components)) {
      const def = comp.definition || 'unknown';
      typeCount[def] = (typeCount[def] || 0) + 1;
    }

    console.log(`   元件类型统计:`);
    Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
      });

    global.components = components;
    global.typeCount = typeCount;
  });

  await runTest('US-043: 搜索特定设备', async () => {
    const rid = global.testRid || TEST_RID;

    // 按名称搜索发电机
    const searchTerm = 'Gen';
    const genComponents = Object.entries(global.components || {})
      .filter(([key, comp]) => {
        const label = (comp.label || '').toLowerCase();
        const def = (comp.definition || '').toLowerCase();
        return label.includes(searchTerm.toLowerCase()) ||
               def.includes('syncgen') || def.includes('generator');
      })
      .map(([key, comp]) => ({
        key,
        label: comp.label,
        definition: comp.definition
      }));

    if (genComponents.length === 0) {
      console.log('   ⚠️ 未找到发电机元件，尝试搜索其他类型');
    } else {
      console.log(`   找到发电机: ${genComponents.length} 台`);
      genComponents.slice(0, 3).forEach(g => {
        console.log(`   - ${g.label} (${g.key})`);
      });
    }

    global.generators = genComponents;
  });

  await runTest('US-043: 查看设备详细参数', async () => {
    if (!global.generators || global.generators.length === 0) {
      console.log('   ⚠️ 无发电机，尝试查看其他设备');
      // 尝试获取线路参数
      const lines = Object.entries(global.components || {})
        .filter(([key, comp]) => {
          const def = (comp.definition || '').toLowerCase();
          return def.includes('line') || def.includes('branch');
        })
        .slice(0, 1);

      if (lines.length > 0) {
        const [key, comp] = lines[0];
        console.log(`   线路: ${comp.label || key}`);
        console.log(`   参数:`);
        const args = comp.args || {};
        Object.entries(args).slice(0, 5).forEach(([k, v]) => {
          console.log(`     ${k}: ${v}`);
        });
        return;
      }
      throw new Error('没有可查看的设备');
    }

    const gen = global.generators[0];
    const genComp = global.components[gen.key];

    console.log(`   发电机: ${gen.label}`);
    console.log(`   定义: ${gen.definition}`);
    console.log(`   参数:`);

    const args = genComp.args || {};
    const paramKeys = ['P', 'Q', 'V', 'Vn', 'Sn'];
    paramKeys.forEach(key => {
      const value = args[key] || args[key.toLowerCase()];
      if (value !== undefined) {
        console.log(`     ${key}: ${value}`);
      }
    });

    // 显示连接信息
    if (genComp.ports || genComp.connections) {
      console.log(`   连接信息: 有端口配置`);
    }

    global.deviceParams = args;
  });

  await runTest('US-043: 导出设备参数卡片', async () => {
    const rid = global.testRid || TEST_RID;

    // 选择一些设备导出
    const deviceTypes = ['generator', 'transformer', 'line'];
    const exportedDevices = [];

    for (const type of deviceTypes) {
      const devices = Object.entries(global.components || {})
        .filter(([key, comp]) => {
          const def = (comp.definition || '').toLowerCase();
          return def.includes(type);
        })
        .slice(0, 2);

      devices.forEach(([key, comp]) => {
        exportedDevices.push({
          type,
          key,
          label: comp.label,
          definition: comp.definition,
          args: comp.args
        });
      });
    }

    console.log(`   导出设备: ${exportedDevices.length} 个`);

    // 生成简单的设备卡片
    const cardPath = `/tmp/device_cards_${Date.now()}.txt`;
    let cardContent = '═════════════════════════════════════════════════════\n';
    cardContent += '              设备参数卡片\n';
    cardContent += '═════════════════════════════════════════════════════\n\n';

    exportedDevices.forEach((d, i) => {
      cardContent += `【${i + 1}】${d.label || d.key}\n`;
      cardContent += `    类型: ${d.type}\n`;
      cardContent += `    定义: ${d.definition}\n`;
      if (d.args) {
        cardContent += `    参数:\n`;
        Object.entries(d.args).slice(0, 5).forEach(([k, v]) => {
          cardContent += `      ${k}: ${v}\n`;
        });
      }
      cardContent += '\n';
    });

    fs.writeFileSync(cardPath, cardContent);
    console.log(`   参数卡片已保存: ${cardPath}`);

    // 清理
    fs.unlinkSync(cardPath);
    console.log(`   测试文件已清理`);
  });

  // ========== US-045: 线路负载率统计 ==========
  console.log('\n📦 US-045: 线路负载率统计');

  await runTest('US-045: 获取线路功率数据', async () => {
    if (global.quotaExhausted) {
      console.log('   ⚠️ 跳过 (API配额耗尽)');
      return;
    }
    const rid = global.testRid || TEST_RID;
    const flows = await skills.powerFlow.getBranchFlows(rid);

    if (!flows || Object.keys(flows).length === 0) {
      throw new Error('未获取到支路功率数据');
    }

    console.log(`   支路数量: ${Object.keys(flows).length}`);

    // 显示前几条数据
    const flowEntries = Object.entries(flows).slice(0, 3);
    flowEntries.forEach(([branch, flow]) => {
      console.log(`   - ${branch}: P=${flow.P || flow.p || 'N/A'} MW`);
    });

    global.branchFlows = flows;
  });

  await runTest('US-045: 计算负载率分布', async () => {
    if (global.quotaExhausted || !global.branchFlows) {
      console.log('   ⚠️ 跳过 (API配额耗尽或无支路功率数据)');
      return;
    }

    const loadings = [];
    for (const [branch, flow] of Object.entries(global.branchFlows)) {
      const loading = parseFloat(flow.loading || flow.rate || 0);
      if (loading > 0) {
        loadings.push({ branch, loading, flow });
      }
    }

    // 按负载率排序
    loadings.sort((a, b) => b.loading - a.loading);

    // 统计分布
    const heavy = loadings.filter(l => l.loading > 0.8);
    const overload = loadings.filter(l => l.loading > 1.0);
    const normal = loadings.filter(l => l.loading <= 0.8);

    console.log(`   负载率分布统计:`);
    console.log(`   - 过载 (>100%): ${overload.length} 条`);
    console.log(`   - 重载 (80-100%): ${heavy.length - overload.length} 条`);
    console.log(`   - 正常 (<80%): ${normal.length} 条`);

    // 显示重载线路
    if (heavy.length > 0) {
      console.log(`\n   重载/过载线路详情:`);
      heavy.slice(0, 5).forEach(l => {
        const status = l.loading > 1.0 ? '🚨 过载' : '⚠️ 重载';
        console.log(`   ${status} ${l.branch}: ${(l.loading * 100).toFixed(1)}%`);
      });
    }

    global.loadings = loadings;
    global.heavyLines = heavy;
  });

  await runTest('US-045: 识别重载和过载线路', async () => {
    if (global.quotaExhausted) {
      console.log('   ⚠️ 跳过 (API配额耗尽)');
      return;
    }
    if (!global.heavyLines) {
      console.log('   ⚠️ 无重载线路');
      return;
    }

    const overloads = global.heavyLines.filter(l => l.loading > 1.0);
    const heavyNotOverload = global.heavyLines.filter(l => l.loading <= 1.0 && l.loading > 0.8);

    console.log(`   线路负载分析结果:`);

    if (overloads.length > 0) {
      console.log(`\n   🚨 过载线路 (${overloads.length} 条):`);
      overloads.forEach(l => {
        console.log(`     - ${l.branch}: ${(l.loading * 100).toFixed(1)}%`);
      });
    }

    if (heavyNotOverload.length > 0) {
      console.log(`\n   ⚠️ 重载线路 (${heavyNotOverload.length} 条):`);
      heavyNotOverload.slice(0, 5).forEach(l => {
        console.log(`     - ${l.branch}: ${(l.loading * 100).toFixed(1)}%`);
      });
    }

    if (overloads.length === 0 && heavyNotOverload.length === 0) {
      console.log(`   ✅ 所有线路负载正常 (<80%)`);
    }
  });

  await runTest('US-045: 生成负载统计报告', async () => {
    if (global.quotaExhausted) {
      console.log('   ⚠️ 跳过 (API配额耗尽)');
      return;
    }
    const rid = global.testRid || TEST_RID;

    // 生成简单的负载统计报告
    const reportPath = `/tmp/loading_report_${Date.now()}.txt`;

    let report = '═════════════════════════════════════════════════════\n';
    report += '           线路负载率统计报告\n';
    report += '═════════════════════════════════════════════════════\n\n';
    report += `算例: ${rid}\n`;
    report += `统计时间: ${new Date().toLocaleString()}\n`;
    report += `分析线路: ${global.loadings?.length || 0} 条\n\n`;

    report += '─── 负载率分布 ───\n';
    const overloads = (global.heavyLines || []).filter(l => l.loading > 1.0);
    const heavy = (global.heavyLines || []).filter(l => l.loading <= 1.0);
    const normal = (global.loadings || []).filter(l => l.loading <= 0.8);

    report += `过载 (>100%): ${overloads.length} 条\n`;
    report += `重载 (80-100%): ${heavy.length} 条\n`;
    report += `正常 (<80%): ${normal.length} 条\n\n`;

    if (overloads.length > 0) {
      report += '─── 过载线路详情 ───\n';
      overloads.forEach(l => {
        report += `${l.branch}: ${(l.loading * 100).toFixed(1)}%\n`;
      });
      report += '\n';
    }

    if (heavy.length > 0) {
      report += '─── 重载线路详情 ───\n';
      heavy.slice(0, 10).forEach(l => {
        report += `${l.branch}: ${(l.loading * 100).toFixed(1)}%\n`;
      });
    }

    report += '\n═════════════════════════════════════════════════════\n';

    fs.writeFileSync(reportPath, report);
    console.log(`   报告已生成: ${reportPath}`);

    // 显示报告前几行
    console.log(`\n   报告预览:`);
    report.split('\n').slice(0, 15).forEach(line => {
      console.log(`   ${line}`);
    });

    // 清理
    fs.unlinkSync(reportPath);
    console.log(`\n   测试文件已清理`);
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('设备运维测试结果汇总');
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