/**
 * Power Flow Analysis Skill - 潮流结果分析技能
 *
 * 用于分析电力系统潮流计算结果
 *
 * 基于 CloudPSS Python SDK:
 * - runner.result.getBuses() 获取节点数据
 * - runner.result.getBranches() 获取支路数据
 */

class PowerFlowAnalysisSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;

    // 默认越限阈值
    this.defaultLimits = {
      voltage: {
        min: 0.95,    // 电压下限 (p.u.)
        max: 1.05     // 电压上限 (p.u.)
      },
      lineLoading: {
        warning: 0.8,  // 线路负载警告阈值 (80%)
        critical: 1.0  // 线路负载严重阈值 (100%)
      },
      transformerLoading: {
        warning: 0.8,
        critical: 1.0
      }
    };
  }

  /**
   * 运行潮流计算
   *
   * @param {string} rid - 项目 rid
   * @param {number} jobIndex - 计算方案索引
   * @param {number} configIndex - 参数方案索引
   * @returns {Promise<Object>} 运行结果
   */
  async runPowerFlow(rid, jobIndex = 0, configIndex = 0) {
    // 运行仿真
    const job = await this.client.runSimulation(rid, jobIndex, configIndex);

    // 等待完成
    await this.client.waitForCompletion(job.job_id, 300);

    return {
      jobId: job.job_id,
      status: 'completed',
      rid
    };
  }

  /**
   * 获取节点电压结果
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 节点电压数据
   */
  async getBusVoltages(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    const buses = result.buses || [];

    // 处理表格格式数据
    const busData = this._parseBusTable(buses);

    return {
      count: busData.length,
      buses: busData,
      summary: {
        maxVoltage: Math.max(...busData.map(b => b.voltage || 0)),
        minVoltage: Math.min(...busData.map(b => b.voltage || Infinity)),
        avgVoltage: busData.reduce((s, b) => s + (b.voltage || 0), 0) / busData.length
      }
    };
  }

  /**
   * 解析节点表格数据
   */
  _parseBusTable(buses) {
    if (!buses || buses.length === 0) return [];

    // 处理表格格式 {columns: [...], data: [...]}
    if (buses.columns) {
      const columns = buses.columns.map(c => c.name || c);
      const data = buses.data || [];

      return data.map(row => {
        const bus = {};
        columns.forEach((col, i) => {
          bus[col] = row[i];
        });
        return {
          id: bus.Bus || bus.bus || bus.id,
          name: bus.Name || bus.name || bus.Bus,
          voltage: parseFloat(bus.Vm || bus.voltage || bus.V || 0),
          angle: parseFloat(bus.Va || bus.angle || 0),
          pGen: parseFloat(bus.Pgen || bus.Pg || 0),
          qGen: parseFloat(bus.Qgen || bus.Qg || 0),
          pLoad: parseFloat(bus.Pload || bus.Pd || 0),
          qLoad: parseFloat(bus.Qload || bus.Qd || 0),
          vBase: parseFloat(bus.Vbase || bus.VBase || 0)
        };
      });
    }

    // 处理数组格式
    return buses.map(bus => ({
      id: bus.Bus || bus.id,
      name: bus.Bus || bus.name || bus.id,
      voltage: parseFloat(bus.Vm || bus.voltage || 0),
      angle: parseFloat(bus.Va || bus.angle || 0),
      pGen: parseFloat(bus.Pgen || bus.Pg || 0),
      qGen: parseFloat(bus.Qgen || bus.Qg || 0),
      pLoad: parseFloat(bus.Pload || bus.Pd || 0),
      qLoad: parseFloat(bus.Qload || bus.Qd || 0),
      vBase: parseFloat(bus.Vbase || bus.VBase || 0)
    }));
  }

  /**
   * 获取支路潮流结果
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 支路潮流数据
   */
  async getBranchFlows(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    const branches = result.branches || [];

    // 处理表格格式数据
    const branchData = this._parseBranchTable(branches);

    // 计算统计信息
    const totalPLoss = branchData.reduce((s, b) => s + (b.pLoss || 0), 0);
    const totalQLoss = branchData.reduce((s, b) => s + (b.qLoss || 0), 0);

    return {
      count: branchData.length,
      branches: branchData,
      summary: {
        totalPLoss,
        totalQLoss,
        maxFlow: Math.max(...branchData.map(b => Math.abs(b.pij || 0)))
      }
    };
  }

  /**
   * 解析支路表格数据
   */
  _parseBranchTable(branches) {
    if (!branches || branches.length === 0) return [];

    // 处理表格格式
    if (branches.columns) {
      const columns = branches.columns.map(c => c.name || c);
      const data = branches.data || [];

      return data.map(row => {
        const branch = {};
        columns.forEach((col, i) => {
          branch[col] = row[i];
        });
        return {
          id: branch.Branch || branch.id,
          name: branch.Name || branch.name || branch.Branch,
          fromBus: branch.From || branch.fromBus,
          toBus: branch.To || branch.toBus,
          pij: parseFloat(branch.Pij || 0),
          qij: parseFloat(branch.Qij || 0),
          pji: parseFloat(branch.Pji || 0),
          qji: parseFloat(branch.Qji || 0),
          pLoss: parseFloat(branch.Ploss || branch.PLoss || 0),
          qLoss: parseFloat(branch.Qloss || branch.QLoss || 0),
          loading: parseFloat(branch.Loading || branch.loading || 0)
        };
      });
    }

    // 处理数组格式
    return branches.map(branch => ({
      id: branch.Branch || branch.id,
      name: branch.Name || branch.name || branch.Branch,
      fromBus: branch.From || branch.fromBus,
      toBus: branch.To || branch.toBus,
      pij: parseFloat(branch.Pij || 0),
      qij: parseFloat(branch.Qij || 0),
      pji: parseFloat(branch.Pji || 0),
      qji: parseFloat(branch.Qji || 0),
      pLoss: parseFloat(branch.Ploss || branch.PLoss || 0),
      qLoss: parseFloat(branch.Qloss || branch.QLoss || 0),
      loading: parseFloat(branch.Loading || branch.loading || 0)
    }));
  }

  /**
   * 获取发电机出力
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 发电机出力数据
   */
  async getGeneratorOutputs(jobId) {
    const busResult = await this.getBusVoltages(jobId);

    // 筛选有发电的节点
    const generators = busResult.buses.filter(b => b.pGen > 0 || b.qGen !== 0);

    // 计算总出力
    const totalP = generators.reduce((s, g) => s + g.pGen, 0);
    const totalQ = generators.reduce((s, g) => s + g.qGen, 0);

    // 按有功出力排序
    generators.sort((a, b) => b.pGen - a.pGen);

    return {
      count: generators.length,
      generators,
      summary: {
        totalP,
        totalQ,
        maxP: generators.length > 0 ? generators[0].pGen : 0
      }
    };
  }

  /**
   * 获取负荷结果
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 负荷数据
   */
  async getLoadResults(jobId) {
    const busResult = await this.getBusVoltages(jobId);

    // 筛选有负荷的节点
    const loads = busResult.buses.filter(b => b.pLoad > 0 || b.qLoad > 0);

    // 计算总负荷
    const totalP = loads.reduce((s, l) => s + l.pLoad, 0);
    const totalQ = loads.reduce((s, l) => s + l.qLoad, 0);

    // 按有功负荷排序
    loads.sort((a, b) => b.pLoad - a.pLoad);

    return {
      count: loads.length,
      loads,
      summary: {
        totalP,
        totalQ,
        maxP: loads.length > 0 ? loads[0].pLoad : 0
      }
    };
  }

  /**
   * 检查越限情况
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} limits - 越限阈值配置
   * @returns {Promise<Object>} 越限检查结果
   */
  async checkViolations(jobId, limits = {}) {
    // 合并默认阈值
    const effectiveLimits = {
      voltage: { ...this.defaultLimits.voltage, ...limits.voltage },
      lineLoading: { ...this.defaultLimits.lineLoading, ...limits.lineLoading },
      transformerLoading: { ...this.defaultLimits.transformerLoading, ...limits.transformerLoading }
    };

    // 获取结果
    const [busResult, branchResult] = await Promise.all([
      this.getBusVoltages(jobId),
      this.getBranchFlows(jobId)
    ]);

    // 检查电压越限
    const voltageViolations = [];
    for (const bus of busResult.buses) {
      if (bus.voltage < effectiveLimits.voltage.min) {
        voltageViolations.push({
          type: 'undervoltage',
          busId: bus.id,
          busName: bus.name,
          voltage: bus.voltage,
          limit: effectiveLimits.voltage.min,
          severity: bus.voltage < effectiveLimits.voltage.min - 0.05 ? 'critical' : 'warning'
        });
      } else if (bus.voltage > effectiveLimits.voltage.max) {
        voltageViolations.push({
          type: 'overvoltage',
          busId: bus.id,
          busName: bus.name,
          voltage: bus.voltage,
          limit: effectiveLimits.voltage.max,
          severity: bus.voltage > effectiveLimits.voltage.max + 0.05 ? 'critical' : 'warning'
        });
      }
    }

    // 检查线路过载
    const lineOverloads = [];
    for (const branch of branchResult.branches) {
      const loading = branch.loading || 0;
      if (loading > effectiveLimits.lineLoading.warning) {
        lineOverloads.push({
          branchId: branch.id,
          branchName: branch.name,
          fromBus: branch.fromBus,
          toBus: branch.toBus,
          loading,
          pij: branch.pij,
          severity: loading > effectiveLimits.lineLoading.critical ? 'critical' : 'warning'
        });
      }
    }

    // 按严重程度排序
    voltageViolations.sort((a, b) => b.severity === 'critical' ? 1 : -1);
    lineOverloads.sort((a, b) => b.loading - a.loading);

    return {
      hasViolations: voltageViolations.length > 0 || lineOverloads.length > 0,
      voltageViolations: {
        count: voltageViolations.length,
        critical: voltageViolations.filter(v => v.severity === 'critical').length,
        warning: voltageViolations.filter(v => v.severity === 'warning').length,
        details: voltageViolations
      },
      lineOverloads: {
        count: lineOverloads.length,
        critical: lineOverloads.filter(l => l.severity === 'critical').length,
        warning: lineOverloads.filter(l => l.severity === 'warning').length,
        details: lineOverloads
      },
      limits: effectiveLimits
    };
  }

  /**
   * 生成潮流分析报告
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 分析报告
   */
  async generateReport(jobId) {
    const [buses, branches, generators, loads, violations] = await Promise.all([
      this.getBusVoltages(jobId),
      this.getBranchFlows(jobId),
      this.getGeneratorOutputs(jobId),
      this.getLoadResults(jobId),
      this.checkViolations(jobId)
    ]);

    // 计算系统指标
    const powerBalance = {
      generation: generators.summary.totalP,
      load: loads.summary.totalP,
      loss: branches.summary.totalPLoss,
      balance: generators.summary.totalP - loads.summary.totalP - branches.summary.totalPLoss
    };

    return {
      jobId,
      timestamp: new Date().toISOString(),
      system: {
        busCount: buses.count,
        branchCount: branches.count,
        generatorCount: generators.count,
        loadCount: loads.count
      },
      voltage: {
        max: buses.summary.maxVoltage,
        min: buses.summary.minVoltage,
        avg: buses.summary.avgVoltage
      },
      power: {
        generation: generators.summary,
        load: loads.summary,
        loss: {
          pLoss: branches.summary.totalPLoss,
          qLoss: branches.summary.totalQLoss
        },
        balance: powerBalance
      },
      violations: {
        hasViolations: violations.hasViolations,
        voltageCount: violations.voltageViolations.count,
        lineOverloadCount: violations.lineOverloads.count
      },
      recommendations: this._generateRecommendations(violations, buses, branches)
    };
  }

  /**
   * 生成建议
   */
  _generateRecommendations(violations, buses, branches) {
    const recommendations = [];

    if (violations.voltageViolations.count > 0) {
      const undervoltage = violations.voltageViolations.details.filter(v => v.type === 'undervoltage');
      const overvoltage = violations.voltageViolations.details.filter(v => v.type === 'overvoltage');

      if (undervoltage.length > 0) {
        recommendations.push({
          type: 'voltage',
          priority: 'high',
          issue: `${undervoltage.length}个节点电压偏低`,
          suggestion: '考虑投入无功补偿设备或调整变压器分接头'
        });
      }

      if (overvoltage.length > 0) {
        recommendations.push({
          type: 'voltage',
          priority: 'medium',
          issue: `${overvoltage.length}个节点电压偏高`,
          suggestion: '考虑投入电抗器或调整发电机无功出力'
        });
      }
    }

    if (violations.lineOverloads.count > 0) {
      const critical = violations.lineOverloads.details.filter(l => l.severity === 'critical');
      recommendations.push({
        type: 'loading',
        priority: critical.length > 0 ? 'high' : 'medium',
        issue: `${violations.lineOverloads.count}条线路负载过高`,
        suggestion: '考虑负荷转移或线路增容'
      });
    }

    if (branches.summary.totalPLoss > 100) {
      recommendations.push({
        type: 'loss',
        priority: 'low',
        issue: `系统有功损耗${branches.summary.totalPLoss.toFixed(2)}MW`,
        suggestion: '考虑优化网络结构降低损耗'
      });
    }

    return recommendations;
  }
}

module.exports = PowerFlowAnalysisSkill;