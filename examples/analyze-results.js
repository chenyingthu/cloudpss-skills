#!/usr/bin/env node

/**
 * 示例：运行仿真并分析结果
 *
 * 使用方法:
 *   source ../.env.sh
 *   node examples/analyze-results.js
 */

require('dotenv').config({ path: '.env' });

const { CloudPSSSkills } = require('../src/index.js');

async function main() {
  console.log('=== CloudPSS Skills - 运行仿真并分析结果 ===\n');

  const skills = new CloudPSSSkills();

  // 测试连接
  console.log('1. 测试 API 连接...');
  const connection = await skills.testConnection();
  console.log(connection.message);

  if (!connection.success) {
    return;
  }

  // 使用示例算例
  const modelRid = 'model/CloudPSS/IEEE3';
  console.log(`\n2. 获取算例：${modelRid}`);

  try {
    const model = await skills.manage.getModel(modelRid);
    console.log(`   名称：${model.name}`);
    console.log(`   计算方案数：${model.jobs.length}`);
    console.log(`   参数方案数：${model.configs.length}`);

    // 运行潮流计算
    console.log('\n3. 运行潮流计算...');
    const jobIndex = 0; // 使用第一个计算方案
    const configIndex = 0; // 使用第一个参数方案

    const runner = await skills.client.runSimulation(modelRid, jobIndex, configIndex);
    const jobId = runner.job_id;

    console.log(`   任务 ID: ${jobId}`);
    console.log(`   状态：${runner.status}`);

    // 等待完成
    console.log('\n4. 等待计算完成...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 最多等待 60 秒

    while (!completed && attempts < maxAttempts) {
      completed = await skills.client.waitForCompletion(jobId, 5);
      attempts++;

      if (attempts % 5 === 0) {
        const logs = await skills.client.getLogs(jobId);
        if (logs && logs.length > 0) {
          console.log(`   日志：${logs[logs.length - 1]}`);
        }
      }
    }

    if (!completed) {
      console.log('   ✗ 计算超时');
      return;
    }

    console.log('   ✓ 计算完成');

    // 获取潮流结果
    console.log('\n5. 获取潮流结果...');
    const result = await skills.client.getPowerFlowResults(jobId);

    if (result.buses && result.buses.length > 0) {
      console.log(`\n   节点电压表 (${result.buses.length} 个节点):`);
      console.log('   ┌──────────────┬────────────┬────────────┐');
      console.log('   │ 节点名称     │ 电压 (pu)   │ 相角 (deg)  │');
      console.log('   ├──────────────┼────────────┼────────────┤');

      for (const bus of result.buses.slice(0, 10)) { // 只显示前 10 个
        console.log(`   │ ${(bus.Bus || bus.id || '').toString().padEnd(12)} │ ${(bus.Vm || 0).toFixed(4).padStart(10)} │ ${(bus.Va || 0).toFixed(2).padStart(10)} │`);
      }

      if (result.buses.length > 10) {
        console.log(`   │ ... (还有 ${result.buses.length - 10} 个节点)`);
      }

      console.log('   └──────────────┴────────────┴────────────┘');
    }

    if (result.branches && result.branches.length > 0) {
      console.log(`\n   支路功率表 (${result.branches.length} 个支路):`);
      console.log('   ┌──────────────┬────────────┬────────────┬────────────┐');
      console.log('   │ 支路名称     │ Pij (MW)   │ Qij (MVar) │ 损耗 (MW)  │');
      console.log('   ├──────────────┼────────────┼────────────┼────────────┤');

      for (const branch of result.branches.slice(0, 10)) { // 只显示前 10 个
        console.log(`   │ ${(branch.Branch || branch.id || '').toString().padEnd(12)} │ ${(branch.Pij || 0).toFixed(2).padStart(10)} │ ${(branch.Qij || 0).toFixed(2).padStart(10)} │ ${(branch.Ploss || 0).toFixed(2).padStart(10)} │`);
      }

      if (result.branches.length > 10) {
        console.log(`   │ ... (还有 ${result.branches.length - 10} 个支路)`);
      }

      console.log('   └──────────────┴────────────┴────────────┴────────────┘');
    }

    // 分析结果
    console.log('\n6. 分析潮流结果...');
    const analysis = await skills.analyze.analyzePowerFlow(jobId);

    console.log('\n   电压分析:');
    console.log(`     最低电压：${analysis.metrics.voltage?.min}`);
    console.log(`     最高电压：${analysis.metrics.voltage?.max}`);
    console.log(`     平均电压：${analysis.metrics.voltage?.avg}`);
    console.log(`     状态：${analysis.metrics.voltage?.status}`);

    if (analysis.metrics.voltage?.violations && analysis.metrics.voltage.violations.length > 0) {
      console.log('\n   电压越限:');
      for (const v of analysis.metrics.voltage.violations) {
        console.log(`     - ${v.busName}: ${v.voltage.toFixed(4)} pu (${v.issue})`);
      }
    }

    // 生成报告
    console.log('\n7. 生成分析报告...');
    const report = await skills.report.generate({
      jobId,
      type: 'power_flow',
      format: 'markdown'
    });

    console.log('\n   报告预览 (前 500 字符):');
    console.log('   ┌─────────────────────────────────────────');
    console.log(`   │ ${report.content?.substring(0, 500).replace(/\n/g, '\n   │ ')}`);
    console.log('   └─────────────────────────────────────────');

  } catch (error) {
    console.error('\n✗ 操作失败:', error.message);
    console.error('  堆栈:', error.stack);
  }

  console.log('\n=== 完成 ===');
}

main().catch(console.error);
