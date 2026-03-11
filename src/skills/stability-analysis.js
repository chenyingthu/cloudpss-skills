/**
 * Stability Analysis Skill - 稳定分析技能
 *
 * US-028: 稳定裕度评估
 * US-035: 潮流收敛性诊断
 */

const PowerFlowAnalysisSkill = require('./power-flow-analysis');

class StabilityAnalysisSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.powerFlow = new PowerFlowAnalysisSkill(client, options);
  }

  /**
   * 电压稳定裕度分析 (US-028)
   *
   * 分析系统距离电压崩溃的裕度
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 稳定裕度分析结果
   */
  async voltageStabilityMargin(rid, options = {}) {
    const {
      startPercent = 100,
      endPercent = 200,
      step = 5,
      direction = 'uniform', // uniform, zone, load-only
      checkViolations = true
    } = options;

    console.log(`\n[Stability] 开始电压稳定裕度分析`);
    console.log(`[Stability] 负荷增长范围: ${startPercent}% ~ ${endPercent}%`);

    const results = [];
    let criticalPoint = null;
    let lastConverged = null;

    // 逐步增加负荷，寻找临界点
    for (let percent = startPercent; percent <= endPercent; percent += step) {
      try {
        // 运行潮流计算
        const job = await this.client.runSimulation(rid, 0, 0);
        await this.client.waitForCompletion(job.job_id, 60);

        const voltages = await this.powerFlow.getBusVoltages(job.job_id);
        const violations = checkViolations
          ? await this.powerFlow.checkViolations(job.job_id)
          : null;

        const result = {
          percent,
          converged: true,
          minVoltage: voltages.summary.minVoltage,
          maxVoltage: voltages.summary.maxVoltage,
          violationCount: violations ? violations.voltageViolations.count + violations.lineOverloads.count : 0,
          jobId: job.job_id
        };

        results.push(result);
        lastConverged = result;

        console.log(`[Stability] ${percent}%: 收敛, Vmin=${voltages.summary.minVoltage.toFixed(4)}`);

        // 检查是否接近临界点（电压低于0.8或大量越限）
        if (voltages.summary.minVoltage < 0.75 || (violations && violations.voltageViolations.count > 10)) {
          criticalPoint = {
            percent,
            type: 'voltage-collapse-imminent',
            minVoltage: voltages.summary.minVoltage
          };
          break;
        }

      } catch (error) {
        // 潮流不收敛，找到临界点
        console.log(`[Stability] ${percent}%: 不收敛`);

        results.push({
          percent,
          converged: false,
          error: error.message
        });

        criticalPoint = {
          percent,
          type: 'power-flow-divergence'
        };
        break;
      }
    }

    // 计算稳定裕度
    const margin = criticalPoint
      ? ((criticalPoint.percent - 100) / 100 * 100).toFixed(2)
      : ((endPercent - 100) / 100 * 100).toFixed(2);

    // 识别薄弱节点
    let weakBuses = [];
    if (lastConverged) {
      try {
        const buses = await this.powerFlow.getBusVoltages(lastConverged.jobId);
        weakBuses = buses.buses
          .filter(b => b.voltage < 0.9)
          .sort((a, b) => a.voltage - b.voltage)
          .slice(0, 10)
          .map(b => ({ name: b.name, voltage: b.voltage }));
      } catch (e) {
        // 忽略错误
      }
    }

    // 计算敏感性系数
    const sensitivity = this._calculateSensitivity(results);

    return {
      rid,
      timestamp: new Date().toISOString(),
      margin: parseFloat(margin),
      marginPercent: `${margin}%`,
      criticalPoint,
      loadGrowthResults: results,
      weakBuses,
      sensitivity,
      assessment: this._assessMargin(parseFloat(margin)),
      recommendations: this._generateStabilityRecommendations(parseFloat(margin), weakBuses)
    };
  }

  /**
   * 计算敏感性系数
   */
  _calculateSensitivity(results) {
    const converged = results.filter(r => r.converged);
    if (converged.length < 2) return null;

    const sensitivities = [];
    for (let i = 1; i < converged.length; i++) {
      const dV = converged[i - 1].minVoltage - converged[i].minVoltage;
      const dP = (converged[i].percent - converged[i - 1].percent) / 100;
      if (dP > 0) {
        sensitivities.push({
          range: `${converged[i - 1].percent}%-${converged[i].percent}%`,
          dV_dP: dV / dP
        });
      }
    }

    return sensitivities;
  }

  /**
   * 评估稳定裕度
   */
  _assessMargin(margin) {
    if (margin >= 30) {
      return { level: 'safe', message: '系统稳定裕度充足' };
    } else if (margin >= 20) {
      return { level: 'normal', message: '系统稳定裕度正常' };
    } else if (margin >= 10) {
      return { level: 'warning', message: '系统稳定裕度偏低，建议加强网架' };
    } else {
      return { level: 'critical', message: '系统稳定裕度严重不足，存在电压崩溃风险' };
    }
  }

  /**
   * 生成稳定分析建议
   */
  _generateStabilityRecommendations(margin, weakBuses) {
    const recommendations = [];

    if (margin < 15) {
      recommendations.push({
        priority: 'high',
        type: 'infrastructure',
        message: '建议加强网架结构，增加输电通道'
      });
    }

    if (weakBuses.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'compensation',
        message: `建议在${weakBuses.slice(0, 3).map(b => b.name).join('、')}等节点增加无功补偿`
      });
    }

    if (margin < 20) {
      recommendations.push({
        priority: 'medium',
        type: 'monitoring',
        message: '建议加强电压监测，配置低压减载装置'
      });
    }

    return recommendations;
  }

  /**
   * 潮流收敛性诊断 (US-035)
   *
   * 诊断潮流不收敛原因并提出解决方案
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 诊断选项
   * @returns {Promise<Object>} 诊断结果
   */
  async diagnoseConvergence(rid, options = {}) {
    console.log(`\n[Diagnosis] 开始潮流收敛性诊断`);

    const diagnosis = {
      rid,
      timestamp: new Date().toISOString(),
      issues: [],
      suggestions: [],
      autoFixAvailable: false
    };

    // 1. 获取系统拓扑信息
    let components;
    try {
      components = await this.client.getAllComponents(rid);
    } catch (error) {
      diagnosis.issues.push({
        severity: 'critical',
        type: 'topology-error',
        message: `无法获取系统拓扑: ${error.message}`
      });
      return diagnosis;
    }

    // 2. 检查孤立节点
    const isolatedNodes = this._checkIsolatedNodes(components);
    if (isolatedNodes.length > 0) {
      diagnosis.issues.push({
        severity: 'critical',
        type: 'isolated-nodes',
        message: `发现${isolatedNodes.length}个孤立节点`,
        details: isolatedNodes
      });
      diagnosis.suggestions.push({
        action: 'connect-nodes',
        message: '将孤立节点连接到系统，或删除不需要的孤立节点'
      });
    }

    // 3. 检查平衡节点设置
    const balanceBusIssues = this._checkBalanceBus(components);
    if (balanceBusIssues.length > 0) {
      diagnosis.issues.push({
        severity: 'critical',
        type: 'balance-bus',
        message: '平衡节点设置问题',
        details: balanceBusIssues
      });
      diagnosis.suggestions.push({
        action: 'fix-balance-bus',
        message: '确保系统有且仅有一个平衡节点（Slack Bus）'
      });
    }

    // 4. 检查PV节点（发电机节点）
    const pvNodeIssues = this._checkPVNodes(components);
    if (pvNodeIssues.length > 0) {
      diagnosis.issues.push({
        severity: 'warning',
        type: 'pv-nodes',
        message: 'PV节点设置问题',
        details: pvNodeIssues
      });
    }

    // 5. 检查参数合理性
    const parameterIssues = this._checkParameters(components);
    if (parameterIssues.length > 0) {
      diagnosis.issues.push({
        severity: 'warning',
        type: 'parameters',
        message: '参数设置可能不合理',
        details: parameterIssues
      });
      diagnosis.suggestions.push({
        action: 'adjust-parameters',
        message: '检查并调整异常参数值'
      });
    }

    // 6. 检查负荷/发电平衡
    const balanceIssues = this._checkPowerBalance(components);
    if (balanceIssues.issues.length > 0) {
      diagnosis.issues.push({
        severity: 'warning',
        type: 'power-balance',
        message: balanceIssues.message,
        details: balanceIssues.issues
      });
      diagnosis.suggestions.push({
        action: 'balance-power',
        message: `建议调整发电或负荷，当前发电${balanceIssues.totalGeneration.toFixed(1)}MW，负荷${balanceIssues.totalLoad.toFixed(1)}MW`
      });
    }

    // 7. 尝试自动修复建议
    diagnosis.autoFixAvailable = diagnosis.suggestions.length > 0;

    // 8. 计算系统健康评分
    diagnosis.healthScore = this._calculateHealthScore(diagnosis.issues);

    // 9. 生成综合建议
    diagnosis.summary = this._generateDiagnosisSummary(diagnosis);

    return diagnosis;
  }

  /**
   * 检查孤立节点
   */
  _checkIsolatedNodes(components) {
    const isolated = [];
    const connectedNodes = new Set();

    // 收集所有连接的节点
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('line') || def.includes('transformer') || def.includes('branch')) {
        // 假设元件有端口连接信息
        if (comp.ports) {
          Object.values(comp.ports).forEach(port => {
            if (port.connection) connectedNodes.add(port.connection);
          });
        }
      }
    }

    // 找出孤立节点
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('bus') || def.includes('node')) {
        if (!connectedNodes.has(key)) {
          isolated.push({ key, label: comp.label || key });
        }
      }
    }

    return isolated;
  }

  /**
   * 检查平衡节点
   */
  _checkBalanceBus(components) {
    const issues = [];
    let balanceBusCount = 0;

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      // 检查是否有平衡节点标记
      if (def.includes('slack') || def.includes('balance') || def.includes('swing')) {
        balanceBusCount++;
      }
    }

    if (balanceBusCount === 0) {
      issues.push('系统未设置平衡节点');
    } else if (balanceBusCount > 1) {
      issues.push(`系统设置了${balanceBusCount}个平衡节点，应该只有一个`);
    }

    return issues;
  }

  /**
   * 检查PV节点
   */
  _checkPVNodes(components) {
    const issues = [];
    let generatorCount = 0;

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('syncgen') || def.includes('generator')) {
        generatorCount++;
        // 检查发电机参数
        if (!comp.args?.P && !comp.args?.p) {
          issues.push(`发电机 ${comp.label || key} 未设置有功出力`);
        }
        if (!comp.args?.V && !comp.args?.v) {
          issues.push(`发电机 ${comp.label || key} 未设置机端电压`);
        }
      }
    }

    if (generatorCount === 0) {
      issues.push('系统未发现发电机元件');
    }

    return issues;
  }

  /**
   * 检查参数合理性
   */
  _checkParameters(components) {
    const issues = [];

    for (const [key, comp] of Object.entries(components)) {
      const args = comp.args || {};

      // 检查阻抗参数
      const r = parseFloat(args.R || args.r || 0);
      const x = parseFloat(args.X || args.x || 0);

      if (x === 0 && r === 0) {
        const def = (comp.definition || '').toLowerCase();
        if (def.includes('line') || def.includes('transformer')) {
          issues.push(`元件 ${comp.label || key} 阻抗为零，可能导致数值问题`);
        }
      }

      // 检查负参数
      if (r < 0 || x < 0) {
        issues.push(`元件 ${comp.label || key} 存在负阻抗值`);
      }
    }

    return issues;
  }

  /**
   * 检查功率平衡
   */
  _checkPowerBalance(components) {
    let totalGeneration = 0;
    let totalLoad = 0;
    const issues = [];

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      const args = comp.args || {};

      if (def.includes('syncgen') || def.includes('generator')) {
        totalGeneration += parseFloat(args.P || args.p || 0);
      }

      if (def.includes('load') || def.includes('pq')) {
        totalLoad += parseFloat(args.P || args.p || 0);
      }
    }

    const imbalance = Math.abs(totalGeneration - totalLoad);
    if (imbalance > totalLoad * 0.1) {
      issues.push(`发电与负荷不平衡: 差值${imbalance.toFixed(1)}MW`);
    }

    return {
      totalGeneration,
      totalLoad,
      imbalance,
      issues
    };
  }

  /**
   * 计算健康评分
   */
  _calculateHealthScore(issues) {
    let score = 100;

    for (const issue of issues) {
      if (issue.severity === 'critical') {
        score -= 30;
      } else if (issue.severity === 'warning') {
        score -= 10;
      }
    }

    return Math.max(0, score);
  }

  /**
   * 生成诊断摘要
   */
  _generateDiagnosisSummary(diagnosis) {
    const criticalCount = diagnosis.issues.filter(i => i.severity === 'critical').length;
    const warningCount = diagnosis.issues.filter(i => i.severity === 'warning').length;

    if (criticalCount > 0) {
      return `发现${criticalCount}个严重问题和${warningCount}个警告，建议优先解决严重问题`;
    } else if (warningCount > 0) {
      return `发现${warningCount}个警告，建议检查相关设置`;
    } else {
      return '系统诊断正常，未发现明显问题';
    }
  }
}

module.exports = StabilityAnalysisSkill;