#!/usr/bin/env node
/**
 * E2E Tests for Model Creation Stories
 *
 * US-007: 从零构建简单算例
 * US-009: 批量导入设备参数
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
  console.log('║       E2E Test: Model Creation Stories                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== US-007: 从零构建简单算例 ==========
  console.log('\n📦 US-007: 从零构建简单算例');

  await runTest('US-007: 创建空白算例', async () => {
    const result = await skills.modelCreation.createBlankModel({
      name: 'E2E测试系统',
      description: '3节点测试系统',
      baseMVA: 100,
      baseKV: 110
    });

    if (!result.success) {
      throw new Error('创建失败');
    }

    console.log(`   算例名称: ${result.model.name}`);
    console.log(`   基准容量: ${result.model.baseMVA} MVA`);
    console.log(`   基准电压: ${result.model.baseKV} kV`);

    global.testModel = result.model;
  });

  await runTest('US-007: 添加母线节点', async () => {
    if (!global.testModel) {
      throw new Error('无测试模型');
    }

    // 添加3个母线
    skills.modelCreation.addBus(global.testModel, {
      name: 'Bus1',
      type: 'Slack',
      voltage: 1.05
    });

    skills.modelCreation.addBus(global.testModel, {
      name: 'Bus2',
      type: 'PV',
      voltage: 1.0
    });

    skills.modelCreation.addBus(global.testModel, {
      name: 'Bus3',
      type: 'PQ',
      voltage: 1.0
    });

    const busCount = Object.keys(global.testModel.components).filter(k =>
      global.testModel.components[k].definition === 'Bus'
    ).length;

    console.log(`   添加母线: ${busCount} 个`);
  });

  await runTest('US-007: 添加发电机', async () => {
    if (!global.testModel) {
      throw new Error('无测试模型');
    }

    skills.modelCreation.addGenerator(global.testModel, {
      name: 'Gen1',
      bus: 'bus_1',
      P: 100,
      Q: 20,
      Qmax: 50,
      Qmin: -20
    });

    console.log(`   添加发电机: Gen1 (100 MW)`);
  });

  await runTest('US-007: 添加负荷', async () => {
    if (!global.testModel) {
      throw new Error('无测试模型');
    }

    skills.modelCreation.addLoad(global.testModel, {
      name: 'Load2',
      bus: 'bus_2',
      P: 50,
      Q: 10
    });

    skills.modelCreation.addLoad(global.testModel, {
      name: 'Load3',
      bus: 'bus_3',
      P: 50,
      Q: 10
    });

    console.log(`   添加负荷: Load2, Load3`);
  });

  await runTest('US-007: 添加线路', async () => {
    if (!global.testModel) {
      throw new Error('无测试模型');
    }

    skills.modelCreation.addLine(global.testModel, {
      name: 'Line1-2',
      from: 'bus_1',
      to: 'bus_2',
      R: 0.01,
      X: 0.1,
      rating: 200
    });

    skills.modelCreation.addLine(global.testModel, {
      name: 'Line2-3',
      from: 'bus_2',
      to: 'bus_3',
      R: 0.01,
      X: 0.1,
      rating: 200
    });

    console.log(`   添加线路: Line1-2, Line2-3`);
  });

  await runTest('US-007: 验证模型完整性', async () => {
    if (!global.testModel) {
      throw new Error('无测试模型');
    }

    const validation = skills.modelCreation.validateModel(global.testModel);

    console.log(`   验证结果: ${validation.valid ? '通过' : '存在问题'}`);
    console.log(`   母线: ${validation.summary.buses}`);
    console.log(`   发电机: ${validation.summary.generators}`);
    console.log(`   负荷: ${validation.summary.loads}`);
    console.log(`   线路: ${validation.summary.lines}`);

    if (validation.issues.length > 0) {
      console.log(`   问题: ${validation.issues.map(i => i.message).join(', ')}`);
    }
  });

  // ========== US-009: 批量导入设备参数 ==========
  console.log('\n📦 US-009: 批量导入设备参数');

  await runTest('US-009: 导出参数模板', async () => {
    const rid = TEST_RID;
    const outputPath = '/tmp/line_params_template.csv';

    const result = await skills.modelCreation.exportTemplate(rid, 'line', outputPath);

    if (!result.success) {
      throw new Error('导出失败');
    }

    console.log(`   模板文件: ${result.file}`);
    console.log(`   设备数量: ${result.count}`);

    global.templatePath = outputPath;
  });

  await runTest('US-009: 创建测试参数文件', async () => {
    // 创建一个简单的CSV测试文件
    const testCSV = `name,R,X,rating
TLine_3p-15,0.02,0.15,500
TLine_3p-16,0.025,0.18,500
TLine_3p-17,0.018,0.12,400`;

    const testPath = '/tmp/test_import_params.csv';
    fs.writeFileSync(testPath, testCSV);

    console.log(`   测试文件: ${testPath}`);
    global.importFilePath = testPath;
  });

  await runTest('US-009: 批量导入参数', async () => {
    const rid = TEST_RID;

    const result = await skills.modelCreation.importParameters(
      rid,
      global.importFilePath,
      {
        type: 'line',
        matchBy: 'name',
        update: false,
        reportOnly: true  // 仅报告，不实际更新
      }
    );

    if (!result.success) {
      throw new Error('导入失败');
    }

    console.log(`   总记录数: ${result.results.total}`);
    console.log(`   匹配成功: ${result.results.matched}`);
    console.log(`   未匹配: ${result.results.unmatched.length}`);
    console.log(`   消息: ${result.message}`);
  });

  await runTest('US-009: 测试JSON格式导入', async () => {
    const rid = TEST_RID;

    // 创建JSON测试文件
    const testJSON = [
      { name: 'TLine_3p-15', R: 0.02, X: 0.15 },
      { name: 'TLine_3p-16', R: 0.025, X: 0.18 }
    ];

    const jsonPath = '/tmp/test_import_params.json';
    fs.writeFileSync(jsonPath, JSON.stringify(testJSON, null, 2));

    const result = await skills.modelCreation.importParameters(
      rid,
      jsonPath,
      { type: 'line', reportOnly: true }
    );

    console.log(`   JSON导入: ${result.results.matched}/${result.results.total} 匹配`);
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('模型创建测试结果汇总');
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