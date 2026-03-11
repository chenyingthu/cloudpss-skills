/**
 * Batch Simulation Skill Tests
 *
 * 测试批量仿真技能的功能：
 * - 参数扫描测试（扫描负荷水平 50%~150%）
 * - 验证并行执行效率
 * - 结果汇总统计测试
 * - 龙卷风图数据输出测试
 */

const assert = require('assert');
const { CloudPSSSkills } = require('../src/index');

// 测试配置
const TEST_CONFIG = {
  token: process.env.CLOUDPSS_TOKEN,
  apiKey: process.env.CLOUDPSS_API_KEY,
  apiURL: process.env.CLOUDPSS_API_URL || 'https://cloudpss.net/'
};

// 测试用项目 RID（需要替换为实际项目）
const TEST_PROJECT_RID = process.env.TEST_PROJECT_RID || 'model/test/benchmark';

describe('BatchSimulationSkill', function() {
  this.timeout(300000); // 5 分钟超时

  let skills;
  let batchSkill;

  before(function() {
    skills = new CloudPSSSkills(TEST_CONFIG);
    batchSkill = skills.batch;
  });

  describe('#parameterSweep()', function() {
    it('应该成功执行负荷水平参数扫描 (50%~150%)', async function() {
      // 跳过实际 API 调用（如果没有配置）
      if (!TEST_CONFIG.token && !TEST_CONFIG.apiKey) {
        console.log('[SKIP] 未配置 API Token，跳过实际测试');
        this.skip();
      }

      // 参数扫描：负荷水平从 50% 到 150%
      const loadLevels = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

      try {
        const result = await batchSkill.parameterSweep(
          TEST_PROJECT_RID,
          'load_level',
          loadLevels,
          {
            maxParallel: 5,
            jobType: 'powerFlow'
          }
        );

        // 验证结果结构
        assert.ok(result, '应该返回结果');
        assert.ok(result.results, '应该包含结果数组');
        assert.ok(result.aggregated, '应该包含汇总数据');

        // 验证结果数量
        assert.strictEqual(
          result.results.length,
          loadLevels.length,
          '结果数量应该与参数值数量一致'
        );

        // 验证汇总数据
        assert.ok(result.aggregated.total_scenarios > 0, '应该有场景数统计');
        assert.ok('success_rate' in result.aggregated, '应该有成功率统计');

        console.log(`参数扫描完成：${result.results.length} 个场景，成功率：${result.aggregated.success_rate}%`);

        // 验证电压统计（如果有成功场景）
        if (result.aggregated.statistics?.voltage) {
          const v = result.aggregated.statistics.voltage;
          assert.ok(v.min <= v.max, '电压最小值应该小于等于最大值');
          assert.ok(v.min >= 0 && v.max <= 2, '电压值应该在合理范围内');
          console.log(`电压统计：min=${v.min}, max=${v.max}, avg=${v.avg}`);
        }

      } catch (error) {
        console.error('参数扫描测试失败:', error.message);
        throw error;
      }
    });

    it('应该支持不同并行度配置', async function() {
      if (!TEST_CONFIG.token && !TEST_CONFIG.apiKey) {
        this.skip();
      }

      const scenarios = [
        { name: 'Scenario_1', config: { load: 0.8 }, components: [] },
        { name: 'Scenario_2', config: { load: 0.9 }, components: [] },
        { name: 'Scenario_3', config: { load: 1.0 }, components: [] }
      ];

      // 测试不同并行度
      for (const parallel of [1, 2, 5]) {
        const result = await batchSkill.runBatch(scenarios, {
          rid: TEST_PROJECT_RID,
          maxParallel: parallel,
          jobType: 'powerFlow'
        });

        assert.ok(result, `并行度 ${parallel} 应该返回结果`);
        assert.strictEqual(result.scenarios, 3, '场景数应该为 3');
        console.log(`并行度 ${parallel}: 总耗时 ${(result.totalExecutionTime / 1000).toFixed(2)}s`);
      }
    });
  });

  describe('#runBatch()', function() {
    it('应该成功执行批量仿真', async function() {
      if (!TEST_CONFIG.token && !TEST_CONFIG.apiKey) {
        this.skip();
      }

      // 创建多个场景
      const scenarios = [
        {
          name: 'Base_Case',
          config: {},
          components: []
        },
        {
          name: 'High_Load',
          config: {},
          components: [{
            element_id: 'load_1',
            args: { load: 1.2 }
          }]
        },
        {
          name: 'Low_Load',
          config: {},
          components: [{
            element_id: 'load_1',
            args: { load: 0.8 }
          }]
        }
      ];

      const result = await batchSkill.runBatch(scenarios, {
        rid: TEST_PROJECT_RID,
        maxParallel: 3,
        jobType: 'powerFlow'
      });

      // 验证结果
      assert.ok(result, '应该返回结果');
      assert.strictEqual(result.scenarios, 3, '场景数应该为 3');
      assert.ok(result.results, '应该包含详细结果');
      assert.ok(result.aggregated, '应该包含汇总数据');

      console.log(`批量仿真完成：${result.aggregated.success_rate}% 成功`);
    });

    it('应该处理空场景列表', async function() {
      try {
        const result = await batchSkill.runBatch([], {
          rid: TEST_PROJECT_RID
        });
        assert.strictEqual(result.scenarios, 0, '空场景列表应该返回 0 个场景');
      } catch (error) {
        // 空场景列表可能抛出错误，这是可接受的行为
        assert.ok(error.message.includes('empty') || error.message.includes('0'),
          '空场景应该抛出合适的错误');
      }
    });
  });

  describe('#aggregateResults()', function() {
    it('应该正确汇总仿真结果', async function() {
      // 模拟仿真结果
      const mockResults = [
        {
          scenario_name: 'Scenario_1',
          status: 'success',
          result: {
            buses: [{ Vm: 0.98 }, { Vm: 1.02 }],
            branches: [{ Ploss: 0.5, Pij: 50, rate: 100 }]
          },
          execution_time: 10.5
        },
        {
          scenario_name: 'Scenario_2',
          status: 'success',
          result: {
            buses: [{ Vm: 0.95 }, { Vm: 1.05 }],
            branches: [{ Ploss: 0.8, Pij: 80, rate: 100 }]
          },
          execution_time: 12.3
        },
        {
          scenario_name: 'Scenario_3',
          status: 'failed',
          result: null,
          error: 'Convergence failed',
          execution_time: 5.0
        }
      ];

      const aggregated = await batchSkill.aggregateResults(mockResults);

      // 验证汇总数据
      assert.strictEqual(aggregated.total_scenarios, 3, '总场景数应该为 3');
      assert.strictEqual(aggregated.success_count, 2, '成功数应该为 2');
      assert.strictEqual(aggregated.failed_count, 1, '失败数应该为 1');
      assert.strictEqual(aggregated.success_rate, 66.7, '成功率应该约 66.7%');

      // 验证统计计算
      assert.ok(aggregated.statistics.voltage, '应该有电压统计');
      assert.strictEqual(aggregated.statistics.voltage.min, 0.95, '最低电压应该为 0.95');
      assert.strictEqual(aggregated.statistics.voltage.max, 1.05, '最高电压应该为 1.05');

      // 验证龙卷风图数据
      assert.ok(Array.isArray(aggregated.tornado_data), '龙卷风图数据应该是数组');

      // 验证最严重场景
      assert.ok(Array.isArray(aggregated.worst_cases), '最严重场景应该是数组');

      console.log('汇总结果验证通过');
    });

    it('应该处理空结果列表', async function() {
      const aggregated = await batchSkill.aggregateResults([]);

      assert.strictEqual(aggregated.total_scenarios, 0, '空结果应该返回 0 个场景');
      assert.strictEqual(aggregated.success_rate, 0, '空结果成功率应该为 0');
    });
  });

  describe('#generateTornadoData()', function() {
    it('应该生成龙卷风图数据', async function() {
      const mockAggregated = {
        tornado_data: [
          { scenario: 'S1', voltage_impact: 0.05, voltage_direction: 'increase' },
          { scenario: 'S2', voltage_impact: 0.03, voltage_direction: 'decrease' },
          { scenario: 'S3', voltage_impact: 0.08, voltage_direction: 'increase' }
        ]
      };

      const tornadoData = batchSkill.generateTornadoData(mockAggregated, 'voltage');

      assert.ok(tornadoData.labels, '应该包含标签');
      assert.ok(tornadoData.positive, '应该包含正向影响数据');
      assert.ok(tornadoData.negative, '应该包含负向影响数据');
      assert.strictEqual(tornadoData.metric, 'voltage', '指标名称应该正确');

      console.log('龙卷风图数据生成成功');
    });
  });

  describe('#generateReport()', function() {
    it('应该生成格式化的报告', async function() {
      const mockResult = {
        rid: TEST_PROJECT_RID,
        timestamp: new Date().toISOString(),
        scenarios: 3,
        totalExecutionTime: 30000,
        results: [
          { scenario_name: 'S1', status: 'success', execution_time: 10 },
          { scenario_name: 'S2', status: 'success', execution_time: 12 },
          { scenario_name: 'S3', status: 'failed', error: 'Test error', execution_time: 5 }
        ],
        aggregated: {
          success_rate: 66.7,
          avg_execution_time: 9,
          statistics: {
            voltage: { min: 0.95, max: 1.05, avg: 1.0, std: 0.03 },
            power_loss: { min: 0.5, max: 0.8, avg: 0.65, std: 0.1 }
          },
          tornado_data: [
            { scenario: 'S1', voltage_impact: 0.02, voltage_direction: 'increase' }
          ],
          worst_cases: [
            {
              scenario_name: 'S2',
              severity_score: 15.5,
              issues: {
                low_voltage_count: 1,
                overload_count: 0,
                min_voltage: 0.94,
                max_loading: 85
              }
            }
          ]
        }
      };

      const report = batchSkill.generateReport(mockResult);

      assert.ok(typeof report === 'string', '报告应该是字符串');
      assert.ok(report.includes('批量仿真报告'), '应该包含报告标题');
      assert.ok(report.includes('统计汇总'), '应该包含统计汇总部分');
      assert.ok(report.includes('S1'), '应该包含场景 S1');
      assert.ok(report.includes('S2'), '应该包含场景 S2');
      assert.ok(report.includes('S3'), '应该包含场景 S3');

      console.log('报告生成成功');
    });
  });

  describe('#benchmarkParallel()', function() {
    it('应该测试不同并行度的执行效率', async function() {
      if (!TEST_CONFIG.token && !TEST_CONFIG.apiKey) {
        this.skip();
      }

      const benchmark = await batchSkill.benchmarkParallel(
        TEST_PROJECT_RID,
        5, // 5 个场景
        [1, 2, 5] // 测试并行度 1, 2, 5
      );

      assert.ok(benchmark.benchmarks, '应该包含基准测试结果');
      assert.strictEqual(benchmark.numScenarios, 5, '场景数应该为 5');

      // 输出基准测试结果
      console.log('\n并行执行效率测试结果:');
      console.log('='.repeat(50));
      benchmark.benchmarks.forEach(b => {
        if (b.totalExecutionTime) {
          console.log(`并行度 ${b.parallel}: ${(b.totalExecutionTime / 1000).toFixed(2)}s, ` +
            `吞吐：${b.throughput} 场景/s, ` +
            `加速比：${b.speedup || 'N/A'}`);
        } else {
          console.log(`并行度 ${b.parallel}: 失败 - ${b.error}`);
        }
      });
      console.log('='.repeat(50));
    });
  });
});

