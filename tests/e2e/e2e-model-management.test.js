#!/usr/bin/env node
/**
 * E2E Tests for Model Management Stories
 *
 * US-001: 从模板创建新算例
 * US-002: 修改发电机参数
 * US-003: 调整负荷水平
 * US-006: 变压器参数更新
 * US-010: 算例导出与备份
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
  console.log('║       E2E Test: Model Management Stories                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const skills = new CloudPSSSkills();

  // ========== US-001: 从模板创建新算例 ==========
  console.log('\n📦 US-001: 从模板创建新算例');

  await runTest('US-001: 搜索IEEE标准算例', async () => {
    const models = await skills.modelManagement.searchModels({
      keyword: 'IEEE',
      pageSize: 20
    });

    if (!models.results || models.results.length === 0) {
      throw new Error('未找到IEEE标准算例');
    }

    console.log(`   找到 ${models.results.length} 个IEEE相关算例`);

    const ieee39 = models.results.find(m => m.rid.includes('IEEE39') || m.rid.includes('39'));
    if (!ieee39) {
      throw new Error('未找到IEEE39节点系统');
    }

    console.log(`   IEEE39算例: ${ieee39.name} (${ieee39.rid})`);
    global.testRid = ieee39.rid;
  });

  await runTest('US-001: 获取算例详细信息', async () => {
    const rid = global.testRid || TEST_RID;
    const info = await skills.modelManagement.getModelInfo(rid);

    if (!info.rid) throw new Error('未获取到算例RID');
    if (!info.name) throw new Error('未获取到算例名称');
    if (!info.jobs || info.jobs.count === 0) throw new Error('算例没有计算方案');

    console.log(`   算例名称: ${info.name}`);
    console.log(`   计算方案: ${info.jobs.count} 个`);
    console.log(`   参数方案: ${info.configs.count} 个`);

    global.modelInfo = info;
  });

  // ========== US-002: 修改发电机参数 ==========
  console.log('\n📦 US-002: 修改发电机参数');

  await runTest('US-002: 列出所有发电机元件', async () => {
    const rid = global.testRid || TEST_RID;
    const components = await skills.client.getAllComponents(rid);

    // 筛选发电机类型元件
    const generators = Object.entries(components || {})
      .filter(([key, comp]) => {
        const def = (comp.definition || '').toLowerCase();
        const label = (comp.label || '').toLowerCase();
        return def.includes('syncgen') || def.includes('generator') ||
               label.includes('发电机') || label.includes('generator');
      })
      .map(([key, comp]) => ({
        key,
        label: comp.label,
        definition: comp.definition
      }));

    if (generators.length === 0) {
      throw new Error('未找到发电机元件');
    }

    console.log(`   找到 ${generators.length} 台发电机`);
    generators.slice(0, 3).forEach(g => {
      console.log(`   - ${g.label} (${g.key})`);
    });

    global.generators = generators;
  });

  await runTest('US-002: 获取发电机详细参数', async () => {
    if (!global.generators || global.generators.length === 0) {
      throw new Error('没有可用的发电机');
    }

    const gen = global.generators[0];
    const rid = global.testRid || TEST_RID;
    const components = await skills.client.getAllComponents(rid);
    const genComp = components[gen.key];

    if (!genComp) throw new Error(`未找到元件: ${gen.key}`);
    if (!genComp.args) throw new Error('元件没有参数');

    console.log(`   发电机: ${gen.label}`);
    console.log(`   参数: P=${genComp.args.P || genComp.args.p || 'N/A'}, V=${genComp.args.V || genComp.args.v || 'N/A'}`);

    global.genParams = genComp.args;
  });

  // ========== US-003: 调整负荷水平 ==========
  console.log('\n📦 US-003: 调整负荷水平');

  await runTest('US-003: 识别所有负荷元件', async () => {
    const rid = global.testRid || TEST_RID;
    const components = await skills.client.getAllComponents(rid);

    // 筛选负荷类型元件
    const loads = Object.entries(components || {})
      .filter(([key, comp]) => {
        const def = (comp.definition || '').toLowerCase();
        const label = (comp.label || '').toLowerCase();
        return def.includes('load') || def.includes('pq') ||
               label.includes('负荷') || label.includes('load');
      })
      .map(([key, comp]) => ({
        key,
        label: comp.label,
        args: comp.args
      }));

    if (loads.length === 0) {
      throw new Error('未找到负荷元件');
    }

    console.log(`   找到 ${loads.length} 个负荷`);

    global.loads = loads;
  });

  await runTest('US-003: 计算负荷总量', async () => {
    if (!global.loads || global.loads.length === 0) {
      throw new Error('没有可用的负荷');
    }

    let totalP = 0;
    let totalQ = 0;

    for (const load of global.loads) {
      const p = parseFloat(load.args?.P || load.args?.p || 0);
      const q = parseFloat(load.args?.Q || load.args?.q || 0);
      totalP += p;
      totalQ += q;
    }

    console.log(`   总有功负荷: ${totalP.toFixed(2)} MW`);
    console.log(`   总无功负荷: ${totalQ.toFixed(2)} MVar`);
    console.log(`   负荷数量: ${global.loads.length}`);

    if (totalP === 0) {
      throw new Error('总有功负荷为0，可能参数提取有问题');
    }
  });

  // ========== US-006: 变压器参数更新 ==========
  console.log('\n📦 US-006: 变压器参数更新');

  await runTest('US-006: 列出所有变压器', async () => {
    const rid = global.testRid || TEST_RID;
    const components = await skills.client.getAllComponents(rid);

    const transformers = Object.entries(components || {})
      .filter(([key, comp]) => {
        const def = (comp.definition || '').toLowerCase();
        const label = (comp.label || '').toLowerCase();
        return def.includes('transformer') || def.includes('xfmr') ||
               label.includes('变压器') || label.includes('transformer');
      })
      .map(([key, comp]) => ({
        key,
        label: comp.label,
        definition: comp.definition
      }));

    if (transformers.length === 0) {
      console.log('   ⚠️ 未找到变压器元件，跳过测试');
      return;
    }

    console.log(`   找到 ${transformers.length} 台变压器`);
    transformers.slice(0, 3).forEach(t => {
      console.log(`   - ${t.label} (${t.key})`);
    });

    global.transformers = transformers;
  });

  await runTest('US-006: 获取变压器参数', async () => {
    if (!global.transformers || global.transformers.length === 0) {
      console.log('   ⚠️ 无变压器，跳过');
      return;
    }

    const xfmr = global.transformers[0];
    const rid = global.testRid || TEST_RID;
    const components = await skills.client.getAllComponents(rid);
    const xfmrComp = components[xfmr.key];

    console.log(`   变压器: ${xfmr.label}`);

    // 显示关键参数
    const args = xfmrComp.args || {};
    if (args.Rk) console.log(`   短路电阻: ${args.Rk}`);
    if (args.Xk) console.log(`   短路电抗: ${args.Xk}`);
    if (args.Sn) console.log(`   额定容量: ${args.Sn}`);
    if (args.Vn1) console.log(`   高压侧电压: ${args.Vn1}`);
    if (args.Vn2) console.log(`   低压侧电压: ${args.Vn2}`);
  });

  // ========== US-010: 算例导出与备份 ==========
  console.log('\n📦 US-010: 算例导出与备份');

  await runTest('US-010: 导出算例到文件', async () => {
    const rid = global.testRid || TEST_RID;
    const exportPath = `/tmp/test_export_${Date.now()}.yaml.gz`;

    const result = await skills.modelManagement.exportModel(rid, exportPath, {
      format: 'yaml',
      compress: 'gzip'
    });

    if (!result.success) {
      throw new Error('导出失败');
    }

    console.log(`   导出路径: ${result.filePath}`);
    console.log(`   文件大小: ${result.fileSizeFormatted}`);
    console.log(`   导出耗时: ${result.exportTime}ms`);

    // 验证文件存在
    if (!fs.existsSync(exportPath)) {
      throw new Error('导出文件不存在');
    }

    global.exportPath = exportPath;
    global.exportResult = result;
  });

  await runTest('US-010: 验证导出文件完整性', async () => {
    if (!global.exportPath) {
      throw new Error('没有导出文件');
    }

    const stats = fs.statSync(global.exportPath);

    if (stats.size === 0) {
      throw new Error('导出文件为空');
    }

    console.log(`   文件大小: ${stats.size} bytes`);
    console.log(`   修改时间: ${stats.mtime}`);

    // 清理测试文件
    fs.unlinkSync(global.exportPath);
    console.log('   测试文件已清理');
  });

  // ========== Summary ==========
  console.log('\n' + '═'.repeat(70));
  console.log('测试结果汇总');
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