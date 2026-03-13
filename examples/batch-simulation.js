#!/usr/bin/env node

/**
 * Batch Simulation Example
 *
 * 演示批量仿真技能的使用：
 * - 参数扫描（负荷水平 50%~150%）
 * - 多场景并行执行
 * - 结果汇总分析
 * - 龙卷风图数据输出
 */

require('dotenv').config();
const { CloudPSSSkills } = require('../src/index');

// 配置
const config = {
  token: process.env.CLOUDPSS_TOKEN,  // 统一使用 CLOUDPSS_TOKEN
  apiURL: process.env.CLOUDPSS_API_URL || 'https://cloudpss.net/'
};

// 测试项目 RID（请替换为实际项目）
const PROJECT_RID = process.env.TEST_PROJECT_RID || 'model/CloudPSS/IEEE3';

async function main() {
  console.log('='.repeat(60));
  console.log('CloudPSS 批量仿真技能演示');
  console.log('='.repeat(60));

  const skills = new CloudPSSSkills(config);
  const batchSkill = skills.batch;

  // 测试连接
  console.log('\n测试连接...');
  const connection = await skills.testConnection();
  if (!connection.success) {
    console.log('连接失败:', connection.message);
    return;
  }
  console.log('✓ 连接成功');

  // =====================================================
  // 示例 1: 参数扫描 - 负荷水平 50%~150%
  // =====================================================
  console.log('\n' + '='.repeat(60));
  console.log('示例 1: 参数扫描 - 负荷水平 50%~150%');
  console.log('='.repeat(60));

  const loadLevels = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
  console.log(`扫描参数：load_level = ${loadLevels.join(', ')}`);

  try {
    const sweepResult = await batchSkill.parameterSweep(
      PROJECT_RID,
      'load_level',
      loadLevels,
      {
        maxParallel: 5,
        jobType: 'powerFlow'
      }
    );

    console.log(`\n✓ 参数扫描完成`);
    console.log(`  场景总数：${sweepResult.results.length}`);
    console.log(`  成功率：${sweepResult.aggregated.success_rate}%`);
    console.log(`  总耗时：${(sweepResult.totalExecutionTime / 1000).toFixed(2)}s`);
    console.log(`  平均耗时：${sweepResult.aggregated.avg_execution_time.toFixed(2)}s/场景`);

    // 输出统计汇总
    if (sweepResult.aggregated.statistics) {
      console.log('\n统计汇总:');
      if (sweepResult.aggregated.statistics.voltage) {
        const v = sweepResult.aggregated.statistics.voltage;
        console.log(`  电压 (pu): min=${v.min}, max=${v.max}, avg=${v.avg}`);
      }
      if (sweepResult.aggregated.statistics.power_loss) {
        const p = sweepResult.aggregated.statistics.power_loss;
        console.log(`  网损 (MW): min=${p.min}, max=${p.max}, avg=${p.avg}`);
      }
    }

    // 输出敏感性分析
    if (sweepResult.aggregated.tornado_data?.length > 0) {
      console.log('\n敏感性分析 (Top 5):');
      sweepResult.aggregated.tornado_data.slice(0, 5).forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.scenario}: 电压影响 ${item.voltage_impact.toFixed(4)} (${item.voltage_direction})`);
      });
    }

    // 生成报告
    console.log('\n生成报告...');
    const report = batchSkill.generateReport(sweepResult);
    console.log(report);

  } catch (error) {
    console.error('参数扫描失败:', error.message);
  }

  // =====================================================
  // 示例 2: 多场景批量仿真
  // =====================================================
  console.log('\n' + '='.repeat(60));
  console.log('示例 2: 多场景批量仿真');
  console.log('='.repeat(60));

  const scenarios = [
    {
      name: 'Base_Case',
      config: {},
      components: []
    },
    {
      name: 'Summer_Peak',
      config: {},
      components: [
        { element_id: 'load_1', args: { load: 1.2 } },
        { element_id: 'load_2', args: { load: 1.15 } }
      ]
    },
    {
      name: 'Winter_Light',
      config: {},
      components: [
        { element_id: 'load_1', args: { load: 0.7 } },
        { element_id: 'load_2', args: { load: 0.75 } }
      ]
    },
    {
      name: 'High_Renewable',
      config: {},
      components: [
        { element_id: 'pv_1', args: { p_set: 1.0 } },
        { element_id: 'pv_2', args: { p_set: 0.8 } }
      ]
    },
    {
      name: 'N-1_Line_Outage',
      config: {},
      components: [
        { element_id: 'line_1', args: { open: true } }
      ]
    }
  ];

  console.log(`批量仿真场景数：${scenarios.length}`);
  console.log('场景列表:');
  scenarios.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));

  try {
    const batchResult = await batchSkill.runBatch(scenarios, {
      rid: PROJECT_RID,
      maxParallel: 3,
      jobType: 'powerFlow'
    });

    console.log(`\n✓ 批量仿真完成`);
    console.log(`  成功场景：${batchResult.aggregated.success_count}`);
    console.log(`  失败场景：${batchResult.aggregated.failed_count}`);
    console.log(`  总耗时：${(batchResult.totalExecutionTime / 1000).toFixed(2)}s`);

    // 输出最严重场景
    if (batchResult.aggregated.worst_cases?.length > 0) {
      console.log('\n最严重场景:');
      batchResult.aggregated.worst_cases.forEach((wc, i) => {
        console.log(`  ${i + 1}. ${wc.scenario_name}: 评分 ${wc.severity_score.toFixed(2)}`);
        console.log(`     低电压节点：${wc.issues.low_voltage_count}, 过载线路：${wc.issues.overload_count}`);
      });
    }

  } catch (error) {
    console.error('批量仿真失败:', error.message);
  }

  // =====================================================
  // 示例 3: 并行执行效率测试
  // =====================================================
  console.log('\n' + '='.repeat(60));
  console.log('示例 3: 并行执行效率测试');
  console.log('='.repeat(60));

  try {
    const benchmark = await batchSkill.benchmarkParallel(
      PROJECT_RID,
      6, // 6 个场景
      [1, 2, 5] // 测试并行度 1, 2, 5
    );

    console.log('\n并行执行效率测试结果:');
    console.log('-'.repeat(50));
    benchmark.benchmarks.forEach(b => {
      if (b.totalExecutionTime) {
        const speedup = b.speedup ? ` (加速比：${b.speedup}x)` : '';
        console.log(`并行度 ${b.parallel}: ${(b.totalExecutionTime / 1000).toFixed(2)}s, ` +
          `吞吐：${b.throughput} 场景/s${speedup}`);
      } else {
        console.log(`并行度 ${b.parallel}: 失败 - ${b.error}`);
      }
    });
    console.log('-'.repeat(50));

  } catch (error) {
    console.error('效率测试失败:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('演示完成');
  console.log('='.repeat(60));
}

// 运行演示
main().catch(console.error);
