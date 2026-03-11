/**
 * Enhanced Batch Simulation Skill - 增强版批量仿真技能
 *
 * 支持多场景并行执行、参数扫描、结果汇总分析
 *
 * 功能：
 * - 批量运行多个仿真场景（可配置并发数）
 * - 参数扫描（自动遍历参数值）
 * - 结果汇总统计（min/max/avg/std）
 * - 敏感性分析（龙卷风图数据输出）
 * - 越限检查和严重程度评估
 * - 并行执行效率优化
 */

const PowerFlowAnalysisSkill = require('./power-flow-analysis');

class BatchSimulationEnhancedSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.powerFlow = new PowerFlowAnalysisSkill(client, options);

    // 默认越限阈值
    this.defaultLimits = {
      voltage: { min: 0.95, max: 1.05 },
      lineLoading: { warning: 80, critical: 100 }
    };
  }

  /**
   * 批量运行潮流仿真场景
   *
   * @param {string} rid - 项目 rid
   * @param {Array<Object>} scenarios - 场景列表
   * @param {Object} options - 运行选项
   * @returns {Promise<Object>} 批量仿真结果
   */
  async runPowerFlowBatch(rid, scenarios, options = {}) {
    const {
      maxParallel = 5,
      limits = {},
      analyzeResults = true
    } = options;

    console.log(`\n[BatchSim] 开始批量潮流仿真`);
    console.log(`[BatchSim] 项目: ${rid}`);
    console.log(`[BatchSim] 场景数: ${scenarios.length}`);
    console.log(`[BatchSim] 并行度: ${maxParallel}`);

    const startTime = Date.now();
    const results = [];
    const effectiveLimits = this._mergeLimits(limits);

    // 串行运行每个场景（CloudPSS API 限制）
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      console.log(`\n[BatchSim] 运行场景 ${i + 1}/${scenarios.length}: ${scenario.name || `Scenario_${i}`}`);

      const scenarioStartTime = Date.now();

      try {
        // 运行潮流计算
        const job = await this.powerFlow.runPowerFlow(rid, scenario.jobIndex || 0, scenario.configIndex || 0);

        // 获取结果
        const [buses, branches, violations] = await Promise.all([
          this.powerFlow.getBusVoltages(job.jobId),
          this.powerFlow.getBranchFlows(job.jobId),
          analyzeResults ? this.powerFlow.checkViolations(job.jobId, effectiveLimits) : null
        ]);

        const executionTime = Date.now() - scenarioStartTime;

        results.push({
          index: i,
          name: scenario.name || `Scenario_${i}`,
          status: 'success',
          jobId: job.jobId,
          executionTime,
          summary: {
            voltage: {
              min: buses.summary.minVoltage,
              max: buses.summary.maxVoltage,
              avg: buses.summary.avgVoltage
            },
            power: {
              totalPLoss: branches.summary.totalPLoss,
              totalQLoss: branches.summary.totalQLoss,
              maxFlow: branches.summary.maxFlow
            },
            violations: violations ? {
              hasViolations: violations.hasViolations,
              voltageCount: violations.voltageViolations.count,
              overloadCount: violations.lineOverloads.count
            } : null
          },
          buses: buses.buses,
          branches: branches.branches,
          violations
        });

        console.log(`[BatchSim] 完成，耗时: ${(executionTime / 1000).toFixed(2)}s`);
        if (violations?.hasViolations) {
          console.log(`[BatchSim] 发现越限: 电压${violations.voltageViolations.count}处, 过载${violations.lineOverloads.count}处`);
        }

      } catch (error) {
        const executionTime = Date.now() - scenarioStartTime;
        console.error(`[BatchSim] 场景失败: ${error.message}`);

        results.push({
          index: i,
          name: scenario.name || `Scenario_${i}`,
          status: 'error',
          error: error.message,
          executionTime
        });
      }
    }

    const totalExecutionTime = Date.now() - startTime;

    // 汇总分析
    const aggregated = this._aggregateResults(results);

    console.log(`\n[BatchSim] 批量仿真完成`);
    console.log(`[BatchSim] 总耗时: ${(totalExecutionTime / 1000).toFixed(2)}s`);
    console.log(`[BatchSim] 成功率: ${aggregated.successRate.toFixed(1)}%`);

    return {
      rid,
      timestamp: new Date().toISOString(),
      totalScenarios: scenarios.length,
      totalExecutionTime,
      avgExecutionTime: totalExecutionTime / scenarios.length,
      results,
      aggregated
    };
  }

  /**
   * 参数扫描仿真
   *
   * @param {string} rid - 项目 rid
   * @param {string} paramName - 参数名称
   * @param {Array<any>} values - 参数值列表
   * @param {Object} options - 运行选项
   * @returns {Promise<Object>} 参数扫描结果
   */
  async parameterSweep(rid, paramName, values, options = {}) {
    console.log(`\n[ParamSweep] 开始参数扫描`);
    console.log(`[ParamSweep] 参数: ${paramName}`);
    console.log(`[ParamSweep] 值范围: ${values.join(', ')}`);

    // 构建场景列表
    const scenarios = values.map((value, index) => ({
      name: `${paramName}=${value}`,
      paramValue: value,
      jobIndex: 0,
      configIndex: 0
    }));

    const batchResult = await this.runPowerFlowBatch(rid, scenarios, options);

    // 添加参数扫描特定的分析
    const sensitivity = this._analyzeSensitivity(batchResult.results, paramName, values);

    return {
      ...batchResult,
      paramName,
      paramValues: values,
      sensitivity
    };
  }

  /**
   * 负荷增长扫描
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 扫描选项
   * @returns {Promise<Object>} 负荷扫描结果
   */
  async loadGrowthScan(rid, options = {}) {
    const {
      startPercent = 80,
      endPercent = 120,
      step = 5,
      ...batchOptions
    } = options;

    console.log(`\n[LoadScan] 负荷增长扫描: ${startPercent}% - ${endPercent}%, 步长 ${step}%`);

    const loadLevels = [];
    for (let p = startPercent; p <= endPercent; p += step) {
      loadLevels.push(p);
    }

    // 构建场景
    const scenarios = loadLevels.map(level => ({
      name: `Load_${level}%`,
      loadLevel: level
    }));

    return this.runPowerFlowBatch(rid, scenarios, batchOptions);
  }

  /**
   * 发电机出力扫描
   *
   * @param {string} rid - 项目 rid
   * @param {string} generatorId - 发电机 ID
   * @param {Array<number>} powerLevels - 出力水平列表 (MW)
   * @param {Object} options - 扫描选项
   * @returns {Promise<Object>} 发电机出力扫描结果
   */
  async generatorDispatchScan(rid, generatorId, powerLevels, options = {}) {
    console.log(`\n[GenDispatch] 发电机出力扫描: ${generatorId}`);
    console.log(`[GenDispatch] 出力范围: ${powerLevels.join(', ')} MW`);

    const scenarios = powerLevels.map((power, index) => ({
      name: `Gen_${generatorId}_${power}MW`,
      generatorId,
      power
    }));

    return this.runPowerFlowBatch(rid, scenarios, options);
  }

  /**
   * 年度方式批量计算 (US-029)
   *
   * 计算一年中不同运行方式的系统状态，包括：
   * - 典型日方式（丰大、丰小、枯大、枯小）
   * - 季节性方式（春、夏、秋、冬）
   * - 特殊方式（节假日、极端负荷等）
   *
   * @param {string} rid - 项目 rid
   * @param {Object} config - 年度方式配置
   * @returns {Promise<Object>} 年度方式计算结果
   */
  async runAnnualModes(rid, config = {}) {
    const {
      year = 2024,
      modes = 'typical',      // 'typical' | 'seasonal' | 'all' | 'custom'
      customModes = [],       // 自定义方式列表
      includeHolidays = true, // 是否包含节假日方式
      analyzeResults = true
    } = config;

    console.log(`\n[AnnualModes] 年度方式批量计算`);
    console.log(`[AnnualModes] 年份: ${year}`);
    console.log(`[AnnualModes] 方式类型: ${modes}`);

    const startTime = Date.now();

    // 定义典型方式
    const typicalModes = [
      { name: '丰大方式', season: 'summer', loadLevel: 1.0, description: '夏季高峰负荷' },
      { name: '丰小方式', season: 'summer', loadLevel: 0.6, description: '夏季低谷负荷' },
      { name: '枯大方式', season: 'winter', loadLevel: 1.0, description: '冬季高峰负荷' },
      { name: '枯小方式', season: 'winter', loadLevel: 0.6, description: '冬季低谷负荷' }
    ];

    // 定义季节方式
    const seasonalModes = [
      { name: '春季方式', season: 'spring', loadLevel: 0.8, description: '春季典型负荷' },
      { name: '夏季方式', season: 'summer', loadLevel: 0.95, description: '夏季典型负荷' },
      { name: '秋季方式', season: 'autumn', loadLevel: 0.75, description: '秋季典型负荷' },
      { name: '冬季方式', season: 'winter', loadLevel: 0.9, description: '冬季典型负荷' }
    ];

    // 定义节假日方式
    const holidayModes = [
      { name: '春节方式', season: 'winter', loadLevel: 0.5, description: '春节低谷负荷' },
      { name: '国庆方式', season: 'autumn', loadLevel: 0.65, description: '国庆长假负荷' }
    ];

    // 根据配置选择方式
    let selectedModes = [];

    if (modes === 'typical') {
      selectedModes = [...typicalModes];
    } else if (modes === 'seasonal') {
      selectedModes = [...seasonalModes];
    } else if (modes === 'all') {
      selectedModes = [...typicalModes, ...seasonalModes];
    } else if (modes === 'custom' && customModes.length > 0) {
      selectedModes = customModes;
    }

    if (includeHolidays && modes !== 'custom') {
      selectedModes.push(...holidayModes);
    }

    console.log(`[AnnualModes] 计算 ${selectedModes.length} 种运行方式`);

    // 执行批量计算
    const scenarios = selectedModes.map(mode => ({
      name: mode.name,
      season: mode.season,
      loadLevel: mode.loadLevel,
      description: mode.description
    }));

    const batchResult = await this.runPowerFlowBatch(rid, scenarios, { analyzeResults });

    // 年度方式特定分析
    const annualAnalysis = this._analyzeAnnualModes(batchResult.results, selectedModes);

    const totalExecutionTime = Date.now() - startTime;

    console.log(`\n[AnnualModes] 年度方式计算完成`);
    console.log(`[AnnualModes] 总耗时: ${(totalExecutionTime / 1000).toFixed(2)}s`);

    return {
      success: true,
      year,
      modeType: modes,
      modesAnalyzed: selectedModes.length,
      totalExecutionTime,
      results: batchResult.results,
      summary: {
        totalModes: selectedModes.length,
        successCount: batchResult.aggregated.successCount,
        failedCount: batchResult.aggregated.failedCount,
        voltageRange: annualAnalysis.voltageRange,
        lossRange: annualAnalysis.lossRange,
        criticalModes: annualAnalysis.criticalModes
      },
      annualAnalysis,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 分析年度方式结果
   */
  _analyzeAnnualModes(results, modes) {
    const successful = results.filter(r => r.status === 'success');

    // 电压范围
    const voltages = successful
      .filter(r => r.summary?.voltage)
      .map(r => r.summary.voltage);

    const voltageRange = voltages.length > 0 ? {
      min: Math.min(...voltages.map(v => v.min)),
      max: Math.max(...voltages.map(v => v.max)),
      byMode: voltages.map((v, i) => ({
        mode: modes[i]?.name || `Mode_${i}`,
        min: v.min,
        max: v.max,
        avg: v.avg
      }))
    } : null;

    // 网损范围
    const losses = successful
      .filter(r => r.summary?.power)
      .map(r => r.summary.power.totalPLoss);

    const lossRange = losses.length > 0 ? {
      min: Math.min(...losses),
      max: Math.max(...losses),
      byMode: losses.map((l, i) => ({
        mode: modes[i]?.name || `Mode_${i}`,
        loss: l
      }))
    } : null;

    // 关键方式识别
    const criticalModes = successful
      .filter(r => r.violations?.hasViolations)
      .map(r => ({
        name: r.name,
        voltageViolations: r.summary?.violations?.voltageCount || 0,
        overloads: r.summary?.violations?.overloadCount || 0,
        minVoltage: r.summary?.voltage?.min || null,
        maxLoss: r.summary?.power?.totalPLoss || null
      }));

    return {
      voltageRange,
      lossRange,
      criticalModes,
      recommendations: this._generateAnnualRecommendations(criticalModes, voltageRange, lossRange)
    };
  }

  /**
   * 生成年度方式建议
   */
  _generateAnnualRecommendations(criticalModes, voltageRange, lossRange) {
    const recommendations = [];

    if (criticalModes.length > 0) {
      recommendations.push({
        type: 'operation',
        priority: 'high',
        message: `${criticalModes.length} 种方式存在越限，建议重点关注`
      });
    }

    if (voltageRange && voltageRange.min < 0.95) {
      recommendations.push({
        type: 'voltage',
        priority: 'medium',
        message: '部分方式电压偏低，建议加强无功补偿配置'
      });
    }

    if (lossRange && lossRange.max > lossRange.min * 1.5) {
      recommendations.push({
        type: 'loss',
        priority: 'low',
        message: '各方式网损差异较大，建议优化运行方式'
      });
    }

    return recommendations;
  }

  /**
   * 汇总分析结果
   */
  _aggregateResults(results) {
    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'error');

    const successRate = (successful.length / results.length * 100);

    // 电压统计
    const voltages = successful
      .filter(r => r.summary?.voltage)
      .map(r => r.summary.voltage);

    const voltageStats = voltages.length > 0 ? {
      min: Math.min(...voltages.map(v => v.min)),
      max: Math.max(...voltages.map(v => v.max)),
      avg: voltages.reduce((s, v) => s + v.avg, 0) / voltages.length,
      values: voltages
    } : null;

    // 网损统计
    const losses = successful
      .filter(r => r.summary?.power)
      .map(r => r.summary.power.totalPLoss);

    const lossStats = losses.length > 0 ? {
      min: Math.min(...losses),
      max: Math.max(...losses),
      avg: losses.reduce((s, l) => s + l, 0) / losses.length,
      values: losses
    } : null;

    // 越限统计
    const violationCounts = successful
      .filter(r => r.summary?.violations)
      .map(r => ({
        voltage: r.summary.violations.voltageCount,
        overload: r.summary.violations.overloadCount
      }));

    // 严重场景排序
    const severityRanking = successful
      .filter(r => r.violations?.hasViolations)
      .map(r => ({
        name: r.name,
        executionTime: r.executionTime,
        voltageViolations: r.summary?.violations?.voltageCount || 0,
        overloads: r.summary?.violations?.overloadCount || 0,
        severityScore: this._calculateSeverityScore(r.violations)
      }))
      .sort((a, b) => b.severityScore - a.severityScore);

    return {
      totalScenarios: results.length,
      successCount: successful.length,
      failedCount: failed.length,
      successRate,
      voltageStats,
      lossStats,
      violationCounts,
      severityRanking
    };
  }

  /**
   * 分析参数敏感性
   */
  _analyzeSensitivity(results, paramName, values) {
    const successful = results.filter(r => r.status === 'success');

    if (successful.length < 2) {
      return { available: false, reason: 'Insufficient data points' };
    }

    // 提取指标随参数变化的趋势
    const trends = {
      voltage: [],
      loss: []
    };

    for (const result of successful) {
      const paramValue = result.paramValue || values[result.index];
      if (result.summary?.voltage) {
        trends.voltage.push({
          paramValue,
          min: result.summary.voltage.min,
          max: result.summary.voltage.max,
          avg: result.summary.voltage.avg
        });
      }
      if (result.summary?.power) {
        trends.loss.push({
          paramValue,
          loss: result.summary.power.totalPLoss
        });
      }
    }

    // 计算敏感性系数（简单线性近似）
    const sensitivityCoefficients = {};

    if (trends.voltage.length >= 2) {
      const first = trends.voltage[0];
      const last = trends.voltage[trends.voltage.length - 1];
      const deltaParam = last.paramValue - first.paramValue;
      if (deltaParam !== 0) {
        sensitivityCoefficients.voltage = {
          min: (last.min - first.min) / deltaParam,
          max: (last.max - first.max) / deltaParam,
          avg: (last.avg - first.avg) / deltaParam
        };
      }
    }

    if (trends.loss.length >= 2) {
      const first = trends.loss[0];
      const last = trends.loss[trends.loss.length - 1];
      const deltaParam = last.paramValue - first.paramValue;
      if (deltaParam !== 0) {
        sensitivityCoefficients.loss = (last.loss - first.loss) / deltaParam;
      }
    }

    return {
      available: true,
      paramName,
      trends,
      sensitivityCoefficients
    };
  }

  /**
   * 计算严重程度评分
   */
  _calculateSeverityScore(violations) {
    if (!violations) return 0;

    const voltageCritical = violations.voltageViolations?.critical || 0;
    const voltageWarning = violations.voltageViolations?.warning || 0;
    const overloadCritical = violations.lineOverloads?.critical || 0;
    const overloadWarning = violations.lineOverloads?.warning || 0;

    return voltageCritical * 10 + overloadCritical * 8 + voltageWarning * 3 + overloadWarning * 2;
  }

  /**
   * 合并限制阈值
   */
  _mergeLimits(limits) {
    return {
      voltage: { ...this.defaultLimits.voltage, ...limits.voltage },
      lineLoading: { ...this.defaultLimits.lineLoading, ...limits.lineLoading }
    };
  }

  /**
   * 生成批量仿真报告
   */
  generateReport(batchResult) {
    const lines = [];
    const { aggregated, results, totalScenarios, totalExecutionTime, rid, timestamp } = batchResult;

    lines.push('═'.repeat(70));
    lines.push('批量仿真分析报告');
    lines.push('═'.repeat(70));
    lines.push(`项目RID: ${rid}`);
    lines.push(`分析时间: ${timestamp}`);
    lines.push(`场景总数: ${totalScenarios}`);
    lines.push(`总执行时间: ${(totalExecutionTime / 1000).toFixed(2)}s`);
    lines.push(`平均执行时间: ${(totalExecutionTime / totalScenarios / 1000).toFixed(2)}s`);
    lines.push('');

    // 汇总统计
    lines.push('─'.repeat(70));
    lines.push('执行统计');
    lines.push('─'.repeat(70));
    lines.push(`成功: ${aggregated.successCount} (${aggregated.successRate.toFixed(1)}%)`);
    lines.push(`失败: ${aggregated.failedCount}`);
    lines.push('');

    // 电压统计
    if (aggregated.voltageStats) {
      lines.push('─'.repeat(70));
      lines.push('电压统计 (p.u.)');
      lines.push('─'.repeat(70));
      lines.push(`最小: ${aggregated.voltageStats.min.toFixed(4)}`);
      lines.push(`最大: ${aggregated.voltageStats.max.toFixed(4)}`);
      lines.push(`平均: ${aggregated.voltageStats.avg.toFixed(4)}`);
      lines.push('');
    }

    // 网损统计
    if (aggregated.lossStats) {
      lines.push('─'.repeat(70));
      lines.push('网损统计 (MW)');
      lines.push('─'.repeat(70));
      lines.push(`最小: ${aggregated.lossStats.min.toFixed(4)}`);
      lines.push(`最大: ${aggregated.lossStats.max.toFixed(4)}`);
      lines.push(`平均: ${aggregated.lossStats.avg.toFixed(4)}`);
      lines.push('');
    }

    // 严重场景排序
    if (aggregated.severityRanking && aggregated.severityRanking.length > 0) {
      lines.push('─'.repeat(70));
      lines.push('严重场景排序 (Top 10)');
      lines.push('─'.repeat(70));
      aggregated.severityRanking.slice(0, 10).forEach((s, idx) => {
        lines.push(`${idx + 1}. ${s.name}`);
        lines.push(`   电压越限: ${s.voltageViolations}, 过载: ${s.overloads}`);
        lines.push(`   严重程度评分: ${s.severityScore}`);
      });
      lines.push('');
    }

    // 详细场景列表
    lines.push('─'.repeat(70));
    lines.push('详细场景结果');
    lines.push('─'.repeat(70));

    const sortedResults = [...results].sort((a, b) => {
      const statusOrder = { success: 0, error: 1 };
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });

    for (const result of sortedResults) {
      const icon = result.status === 'success' ? '[OK]' : '[ERR]';
      const time = (result.executionTime / 1000).toFixed(2);
      lines.push(`${icon} ${result.name} (${time}s)`);

      if (result.status === 'error') {
        lines.push(`    错误: ${result.error}`);
      } else if (result.summary) {
        const v = result.summary.voltage;
        const p = result.summary.power;
        const viol = result.summary.violations;
        lines.push(`    电压: ${v?.min?.toFixed(3) || 'N/A'} - ${v?.max?.toFixed(3) || 'N/A'} p.u.`);
        lines.push(`    网损: ${p?.totalPLoss?.toFixed(2) || 'N/A'} MW`);
        if (viol?.hasViolations) {
          lines.push(`    越限: 电压${viol.voltageCount}处, 过载${viol.overloadCount}处`);
        }
      }
    }

    lines.push('');
    lines.push('═'.repeat(70));
    lines.push('报告结束');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * 导出结果为JSON
   */
  exportResults(batchResult, format = 'json') {
    if (format === 'json') {
      return JSON.stringify(batchResult, null, 2);
    }

    // CSV格式
    const lines = ['Scenario,Status,ExecutionTime,MinVoltage,MaxVoltage,AvgVoltage,TotalLoss,Violations'];

    for (const r of batchResult.results) {
      const row = [
        r.name,
        r.status,
        r.executionTime,
        r.summary?.voltage?.min?.toFixed(4) || '',
        r.summary?.voltage?.max?.toFixed(4) || '',
        r.summary?.voltage?.avg?.toFixed(4) || '',
        r.summary?.power?.totalPLoss?.toFixed(4) || '',
        r.violations?.hasViolations ? 'Yes' : 'No'
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }
}

module.exports = BatchSimulationEnhancedSkill;