/**
 * Batch Simulation Skill
 *
 * 批量仿真技能：支持多场景并行执行、参数扫描、结果汇总分析
 *
 * 功能：
 * - 批量运行多个仿真场景（可配置并发数）
 * - 参数扫描（自动遍历参数值）
 * - 结果汇总统计（min/max/avg）
 * - 龙卷风图数据输出（敏感性分析）
 * - 并行执行效率优化
 */

class BatchSimulationSkill {
  constructor(client) {
    this.client = client;
    this.pyBridge = client.bridge;
  }

  /**
   * 批量运行仿真场景
   *
   * @param {Array<Object>} scenarios - 场景列表
   * @param {Object} options - 运行选项
   * @param {string} options.rid - 项目 rid
   * @param {number} options.maxParallel - 最大并行数（默认 5）
   * @param {string} options.jobType - 计算方案类型（默认 'powerFlow'）
   * @returns {Promise<Object>} 批量仿真结果
   */
  async runBatch(scenarios, options = {}) {
    const {
      rid,
      maxParallel = 5,
      jobType = 'powerFlow'
    } = options;

    if (!rid) {
      throw new Error('rid is required');
    }

    console.log(`[BatchSim] 开始批量仿真，场景数：${scenarios.length}, 并行度：${maxParallel}`);

    const startTime = Date.now();

    // 运行批量仿真
    const results = await this.pyBridge.runBatchSimulations(
      scenarios,
      rid,
      maxParallel,
      jobType
    );

    const executionTime = Date.now() - startTime;
    console.log(`[BatchSim] 批量仿真完成，总耗时：${(executionTime / 1000).toFixed(2)}s`);

    // 汇总结果
    const aggregated = await this.aggregateResults(results);

    return {
      rid,
      timestamp: new Date().toISOString(),
      scenarios: scenarios.length,
      totalExecutionTime: executionTime,
      results,
      aggregated
    };
  }

  /**
   * 参数扫描仿真
   *
   * @param {string} rid - 项目 rid
   * @param {string} paramName - 参数名称
   * @param {Array<number>} values - 参数值列表
   * @param {Object} options - 运行选项
   * @param {string} options.componentId - 元件 ID（可选）
   * @param {number} options.maxParallel - 最大并行数（默认 5）
   * @param {string} options.jobType - 计算方案类型（默认 'powerFlow'）
   * @returns {Promise<Object>} 参数扫描结果
   */
  async parameterSweep(rid, paramName, values, options = {}) {
    const {
      componentId = null,
      maxParallel = 5,
      jobType = 'powerFlow'
    } = options;

    console.log(`[BatchSim] 开始参数扫描：${paramName}, 范围：${values.join(', ')}`);

    const startTime = Date.now();

    // 运行参数扫描
    const results = await this.pyBridge.parameterSweep(
      rid,
      paramName,
      values,
      componentId,
      maxParallel,
      jobType
    );

    const executionTime = Date.now() - startTime;
    console.log(`[BatchSim] 参数扫描完成，总耗时：${(executionTime / 1000).toFixed(2)}s`);

    // 汇总结果
    const aggregated = await this.aggregateResults(results);

    return {
      rid,
      paramName,
      values,
      timestamp: new Date().toISOString(),
      totalExecutionTime: executionTime,
      results,
      aggregated
    };
  }

  /**
   * 汇总批量仿真结果
   *
   * @param {Array<Object>} results - 仿真结果列表
   * @returns {Promise<Object>} 汇总结果
   */
  async aggregateResults(results) {
    return this.pyBridge.aggregateResults(results);
  }

  /**
   * 生成龙卷风图数据（敏感性分析）
   *
   * @param {Object} aggregatedResults - 汇总结果
   * @param {string} metricKey - 要分析的指标键名（如 'voltage_avg', 'power_loss'）
   * @returns {Object} 龙卷风图数据
   */
  generateTornadoData(aggregatedResults, metricKey = 'voltage_avg') {
    const tornadoData = aggregatedResults.tornado_data || [];

    if (!tornadoData.length) {
      return {
        labels: [],
        positive: [],
        negative: [],
        metric: metricKey
      };
    }

    const labels = tornadoData.map(d => d.scenario);
    const positive = tornadoData
      .filter(d => d[`${metricKey}_direction`] === 'increase')
      .map(d => d[`${metricKey}_impact`] || 0);
    const negative = tornadoData
      .filter(d => d[`${metricKey}_direction`] === 'decrease')
      .map(d => d[`${metricKey}_impact`] || 0);

    return {
      labels,
      positive,
      negative,
      metric: metricKey
    };
  }

