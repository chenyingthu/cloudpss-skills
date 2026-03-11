/**
 * Analyze Skill - 结果分析技能
 *
 * 用于分析电力系统仿真结果
 *
 * 基于 CloudPSS Python SDK:
 * - runner.result.getBuses() 获取节点数据
 * - runner.result.getBranches() 获取支路数据
 * - runner.result.getPlots() 获取曲线数据
 */

class AnalyzeSkill {
  constructor(client) {
    this.client = client;
  }

  /**
   * 分析潮流结果
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 分析报告
   */
  async analyzePowerFlow(jobId, options = {}) {
    const { metrics = ['voltage', 'power_angle', 'line_loading'] } = options;

    // 获取潮流结果
    const result = await this.client.getPowerFlowResults(jobId);
    const buses = result.buses || [];
    const branches = result.branches || [];

    const analysis = {
      type: 'power_flow',
      jobId,
      timestamp: new Date().toISOString(),
      metrics: {}
    };

    // 电压分析
    if (metrics.includes('voltage')) {
      analysis.metrics.voltage = this._analyzeVoltage(buses);
    }

    // 相角分析
    if (metrics.includes('power_angle')) {
      analysis.metrics.power_angle = this._analyzePowerAngle(buses);
    }

    // 线路负载分析
    if (metrics.includes('line_loading')) {
      analysis.metrics.line_loading = this._analyzeLineLoading(branches);
    }

    return analysis;
  }

  /**
   * 电压分析
   */
  _analyzeVoltage(buses) {
    if (!buses || buses.length === 0) {
      return { status: '无数据' };
    }

    const voltages = buses.map(b => b.Vm || 0);
    const min = Math.min(...voltages);
    const max = Math.max(...voltages);
    const avg = voltages.reduce((a, b) => a + b, 0) / voltages.length;

    const violations = [];
    for (const bus of buses) {
      const vm = bus.Vm || 0;
      if (vm < 0.95 || vm > 1.05) {
        violations.push({
          busId: bus.Bus || bus.id,
          busName: bus.Bus || bus.name,
          voltage: vm,
          issue: vm < 0.95 ? '低电压' : '高电压'
        });
      }
    }

    return {
      min: min.toFixed(4),
      max: max.toFixed(4),
      avg: avg.toFixed(4),
      violations,
      status: violations.length === 0 ? '正常' : '存在越限'
    };
  }

  /**
   * 相角分析
   */
  _analyzePowerAngle(buses) {
    if (!buses || buses.length === 0) {
      return { status: '无数据' };
    }

    const angles = buses.map(b => b.Va || 0);
    const maxAngle = Math.max(...angles.map(a => Math.abs(a)));

    return {
      maxAngle: maxAngle.toFixed(2),
      status: maxAngle < 45 ? '正常' : '相角过大'
    };
  }

  /**
   * 线路负载分析
   */
  _analyzeLineLoading(branches) {
    if (!branches || branches.length === 0) {
      return { status: '无数据' };
    }

    const overloads = [];
    for (const branch of branches) {
      const pij = Math.abs(branch.Pij || 0);
      // 假设额定容量为 100MW（实际应从参数获取）
      const loading = pij / 100 * 100;
      if (loading > 100) {
        overloads.push({
          branchId: branch.id,
          branchName: branch.Branch,
          loading: loading.toFixed(1) + '%'
        });
      }
    }

    return {
      overloads,
      status: overloads.length === 0 ? '正常' : '存在过载'
    };
  }

  /**
   * 安全性分析
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 安全性分析报告
   */
  async analyzeSecurity(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    const buses = result.buses || [];
    const branches = result.branches || [];

    const security = {
      type: 'security',
      jobId,
      timestamp: new Date().toISOString(),
      issues: [],
      status: '安全'
    };

    // 检查电压安全
    for (const bus of buses) {
      const vm = bus.Vm || 0;
      if (vm < 0.9 || vm > 1.1) {
        security.issues.push({
          type: 'voltage_violation',
          severity: vm < 0.85 || vm > 1.15 ? 'critical' : 'high',
          location: bus.id,
          value: vm
        });
      }
    }

    // 检查线路过载（简化判断）
    for (const branch of branches) {
      const pij = Math.abs(branch.Pij || 0);
      if (pij > 100) { // 假设额定 100MW
        security.issues.push({
          type: 'line_overload',
          severity: pij > 120 ? 'critical' : 'high',
          location: branch.id,
          value: pij
        });
      }
    }

    if (security.issues.length > 0) {
      security.status = '存在安全问题';
      security.criticalCount = security.issues.filter(i => i.severity === 'critical').length;
      security.highCount = security.issues.filter(i => i.severity === 'high').length;
    }

    return security;
  }

  /**
   * 电磁暂态结果分析
   *
   * @param {string} jobId - 任务 ID
   * @param {number} plotIndex - 输出分组索引
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 分析报告
   */
  async analyzeEMT(jobId, plotIndex = 0, options = {}) {
    const { channels = [] } = options;

    const result = await this.client.getEMTResults(jobId, plotIndex);

    return {
      type: 'emt',
      jobId,
      plotIndex,
      timestamp: new Date().toISOString(),
      channels: result.channels || [],
      channelData: result.channel_data || {},
      summary: this._summarizeEMTData(result.channel_data, channels)
    };
  }

  /**
   * 汇总电磁暂态数据
   */
  _summarizeEMTData(channelData, channels) {
    const summary = {};

    for (const [name, data] of Object.entries(channelData || {})) {
      if (channels.length === 0 || channels.includes(name)) {
        const values = data?.y || [];
        if (values.length > 0) {
          summary[name] = {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            samples: values.length
          };
        }
      }
    }

    return summary;
  }

  /**
   * 对比分析
   *
   * @param {Array} jobIds - 任务 ID 列表
   * @param {Array} metrics - 要对比的指标
   * @returns {Promise<Object>} 对比分析结果
   */
  async compareSimulations(jobIds, metrics = ['voltage', 'power_loss']) {
    const comparison = {
      type: 'comparison',
      timestamp: new Date().toISOString(),
      simulations: [],
      metrics: {}
    };

    for (const jobId of jobIds) {
      try {
        const result = await this.client.getPowerFlowResults(jobId);
        comparison.simulations.push({
          jobId,
          results: result
        });
      } catch (e) {
        comparison.simulations.push({
          jobId,
          error: e.message
        });
      }
    }

    // 指标对比
    for (const metric of metrics) {
      comparison.metrics[metric] = comparison.simulations
        .filter(s => s.results)
        .map(s => ({
          jobId: s.jobId,
          value: this._extractMetric(s.results, metric)
        }));
    }

    return comparison;
  }

  /**
   * 提取特定指标
   */
  _extractMetric(results, metric) {
    switch (metric) {
      case 'voltage':
        return {
          min: Math.min(...(results.buses?.map(b => b.Vm) || [0])),
          max: Math.max(...(results.buses?.map(b => b.Vm) || [0])),
          avg: (results.buses?.reduce((a, b) => a + (b.Vm || 0), 0) || 0) / (results.buses?.length || 1)
        };
      case 'power_loss':
        return (results.branches?.reduce((a, b) => a + (b.Ploss || 0), 0) || 0);
      default:
        return null;
    }
  }
}

module.exports = AnalyzeSkill;
