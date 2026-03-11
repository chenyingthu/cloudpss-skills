#!/usr/bin/env node

/**
 * 示例：创建仿真算例
 *
 * 使用方法:
 *   source ../.env.sh
 *   node examples/create-simulation.js
 */

require('dotenv').config({ path: '.env' });

const { CloudPSSSkills } = require('../src/index.js');

async function main() {
  console.log('=== CloudPSS Skills - 创建仿真算例 ===\n');

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

  // 从模板创建算例
  console.log('\n2. 从模板创建算例...');
  console.log('   源算例：model/CloudPSS/IEEE3 (3 机 9 节点系统)');
  console.log('   目标算例：model/MyProject/IEEE3_Copy');

  try {
    const created = await skills.create.simulation({
      sourceRid: 'model/CloudPSS/IEEE3',
      targetRid: 'model/MyProject/IEEE3_Copy',
      name: 'IEEE 3 机 9 节点系统 - 副本',
      description: '从模板复制的测试算例'
    });

    console.log('\n✓ 算例创建成功!');
    console.log(`  RID: ${created.rid}`);
    console.log(`  名称：${created.name}`);
    console.log(`  计算方案数：${created.jobCount}`);
    console.log(`  参数方案数：${created.configCount}`);

    // 获取新算例的详情
    console.log('\n3. 获取新算例详情...');
    const model = await skills.manage.getModel(created.rid);

    console.log('\n  计算方案:');
    for (let i = 0; i < model.jobs.length; i++) {
      const job = model.jobs[i];
      console.log(`    [${i}] ${job.name}`);
    }

    // 添加一个新的计算方案
    console.log('\n4. 创建新的计算方案...');
    const newJob = await skills.create.createJob(created.rid, 'powerFlow', '我的潮流计算方案');
    console.log(`  ✓ 已创建：${newJob.name}`);

    // 保存算例
    console.log('\n5. 保存算例...');
    await skills.create.save(created.rid);
    console.log('  ✓ 已保存');

  } catch (error) {
    console.error('✗ 操作失败:', error.message);
    console.error('  请确保:');
    console.error('  1. CLOUDPSS_TOKEN 配置正确');
    console.error('  2. 源算例 model/CloudPSS/IEEE3 存在且可访问');
    console.error('  3. 有权限在 MyProject 下创建算例');
  }

  console.log('\n=== 完成 ===');
}

main().catch(console.error);