  /**
   * 生成批量仿真报告
   *
   * @param {Object} batchResult - 批量仿真结果
   * @returns {string} 格式化的报告文本
   */
  generateReport(batchResult) {
    const lines = [];
    const { aggregated, results, scenarios, totalExecutionTime, rid, timestamp } = batchResult;

    lines.push('='.repeat(60));
    lines.push('批量仿真报告');
    lines.push('='.repeat(60));
    lines.push(`项目：${rid}`);
    lines.push(`时间：${timestamp}`);
    lines.push(`场景总数：${scenarios}`);
    lines.push(`总执行时间：${(totalExecutionTime / 1000).toFixed(2)}s`);
    lines.push(`平均执行时间：${aggregated.avg_execution_time.toFixed(2)}s`);
    lines.push(`成功率：${aggregated.success_rate}%`);
    lines.push('');

    // 统计汇总
    lines.push('-'.repeat(60));
    lines.push('统计汇总');
    lines.push('-'.repeat(60));

    if (aggregated.statistics) {
      if (aggregated.statistics.voltage) {
        const v = aggregated.statistics.voltage;
        lines.push(`电压统计 (pu):`);
        lines.push(`  最小值：${v.min.toFixed(4)}`);
        lines.push(`  最大值：${v.max.toFixed(4)}`);
        lines.push(`  平均值：${v.avg.toFixed(4)}`);
        lines.push(`  标准差：${v.std.toFixed(4)}`);
      }

      if (aggregated.statistics.power_loss) {
        const p = aggregated.statistics.power_loss;
        lines.push(`网损统计 (MW):`);
        lines.push(`  最小值：${p.min.toFixed(4)}`);
        lines.push(`  最大值：${p.max.toFixed(4)}`);
        lines.push(`  平均值：${p.avg.toFixed(4)}`);
        lines.push(`  标准差：${p.std.toFixed(4)}`);
      }

      if (aggregated.statistics.line_loading) {
        const l = aggregated.statistics.line_loading;
        lines.push(`线路负载统计 (%):`);
        lines.push(`  最小值：${l.min.toFixed(2)}`);
        lines.push(`  最大值：${l.max.toFixed(2)}`);
        lines.push(`  平均值：${l.avg.toFixed(2)}`);
        lines.push(`  过载线路数：${l.max_over_100}`);
      }
    }
    lines.push('');

    // 龙卷风图数据（敏感性分析）
    if (aggregated.tornado_data && aggregated.tornado_data.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('敏感性分析 (Top 10)');
      lines.push('-'.repeat(60));

      aggregated.tornado_data.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${item.scenario}`);
        lines.push(`   电压影响：${item.voltage_impact.toFixed(4)} (${item.voltage_direction})`);
        if (item.loss_impact !== undefined) {
          lines.push(`   网损影响：${item.loss_impact.toFixed(4)} (${item.loss_direction})`);
        }
      });
      lines.push('');
    }

    // 最严重场景
    if (aggregated.worst_cases && aggregated.worst_cases.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('最严重场景 (Top 5)');
      lines.push('-'.repeat(60));

      aggregated.worst_cases.forEach((wc, idx) => {
        lines.push(`${idx + 1}. ${wc.scenario_name}`);
        lines.push(`   严重程度评分：${wc.severity_score.toFixed(2)}`);
        lines.push(`   低电压节点数：${wc.issues.low_voltage_count}`);
        lines.push(`   过载线路数：${wc.issues.overload_count}`);
        lines.push(`   最低电压：${wc.issues.min_voltage.toFixed(4)} pu`);
        lines.push(`   最大负载：${wc.issues.max_loading.toFixed(2)}%`);
      });
      lines.push('');
    }

    // 详细结果
    lines.push('-'.repeat(60));
    lines.push('详细结果');
    lines.push('-'.repeat(60));

    // 按状态排序
    const sortedResults = [...results].sort((a, b) => {
      const statusOrder = { success: 0, convergence_error: 1, failed: 2, timeout: 3 };
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });

    for (const result of sortedResults) {
      const statusIcon = {
        success: '[OK]',
        convergence_error: '[CONV]',
        failed: '[FAIL]',
        timeout: '[TIME]'
      }[result.status] || '[?]';

      lines.push(`${statusIcon} ${result.scenario_name} (${result.execution_time}s)`);

      if (result.status !== 'success') {
        lines.push(`    错误：${result.error || 'Unknown'}`);
      }
    }

    lines.push('');
    lines.push('='.repeat(60));
    lines.push('报告结束');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * 并行执行效率测试
   *
   * @param {string} rid - 项目 rid
   * @param {number} numScenarios - 场景数量
   * @param {Array<number>} parallelLevels - 要测试的并行级别
   * @returns {Promise<Object>} 效率测试结果
   */
  async benchmarkParallel(rid, numScenarios = 10, parallelLevels = [1, 2, 5, 10]) {
    const benchmarks = [];

    for (const parallel of parallelLevels) {
      console.log(`[Benchmark] 测试并行度 ${parallel}...`);

      // 创建测试场景（简化版，仅用于测试）
      const scenarios = [];
      for (let i = 0; i < numScenarios; i++) {
        scenarios.push({
          name: `Benchmark_Scenario_${i}`,
          config: {},
          components: []
        });
      }

      const startTime = Date.now();

      try {
        await this.pyBridge.runBatchSimulations(scenarios, rid, parallel, 'powerFlow');
        const executionTime = Date.now() - startTime;

        benchmarks.push({
          parallel,
          numScenarios,
          totalExecutionTime: executionTime,
          avgPerScenario: executionTime / numScenarios,
          throughput: (numScenarios / executionTime * 1000).toFixed(2)
        });

        console.log(`[Benchmark] 并行度 ${parallel}: ${(executionTime / 1000).toFixed(2)}s`);
      } catch (error) {
        console.error(`[Benchmark] 并行度 ${parallel} 测试失败：${error.message}`);
        benchmarks.push({
          parallel,
          numScenarios,
          error: error.message
        });
      }
    }

    // 计算加速比
    const baseline = benchmarks.find(b => b.parallel === 1);
    if (baseline && baseline.totalExecutionTime) {
      benchmarks.forEach(b => {
        if (b.totalExecutionTime) {
          b.speedup = (baseline.totalExecutionTime / b.totalExecutionTime).toFixed(2);
        }
      });
    }

    return {
      rid,
      timestamp: new Date().toISOString(),
      numScenarios,
      benchmarks
    };
  }
}

module.exports = BatchSimulationSkill;
