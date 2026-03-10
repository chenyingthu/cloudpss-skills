#!/usr/bin/env node

/**
 * P0 Skills 集成测试
 *
 * 测试所有 P0 技能：
 * 1. 潮流分析 (已有)
 * 2. 谐波分析
 * 3. N-1 扫描
 * 4. 批量仿真
 */

require('dotenv').config();
const { CloudPSSSkills } = require('../src/index');

const config = {
  token: process.env.CLOUDPSS_TOKEN,
  apiURL: process.env.CLOUDPSS_API_URL || 'https://cloudpss.net/'
};

const PROJECT_RID = 'model/CloudPSS/IEEE3';

async function main() {
  console.log('='.repeat(70));
  console.log('              CloudPSS Skills P0 集成测试');
  console.log('='.repeat(70));

  const skills = new CloudPSSSkills(config);
  const results = {};

  // =====================================================
  // Test 1: 基础连接
  // =====================================================
  console.log('\n【测试 1】基础连接测试');
  try {
    const conn = await skills.testConnection();
    console.log(conn.success ? '✓ 连接成功' : '✗ 连接失败');
    results.connection = conn.success;
  } catch (e) {
    console.log('✗ 连接测试异常:', e.message);
    results.connection = false;
  }

  // =====================================================
  // Test 2: 潮流计算与分析
  // =====================================================
  console.log('\n【测试 2】潮流计算与分析');
  try {
    const model = await skills.manage.getModel(PROJECT_RID);
    console.log(`  算例：${model.name}`);

    const runner = await skills.client.runSimulation(PROJECT_RID, 0, 0);
    const jobId = runner.job_id;
    console.log(`  任务 ID: ${jobId}`);

    // 等待完成
    let attempts = 0;
    while (!runner.status() && attempts < 30) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }

    // 获取结果
    const pfResult = await skills.client.getPowerFlowResults(jobId);
    console.log(`  节点数：${pfResult.buses?.length || 0}`);
    console.log(`  支路数：${pfResult.branches?.length || 0}`);

    // 电压分析
    const analysis = await skills.analyze.analyzePowerFlow(jobId);
    console.log(`  电压范围：${analysis.metrics.voltage?.min} - ${analysis.metrics.voltage?.max} pu`);
    console.log(`  电压状态：${analysis.metrics.voltage?.status}`);

    results.powerFlow = {
      success: true,
      buses: pfResult.buses?.length || 0,
      branches: pfResult.branches?.length || 0,
      voltageStatus: analysis.metrics.voltage?.status
    };
  } catch (e) {
    console.log('✗ 潮流计算失败:', e.message);
    results.powerFlow = { success: false, error: e.message };
  }

  // =====================================================
  // Test 3: N-1 扫描 (线路开断)
  // =====================================================
  console.log('\n【测试 3】N-1 扫描测试');
  try {
    const n1Result = await skills.n1scan.scan(PROJECT_RID, { jobType: 'powerFlow' });
    console.log(`  扫描类型：${n1Result.scanType}`);
    console.log(`  扫描场景数：${n1Result.scenarios?.length || 0}`);
    console.log(`  发现问题数：${n1Result.issuesFound?.length || 0}`);

    results.n1scan = {
      success: true,
      scanType: n1Result.scanType,
      scenarios: n1Result.scenarios?.length || 0,
      issuesFound: n1Result.issuesFound?.length || 0
    };
  } catch (e) {
    console.log('✗ N-1 扫描失败:', e.message);
    results.n1scan = { success: false, error: e.message };
  }

  // =====================================================
  // Test 4: 谐波分析 (使用 EMT 结果)
  // =====================================================
  console.log('\n【测试 4】谐波分析测试');
  try {
    // 首先尝试获取 EMT 结果
    const model = await skills.manage.getModel(PROJECT_RID);
    console.log(`  算例：${model.name}`);

    // 查找 EMT 计算方案
    const emtJobIndex = model.jobs.findIndex(j => j.jobType === 'emtp');
    if (emtJobIndex >= 0) {
      console.log(`  发现 EMT 计算方案，索引：${emtJobIndex}`);

      const runner = await skills.client.runSimulation(PROJECT_RID, emtJobIndex, 0);
      const jobId = runner.job_id;
      console.log(`  任务 ID: ${jobId}`);

      // 等待完成
      let attempts = 0;
      while (!runner.status() && attempts < 60) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
      }

      // 获取电磁暂态结果
      try {
        const emtResult = await skills.client.getEMTResults(jobId, 0);
        console.log(`  通道数：${emtResult.channels?.length || 0}`);

        if (emtResult.channels && emtResult.channels.length > 0) {
          // 分析第一个通道的谐波
          const channel = emtResult.channels[0];
          console.log(`  分析通道：${channel}`);

          // 谐波分析
          const harmonicResult = await skills.harmonic.analyzeHarmonic(jobId, channel);
          console.log(`  基波频率：${harmonicResult.fundamental?.frequency} Hz`);
          console.log(`  基波幅值：${harmonicResult.fundamental?.amplitude}`);
          console.log(`  THD: ${(harmonicResult.thd * 100).toFixed(2)}%`);

          results.harmonic = {
            success: true,
            channel: channel,
            thd: harmonicResult.thd
          };
        }
      } catch (e) {
        console.log(`  谐波分析异常 (可能无 EMT 数据): ${e.message}`);
        results.harmonic = { success: false, error: '无 EMT 数据或分析失败' };
      }
    } else {
      console.log('  ⚠ 该算例无 EMT 计算方案，使用模拟数据测试');
      // 使用模拟数据测试
      const mockData = {
        t: Array.from({length: 1000}, (_, i) => i / 10000),
        y: Array.from({length: 1000}, (_, i) => Math.sin(2 * Math.PI * 50 * i / 10000) + 0.05 * Math.sin(2 * Math.PI * 150 * i / 10000))
      };

      const thdResult = await skills.harmonic.calculateTHD(mockData);
      console.log(`  THD (模拟): ${(thdResult.thd * 100).toFixed(2)}%`);

      results.harmonic = {
        success: true,
        simulated: true,
        thd: thdResult.thd
      };
    }
  } catch (e) {
    console.log('✗ 谐波分析失败:', e.message);
    results.harmonic = { success: false, error: e.message };
  }

  // =====================================================
  // Test 5: 批量仿真 (单场景串行测试)
  // =====================================================
  console.log('\n【测试 5】批量仿真测试 (单场景)');
  try {
    // 单场景测试
    const scenarios = [
      { name: 'Base_Case', config: {}, components: [] }
    ];

    const batchResult = await skills.batch.runBatch(scenarios, {
      rid: PROJECT_RID,
      maxParallel: 1,  // 串行执行避免冲突
      jobType: 'powerFlow'
    });

    console.log(`  场景数：${batchResult.results?.length || 0}`);
    console.log(`  成功率：${batchResult.aggregated?.success_rate || 0}%`);

    results.batch = {
      success: true,
      scenarios: batchResult.results?.length || 0,
      successRate: batchResult.aggregated?.success_rate || 0
    };
  } catch (e) {
    console.log('✗ 批量仿真失败:', e.message);
    results.batch = { success: false, error: e.message };
  }

  // =====================================================
  // 汇总结果
  // =====================================================
  console.log('\n' + '='.repeat(70));
  console.log('                      测试结果汇总');
  console.log('='.repeat(70));

  const tests = [
    { name: '基础连接', result: results.connection },
    { name: '潮流计算', result: results.powerFlow?.success },
    { name: 'N-1 扫描', result: results.n1scan?.success },
    { name: '谐波分析', result: results.harmonic?.success },
    { name: '批量仿真', result: results.batch?.success }
  ];

  let passed = 0;
  for (const test of tests) {
    const icon = test.result ? '✓' : '✗';
    console.log(`${icon} ${test.name}: ${test.result ? 'PASS' : 'FAIL'}`);
    if (test.result) passed++;
  }

  console.log('-'.repeat(70));
  console.log(`总计：${passed}/${tests.length} 通过`);
  console.log('='.repeat(70));

  return results;
}

main().catch(console.error);