// 独立的性能测试工具
async function runPerformanceTest() {
  console.log('运行批量仿真性能测试...\n');

  const skills = new CloudPSSSkills(TEST_CONFIG);
  const batchSkill = skills.batch;

  // 测试场景数量
  const scenarioCounts = [5, 10, 20];
  const parallelLevels = [1, 2, 5];

  const results = [];

  for (const count of scenarioCounts) {
    for (const parallel of parallelLevels) {
      const scenarios = Array.from({ length: count }, (_, i) => ({
        name: `Perf_Test_${i}`,
        config: {},
        components: []
      }));

      try {
        const startTime = Date.now();
        await batchSkill.runBatch(scenarios, {
          rid: TEST_PROJECT_RID,
          maxParallel: parallel
        });
        const duration = Date.now() - startTime;

        results.push({
          scenarios: count,
          parallel,
          duration: duration / 1000,
          throughput: (count / (duration / 1000)).toFixed(2)
        });

        console.log(`场景数：${count}, 并行度：${parallel}, 耗时：${(duration / 1000).toFixed(2)}s, 吞吐：${results[results.length - 1].throughput} 场景/s`);
      } catch (error) {
        console.error(`场景数：${count}, 并行度：${parallel}, 错误：${error.message}`);
      }
    }
  }

  console.log('\n性能测试完成');
  return results;
}

// 如果直接运行此文件
if (require.main === module) {
  runPerformanceTest().catch(console.error);
}

module.exports = {
  BatchSimulationTest: {
    runPerformanceTest
  }
};
