#!/usr/bin/env node

/**
 * 示例：测试 CloudPSS API 连接并获取 IEEE3 算例
 *
 * 使用方法:
 *   CLOUDPSS_TOKEN=<your-token> node examples/test-connection.js
 */

require('dotenv').config({ path: '.env' });

const { CloudPSSSkills } = require('../src/index.js');

async function main() {
  console.log('=== CloudPSS Skills - 连接测试 ===\n');

  const skills = new CloudPSSSkills();

  // 测试连接
  console.log('1. 测试 API 连接...');
  const connection = await skills.testConnection();
  console.log('   ' + connection.message);

  if (!connection.success) {
    console.log('\n提示：请检查 .env 文件中的 CLOUDPSS_TOKEN 配置');
    console.log('     Token 获取方式：登录 cloudpss.net -> 用户中心 -> SDK Token');
    return;
  }

  // 获取 IEEE3 算例
  console.log('\n2. 获取 IEEE3 算例...');
  const rid = 'model/CloudPSS/IEEE3';
  console.log(`   RID: ${rid}`);

  const model = await skills.manage.getModel(rid);

  console.log(`   名称：${model.name}`);
  console.log(`   描述：${model.description.substring(0, 60)}...`);
  console.log(`   计算方案数：${model.jobs.length}`);
  console.log(`   参数方案数：${model.configs.length}`);

  // 列出计算方案
  console.log('\n3. 计算方案列表:');
  for (let i = 0; i < model.jobs.length; i++) {
    const job = model.jobs[i];
    console.log(`   [${i}] ${job.name}`);
    console.log(`       类型：${job.rid?.includes('power-flow') ? '潮流计算' : '电磁暂态'}`);
  }

  // 列出参数方案
  console.log('\n4. 参数方案列表:');
  for (let i = 0; i < model.configs.length; i++) {
    const config = model.configs[i];
    console.log(`   [${i}] ${config.name}`);
  }

  console.log('\n=== 测试完成 ===');
  console.log('\n提示：');
  console.log('  - 运行潮流计算：node examples/analyze-results.js');
  console.log('  - 创建新算例：node examples/create-simulation.js');
}

main().catch(console.error);
