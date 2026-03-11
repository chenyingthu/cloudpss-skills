#!/usr/bin/env node
/**
 * 综合验证测试 - 测试认知技能在多个算例上的表现
 *
 * 测试技能：
 * 1. listProjects - 列出算例
 * 2. model-overview - 算例概览
 * 3. component-analysis - 元件分析
 */

const path = require('path');
const fs = require('fs');
const CloudPSSClient = require('../src/api/client');
const ModelOverviewSkill = require('../src/skills/model-overview');
const ComponentAnalysisSkill = require('../src/skills/analyze-component');

// 加载 CloudPSS Token
const tokenPath = path.join(__dirname, '../../.cloudpss_token');
if (fs.existsSync(tokenPath)) {
  const token = fs.readFileSync(tokenPath, 'utf-8').trim();
  process.env.CLOUDPSS_TOKEN = token;
  console.log('[Test] Token loaded from:', tokenPath);
} else {
  console.error('[Test] Token file not found:', tokenPath);
}

async function testModel(client, rid, name) {
  console.log('\n' + '='.repeat(70));
  console.log(`📊 测试算例: ${name}`);
  console.log(`   RID: ${rid}`);
  console.log('='.repeat(70));

  try {
    // 1. 导出算例文件
    console.log('\n📤 步骤 1: 导出算例文件...');
    const tempFile = `/tmp/${rid.replace(/\//g, '_')}.yaml.gz`;
    await client.dumpModel(rid, tempFile);
    console.log(`   ✅ 已导出到: ${tempFile}`);

    // 2. 算例概览
    console.log('\n📋 步骤 2: 算例概览分析...');
    const overviewSkill = new ModelOverviewSkill(client);
    const modelData = overviewSkill.loadFromLocalFile(tempFile);
    const overview = overviewSkill.getSummary(modelData);

    console.log('\n   ─────────────────────────────────────────');
    console.log('   📌 基本信息');
    console.log('   ─────────────────────────────────────────');
    console.log(`   名称: ${overview.basicInfo?.name || '未知'}`);
    console.log(`   描述: ${(overview.basicInfo?.description || '无描述').substring(0, 60)}...`);
    console.log(`   版本: ${overview.basicInfo?.revision?.version || '未知'}`);

    console.log('\n   ─────────────────────────────────────────');
    console.log('   📊 统计信息');
    console.log('   ─────────────────────────────────────────');
    const stats = overview.statistics || {};
    console.log(`   总元件数: ${stats.totalComponents || 0}`);
    console.log(`   参数方案: ${stats.configCount || 0}`);
    console.log(`   计算方案: ${stats.jobCount || 0}`);

    // 3. 元件分析
    console.log('\n🔧 步骤 3: 元件分类分析...');
    const componentSkill = new ComponentAnalysisSkill(client);
    const componentData = componentSkill.loadFromLocalFile(tempFile);
    const classified = componentSkill.classifyComponents(componentData.all_components || componentData.components || []);

    console.log('\n   ─────────────────────────────────────────');
    console.log('   🏷️ 元件分类统计');
    console.log('   ─────────────────────────────────────────');

    const categories = Object.entries(classified)
      .filter(([key, components]) => components && components.length > 0)
      .sort((a, b) => b[1].length - a[1].length);

    let totalClassified = 0;
    for (const [category, components] of categories) {
      totalClassified += components.length;
      console.log(`   ${category.padEnd(15)} : ${components.length.toString().padStart(3)} 个`);
    }

    console.log('\n   ─────────────────────────────────────────');
    console.log(`   📈 分类覆盖率: ${totalClassified}/${stats.totalComponents || 0} (${((totalClassified / (stats.totalComponents || 1)) * 100).toFixed(1)}%)`);
    console.log('   ─────────────────────────────────────────');

    return { success: true, overview, classified };
  } catch (error) {
    console.error(`\n❌ 测试失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         CloudPSS 认知技能综合验证测试                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // 调试: 显示 token 是否正确加载
  console.log('\n[Debug] CLOUDPSS_TOKEN:', process.env.CLOUDPSS_TOKEN ? `${process.env.CLOUDPSS_TOKEN.substring(0, 20)}...` : 'NOT SET');

  const client = new CloudPSSClient();
  console.log('[Debug] Client token:', client.token ? `${client.token.substring(0, 20)}...` : 'NOT SET');
  console.log('[Debug] Bridge token:', client.bridge.token ? `${client.bridge.token.substring(0, 20)}...` : 'NOT SET');

  // 获取项目列表
  const projects = await client.listProjects();
  console.log(`\n📂 发现 ${projects.length} 个算例`);

  // 测试结果汇总
  const results = [];

  // 测试每个算例
  for (const project of projects) {
    const result = await testModel(client, project.rid, project.name);
    results.push({
      rid: project.rid,
      name: project.name,
      ...result
    });
  }

  // 汇总报告
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      测试汇总报告                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  let successCount = 0;
  for (const r of results) {
    const status = r.success ? '✅ 通过' : '❌ 失败';
    console.log(`${status} | ${r.name}`);
    if (r.success) successCount++;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`总计: ${successCount}/${results.length} 个算例测试通过`);
  console.log('='.repeat(70));

  // 清理临时文件
  console.log('\n🧹 清理临时文件...');
  for (const project of projects) {
    const tempFile = `/tmp/${project.rid.replace(/\//g, '_')}.yaml.gz`;
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
  console.log('   ✅ 清理完成');
}

main().catch(console.error);