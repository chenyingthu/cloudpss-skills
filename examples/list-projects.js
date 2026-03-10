#!/usr/bin/env node

/**
 * 示例：列出所有项目
 *
 * 使用方法:
 *   source ../.env.sh
 *   node examples/list-projects.js
 */

require('dotenv').config({ path: '.env' });

const { CloudPSSSkills } = require('../src/index.js');

async function main() {
  console.log('=== CloudPSS Skills - 项目列表 ===\n');

  // 创建技能实例
  const skills = new CloudPSSSkills();

  // 测试连接
  console.log('1. 测试 API 连接...');
  const connection = await skills.testConnection();
  console.log(connection.message);

  if (!connection.success) {
    console.log('\n提示：请检查 .env 文件中的 CLOUDPSS_TOKEN 配置');
    console.log('     Token 获取方式：登录 cloudpss.net -> 用户中心 -> SDK Token');
    return;
  }

  // 列出项目
  console.log('\n2. 获取项目列表...');
  const projects = await skills.manage.listProjects();

  if (projects.length === 0) {
    console.log('暂无项目');
    return;
  }

  console.log(`\n找到 ${projects.length} 个项目:\n`);

  for (const project of projects) {
    console.log(`┌─────────────────────────────────────────`);
    console.log(`│ RID: ${project.rid}`);
    console.log(`│ 名称：${project.name}`);
    console.log(`│ 描述：${project.description || '-'}`);
    console.log(`└─────────────────────────────────────────`);
    console.log('');
  }

  // 如果有项目，获取第一个项目的详情
  if (projects.length > 0) {
    const firstProject = projects[0];
    console.log(`3. 获取项目 "${firstProject.name}" 的详情...\n`);

    const model = await skills.manage.getModel(firstProject.rid);

    console.log(`  算例 RID: ${model.rid}`);
    console.log(`  参数方案数量：${model.configs?.length || 0}`);
    console.log(`  计算方案数量：${model.jobs?.length || 0}`);

    if (model.jobs && model.jobs.length > 0) {
      console.log('\n  计算方案列表:');
      for (let i = 0; i < model.jobs.length; i++) {
        const job = model.jobs[i];
        console.log(`    [${i}] ${job.name} (${job.rid || 'N/A'})`);
      }
    }

    if (model.configs && model.configs.length > 0) {
      console.log('\n  参数方案列表:');
      for (let i = 0; i < model.configs.length; i++) {
        const config = model.configs[i];
        console.log(`    [${i}] ${config.name}`);
      }
    }
  }

  console.log('\n=== 完成 ===');
}

main().catch(console.error);
