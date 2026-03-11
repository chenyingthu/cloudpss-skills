#!/usr/bin/env node
/**
 * E2E Tests for Advanced Reporting Stories
 *
 * US-036: 多方案比选分析
 * US-040: PPT素材生成
 * US-041: 技术规范文档
 * US-056: 碳排放分析
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
  console.log('║       E2E Test: Advanced Reporting Stories                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== US-036: 多方案比选分析 ==========
  console.log('\n📦 US-036: 多方案比选分析');

  await runTest('US-036: 定义比选方案', async () => {
    global.schemes = [
      { rid: TEST_RID, name: '基础方案', description: '原始IEEE39系统' },
      { rid: TEST_RID, name: '方案A', description: '模拟改进方案A' },
      { rid: TEST_RID, name: '方案B', description: '模拟改进方案B' }
    ];

    console.log(`   方案数量: ${global.schemes.length}`);
    global.schemes.forEach((s, i) => {
      console.log(`     ${i + 1}. ${s.name}: ${s.description}`);
    });
  });

  await runTest('US-036: 执行比选分析', async () => {
    const result = await skills.advancedReporting.compareSchemes(global.schemes, {
      criteria: ['powerFlow', 'n1', 'loss', 'voltage'],
      weights: { powerFlow: 0.3, n1: 0.3, loss: 0.2, voltage: 0.2 }
    });

    if (!result.success) {
      throw new Error('比选分析失败');
    }

    console.log(`   分析方案数: ${result.results.length}`);

    // 显示评分结果
    console.log(`\n   方案评分:`);
    result.results.forEach((r, i) => {
      console.log(`     ${i + 1}. ${r.name}: ${r.scores.total} 分`);
    });

    global.compareResult = result;
  });

  await runTest('US-036: 查看对比表', async () => {
    if (!global.compareResult) {
      throw new Error('无比选结果');
    }

    console.log(`\n   对比表:`);
    const table = global.compareResult.comparisonTable;

    console.log(`   ${table.headers.join(' | ')}`);
    console.log(`   ${table.headers.map(() => '---').join(' | ')}`);

    table.rows.forEach(row => {
      console.log(`   ${row.join(' | ')}`);
    });
  });

  await runTest('US-036: 查看推荐方案', async () => {
    if (!global.compareResult) {
      throw new Error('无比选结果');
    }

    const rec = global.compareResult.recommendation;

    console.log(`\n   推荐方案: ${rec.best}`);
    console.log(`   推荐理由: ${rec.reason}`);

    if (rec.alternatives.length > 0) {
      console.log(`   备选方案: ${rec.alternatives.join(', ')}`);
    }
  });

  // ========== US-040: PPT素材生成 ==========
  console.log('\n📦 US-040: PPT素材生成');

  await runTest('US-040: 准备PPT数据', async () => {
    global.pptData = {
      modelName: 'IEEE39测试系统',
      analysisType: '综合安全分析',
      keyFindings: [
        { title: '潮流收敛', value: '是', status: 'normal' },
        { title: 'N-1严重场景', value: '3个', status: 'warning' },
        { title: '最低电压', value: '0.9365 p.u.', status: 'warning' },
        { title: '网损', value: '36.4 MW', status: 'normal' }
      ],
      charts: [
        { title: '电压分布', type: 'bar', data: { labels: ['Bus1', 'Bus2', 'Bus3'], values: [1.0, 0.98, 0.95] } }
      ],
      conclusions: [
        '系统潮流收敛，运行状态正常',
        '部分节点电压偏低，需关注',
        'N-1扫描发现3个严重场景'
      ],
      recommendations: [
        '建议加强无功补偿',
        '建议关注薄弱线路'
      ]
    };

    console.log(`   数据准备完成`);
  });

  await runTest('US-040: 生成PPT素材', async () => {
    const result = skills.advancedReporting.generatePPTSlides(global.pptData, {
      title: 'IEEE39系统安全分析报告',
      subtitle: 'CloudPSS Skills 自动生成'
    });

    if (!result.success) {
      throw new Error('PPT生成失败');
    }

    console.log(`   幻灯片数量: ${result.slideCount}`);

    console.log(`\n   幻灯片结构:`);
    result.pptContent.slides.forEach((s, i) => {
      console.log(`     ${i + 1}. ${s.type}: ${s.content.title || '无标题'}`);
    });

    global.pptResult = result;
  });

  await runTest('US-040: 导出Markdown格式', async () => {
    if (!global.pptResult) {
      throw new Error('无PPT结果');
    }

    const markdown = global.pptResult.exportFormats.markdown;

    console.log(`   Markdown导出大小: ${markdown.length} 字符`);
    console.log(`   ✅ 导出成功`);
  });

  // ========== US-041: 技术规范文档 ==========
  console.log('\n📦 US-041: 技术规范文档');

  await runTest('US-041: 生成技术规范', async () => {
    const rid = TEST_RID;

    const result = await skills.advancedReporting.generateTechnicalSpec(rid, {
      includeParameters: true,
      includeTopology: true,
      format: 'markdown'
    });

    if (!result.success) {
      throw new Error('文档生成失败');
    }

    console.log(`   文档标题: ${result.document.title}`);
    console.log(`   版本: ${result.document.version}`);
    console.log(`   日期: ${result.document.date}`);

    console.log(`\n   文档章节:`);
    result.document.sections.forEach((s, i) => {
      console.log(`     ${i + 1}. ${s.title}`);
    });

    global.specResult = result;
  });

  await runTest('US-041: 查看系统规模', async () => {
    if (!global.specResult) {
      throw new Error('无文档结果');
    }

    const stats = global.specResult.document.sections.find(s => s.title === '2. 系统规模')?.content;

    if (stats) {
      console.log(`   母线: ${stats.buses}`);
      console.log(`   发电机: ${stats.generators}`);
      console.log(`   负荷: ${stats.loads}`);
      console.log(`   线路: ${stats.lines}`);
      console.log(`   变压器: ${stats.transformers}`);
      console.log(`   总容量: ${Number(stats.totalCapacity || 0).toFixed(2)} MW`);
    }
  });

  await runTest('US-041: 查看设备参数清单', async () => {
    if (!global.specResult) {
      throw new Error('无文档结果');
    }

    const equipment = global.specResult.document.sections.find(s => s.title === '4. 设备参数清单')?.content;

    if (equipment) {
      console.log(`\n   设备参数统计:`);
      console.log(`     发电机: ${equipment.generators?.length || 0} 台`);
      console.log(`     变压器: ${equipment.transformers?.length || 0} 台`);
      console.log(`     线路: ${equipment.lines?.length || 0} 条`);
      console.log(`     负荷: ${equipment.loads?.length || 0} 个`);
    }
  });

  // ========== US-056: 碳排放分析 ==========
  console.log('\n📦 US-056: 碳排放分析');

  await runTest('US-056: 执行碳排放分析', async () => {
    const rid = TEST_RID;

    const result = await skills.advancedReporting.analyzeCarbonEmissions(rid, {
      period: 'annual',
      includeRenewable: true
    });

    if (!result.success) {
      throw new Error('碳排放分析失败');
    }

    console.log(`   总发电量: ${result.summary.totalGeneration_MWh} MWh`);
    console.log(`   总碳排放: ${result.summary.totalEmission_tCO2} tCO2`);
    console.log(`   碳强度: ${result.summary.carbonIntensity_gCO2kWh} gCO2/kWh`);

    global.carbonResult = result;
  });

  await runTest('US-056: 查看各机组排放', async () => {
    if (!global.carbonResult) {
      throw new Error('无碳排放结果');
    }

    console.log(`\n   发电机组碳排放 (前5台):`);
    global.carbonResult.generators.slice(0, 5).forEach((g, i) => {
      console.log(`     ${i + 1}. ${g.name} (${g.type}):`);
      console.log(`        容量: ${g.capacity_MW} MW`);
      console.log(`        年发电量: ${g.annualGeneration_MWh} MWh`);
      console.log(`        年碳排放: ${g.annualEmission_tCO2} tCO2`);
    });
  });

  await runTest('US-056: 查看减排潜力', async () => {
    if (!global.carbonResult) {
      throw new Error('无碳排放结果');
    }

    const abatement = global.carbonResult.abatementPotential;

    console.log(`\n   减排潜力分析:`);
    console.log(`     总减排潜力: ${abatement.totalPotential_tCO2} tCO2`);

    if (abatement.items.length > 0) {
      console.log(`\n   减排建议:`);
      abatement.items.slice(0, 5).forEach((item, i) => {
        console.log(`     ${i + 1}. ${item.generator} (${item.currentType})`);
        console.log(`        潜在减排: ${item.potentialSaving_tCO2} tCO2`);
        console.log(`        建议: ${item.recommendation}`);
      });
    }
  });

  await runTest('US-056: 查看减排建议', async () => {
    if (!global.carbonResult) {
      throw new Error('无碳排放结果');
    }

    const recommendations = global.carbonResult.recommendations;

    if (recommendations.length > 0) {
      console.log(`\n   碳减排建议:`);
      recommendations.forEach((r, i) => {
        console.log(`     ${i + 1}. [${r.priority}] ${r.message}`);
      });
    } else {
      console.log(`   ✅ 碳排放水平良好`);
    }
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('高级报告测试结果汇总');
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