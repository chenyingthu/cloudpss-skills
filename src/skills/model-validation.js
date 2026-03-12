/**
 * Model Validation Skill - 模型验证技能
 *
 * 用于在使用模型前进行调试和有效性验证
 *
 * 验证流程:
 * 1. 拓扑检查 - 孤立节点、平衡节点、参数
 * 2. 潮流收敛检查 - 运行仿真、检查越限
 * 3. EMT检查 [可选] - 短时仿真、日志检查
 *
 * @module skills/model-validation
 */

const StabilityAnalysisSkill = require('./stability-analysis');
const PowerFlowAnalysisSkill = require('./power-flow-analysis');

class ModelValidationSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.stabilityAnalysis = new StabilityAnalysisSkill(client, options);
    this.powerFlow = new PowerFlowAnalysisSkill(client, options);
  }

  /**
   * 全面验证
   *
   * @param {string} rid - 算例RID
   * @param {Object} options - 验证选项
   * @returns {Promise<Object>} 验证结果
   */
  async validate(rid, options = {}) {
    const {
      checkTopology = true,
      checkPowerFlow = true,
      checkEMT = false,
      emtDuration = 0.1,
      detailedReport = true
    } = options;

    console.log(`\n[ModelValidation] 开始全面验证: ${rid}`);
    console.log(`[ModelValidation] 检查项: 拓扑=${checkTopology}, 潮流=${checkPowerFlow}, EMT=${checkEMT}`);

    const result = {
      rid,
      timestamp: new Date().toISOString(),
      checks: {},
      overallStatus: 'valid',
      healthScore: 100,
      issues: [],
      recommendations: []
    };

    // Step 1: 拓扑检查
    if (checkTopology) {
      console.log(`\n[ModelValidation] Step 1: 拓扑检查...`);
      try {
        const topologyResult = await this._checkTopology(rid);
        result.checks.topology = topologyResult;

        if (!topologyResult.valid) {
          result.issues.push(...topologyResult.issues);
          result.healthScore -= topologyResult.penalty;
        }
      } catch (error) {
        result.checks.topology = { valid: false, error: error.message };
        result.issues.push({ severity: 'critical', type: 'topology-error', message: error.message });
        result.healthScore -= 30;
      }
    }

    // Step 2: 潮流收敛检查
    if (checkPowerFlow) {
      console.log(`\n[ModelValidation] Step 2: 潮流收敛检查...`);
      try {
        const pfResult = await this._checkPowerFlowConvergence(rid, options.powerFlowOptions);
        result.checks.powerFlow = pfResult;

        if (!pfResult.converged) {
          result.issues.push(...pfResult.issues);
          result.healthScore -= pfResult.penalty;
        }
      } catch (error) {
        result.checks.powerFlow = { converged: false, error: error.message };
        result.issues.push({ severity: 'critical', type: 'powerflow-error', message: error.message });
        result.healthScore -= 40;
      }
    }

    // Step 3: EMT检查 [可选]
    if (checkEMT) {
      console.log(`\n[ModelValidation] Step 3: EMT动态检查...`);
      try {
        const emtResult = await this._checkEMTDynamics(rid, emtDuration);
        result.checks.emt = emtResult;

        if (!emtResult.stable) {
          result.issues.push(...emtResult.issues);
          result.healthScore -= emtResult.penalty;
        }
      } catch (error) {
        result.checks.emt = { stable: false, error: error.message };
        result.issues.push({ severity: 'warning', type: 'emt-error', message: error.message });
        result.healthScore -= 10;
      }
    }

    // 计算最终状态
    result.healthScore = Math.max(0, result.healthScore);
    result.overallStatus = this._determineStatus(result.healthScore, result.issues);

    // 生成建议
    result.recommendations = this._generateRecommendations(result);

    console.log(`\n[ModelValidation] 验证完成: ${result.overallStatus} (健康度: ${result.healthScore})`);

    return result;
  }

  /**
   * 快速验证（仅拓扑+潮流）
   *
   * @param {string} rid - 算例RID
   * @returns {Promise<Object>} 验证结果
   */
  async quickValidate(rid) {
    return this.validate(rid, {
      checkTopology: true,
      checkPowerFlow: true,
      checkEMT: false,
      detailedReport: false
    });
  }

  /**
   * 深度验证（含EMT）
   *
   * @param {string} rid - 算例RID
   * @param {number} emtDuration - EMT仿真时长(秒)
   * @returns {Promise<Object>} 验证结果
   */
  async deepValidate(rid, emtDuration = 0.5) {
    return this.validate(rid, {
      checkTopology: true,
      checkPowerFlow: true,
      checkEMT: true,
      emtDuration,
      detailedReport: true
    });
  }

  /**
   * 仅验证拓扑
   *
   * @param {string} rid - 算例RID
   * @returns {Promise<Object>} 拓扑验证结果
   */
  async validateTopology(rid) {
    const result = {
      rid,
      timestamp: new Date().toISOString(),
      valid: true,
      issues: [],
      healthScore: 100
    };

    try {
      const topologyResult = await this._checkTopology(rid);
      Object.assign(result, topologyResult);
    } catch (error) {
      result.valid = false;
      result.error = error.message;
      result.healthScore = 0;
    }

    return result;
  }

  // ========== 内部方法 ==========

  /**
   * 拓扑检查（复用 diagnoseConvergence 逻辑）
   */
  async _checkTopology(rid) {
    console.log(`[ModelValidation] 检查拓扑结构...`);

    // 使用 StabilityAnalysisSkill 的 diagnoseConvergence 方法
    const diagnosis = await this.stabilityAnalysis.diagnoseConvergence(rid);

    const issues = [];
    let penalty = 0;

    // 提取问题
    for (const issue of diagnosis.issues) {
      issues.push({
        severity: issue.severity,
        type: issue.type,
        message: issue.message,
        details: issue.details
      });

      // 计算惩罚分数
      if (issue.severity === 'critical') {
        penalty += 25;
      } else if (issue.severity === 'warning') {
        penalty += 10;
      }
    }

    return {
      valid: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      penalty,
      healthScore: diagnosis.healthScore,
      suggestions: diagnosis.suggestions,
      summary: diagnosis.summary
    };
  }

  /**
   * 潮流收敛检查
   */
  async _checkPowerFlowConvergence(rid, options = {}) {
    console.log(`[ModelValidation] 运行潮流仿真...`);

    const result = {
      converged: false,
      issues: [],
      penalty: 0,
      details: {}
    };

    try {
      // 运行潮流计算
      const job = await this.client.runSimulation(rid, 0, 0);
      console.log(`[ModelValidation] 仿真任务已启动: ${job.job_id}`);

      // 等待完成
      await this.client.waitForCompletion(job.job_id, 120);
      console.log(`[ModelValidation] 仿真完成`);

      result.converged = true;
      result.details.jobId = job.job_id;

      // 获取潮流结果
      const busVoltages = await this.powerFlow.getBusVoltages(job.job_id);
      const branchFlows = await this.powerFlow.getBranchFlows(job.job_id);

      result.details.busCount = busVoltages.count;
      result.details.branchCount = branchFlows.count;
      result.details.minVoltage = busVoltages.summary.minVoltage;
      result.details.maxVoltage = busVoltages.summary.maxVoltage;
      result.details.totalLoss = branchFlows.summary.totalPLoss;

      // 检查越限
      const violations = await this.powerFlow.checkViolations(job.job_id, options.limits);

      if (violations.hasViolations) {
        result.details.violations = {
          voltageCount: violations.voltageViolations.count,
          overloadCount: violations.lineOverloads.count
        };

        // 添加越限问题
        if (violations.voltageViolations.count > 0) {
          const criticalVoltage = violations.voltageViolations.details.filter(v => v.severity === 'critical');
          if (criticalVoltage.length > 0) {
            result.issues.push({
              severity: 'critical',
              type: 'voltage-violation',
              message: `${criticalVoltage.length}个节点电压严重越限`,
              details: criticalVoltage.slice(0, 5)
            });
            penalty += 20;
          }

          const warningVoltage = violations.voltageViolations.details.filter(v => v.severity === 'warning');
          if (warningVoltage.length > 0) {
            result.issues.push({
              severity: 'warning',
              type: 'voltage-warning',
              message: `${warningVoltage.length}个节点电压轻微越限`
            });
            penalty += 5;
          }
        }

        if (violations.lineOverloads.count > 0) {
          const criticalOverload = violations.lineOverloads.details.filter(l => l.severity === 'critical');
          if (criticalOverload.length > 0) {
            result.issues.push({
              severity: 'critical',
              type: 'line-overload',
              message: `${criticalOverload.length}条线路严重过载`,
              details: criticalOverload.slice(0, 5)
            });
            penalty += 20;
          }

          const warningOverload = violations.lineOverloads.details.filter(l => l.severity === 'warning');
          if (warningOverload.length > 0) {
            result.issues.push({
              severity: 'warning',
              type: 'line-warning',
              message: `${warningOverload.length}条线路轻微过载`
            });
            penalty += 5;
          }
        }
      }

      // 检查电压范围
      if (result.details.minVoltage < 0.85) {
        result.issues.push({
          severity: 'warning',
          type: 'low-voltage',
          message: `最低电压 ${result.details.minVoltage.toFixed(4)} p.u. 偏低`
        });
        penalty += 10;
      }

      if (result.details.maxVoltage > 1.15) {
        result.issues.push({
          severity: 'warning',
          type: 'high-voltage',
          message: `最高电压 ${result.details.maxVoltage.toFixed(4)} p.u. 偏高`
        });
        penalty += 10;
      }

    } catch (error) {
      // 仿真失败
      result.converged = false;
      result.issues.push({
        severity: 'critical',
        type: 'simulation-failed',
        message: `潮流计算失败: ${error.message}`
      });
      penalty = 40;
    }

    result.penalty = penalty;
    return result;
  }

  /**
   * EMT动态检查
   */
  async _checkEMTDynamics(rid, duration = 0.1) {
    console.log(`[ModelValidation] 运行EMT仿真 (${duration}s)...`);

    const result = {
      stable: false,
      issues: [],
      penalty: 0,
      details: {}
    };

    try {
      // 查找EMT计算方案
      const model = await this.client.fetchModel(rid);
      const jobs = model.jobs || [];
      let emtJobIndex = -1;

      for (let i = 0; i < jobs.length; i++) {
        const jobName = (jobs[i].name || '').toLowerCase();
        const jobRid = (jobs[i].rid || '').toLowerCase();
        if (jobName.includes('emtp') || jobName.includes('emt') ||
            jobRid.includes('emtp') || jobRid.includes('emt')) {
          emtJobIndex = i;
          break;
        }
      }

      if (emtJobIndex < 0) {
        console.log(`[ModelValidation] 未找到EMT计算方案，跳过EMT检查`);
        result.stable = true;
        result.details.skipped = true;
        result.details.reason = 'No EMT job found';
        return result;
      }

      // 运行EMT仿真
      const job = await this.client.runSimulation(rid, emtJobIndex, 0);
      console.log(`[ModelValidation] EMT仿真任务已启动: ${job.job_id}`);

      await this.client.waitForCompletion(job.job_id, 180);
      console.log(`[ModelValidation] EMT仿真完成`);

      result.stable = true;
      result.details.jobId = job.job_id;

      // 获取日志检查
      const logs = await this.client.getLogs(job.job_id);
      const errorLogs = logs.filter(log =>
        (log.level === 'error' || log.level === 'ERROR') &&
        !log.message.includes('converged') // 排除收敛信息中的error
      );

      if (errorLogs.length > 0) {
        result.issues.push({
          severity: 'warning',
          type: 'emt-errors',
          message: `EMT仿真发现${errorLogs.length}条错误日志`,
          details: errorLogs.slice(0, 3)
        });
        result.penalty += 10;
      }

      // 尝试获取EMT结果
      try {
        const emtResult = await this.client.getEMTResults(job.job_id, 0);
        result.details.channelCount = emtResult.channels?.length || 0;
      } catch (e) {
        console.log(`[ModelValidation] 无法获取EMT结果: ${e.message}`);
      }

    } catch (error) {
      result.stable = false;
      result.issues.push({
        severity: 'warning',
        type: 'emt-failed',
        message: `EMT仿真失败: ${error.message}`
      });
      result.penalty = 15;
    }

    return result;
  }

  /**
   * 确定整体状态
   */
  _determineStatus(healthScore, issues) {
    const criticalCount = issues.filter(i => i.severity === 'critical').length;

    if (criticalCount > 0 || healthScore < 50) {
      return 'invalid';
    } else if (healthScore < 70) {
      return 'warning';
    } else if (healthScore < 90) {
      return 'acceptable';
    } else {
      return 'valid';
    }
  }

  /**
   * 生成建议
   */
  _generateRecommendations(result) {
    const recommendations = [];

    // 拓扑问题建议
    const topologyIssues = result.issues.filter(i => i.type.startsWith('topology') || i.type === 'isolated-nodes');
    if (topologyIssues.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'topology',
        suggestion: '修复拓扑问题后再进行仿真分析'
      });
    }

    // 电压问题建议
    const voltageIssues = result.issues.filter(i => i.type.includes('voltage'));
    if (voltageIssues.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'voltage',
        suggestion: '调整无功补偿或变压器分接头，改善电压水平'
      });
    }

    // 过载问题建议
    const overloadIssues = result.issues.filter(i => i.type.includes('overload') || i.type.includes('load'));
    if (overloadIssues.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'loading',
        suggestion: '考虑负荷转移或线路增容，缓解过载问题'
      });
    }

    // 平衡节点问题建议
    const balanceIssues = result.issues.filter(i => i.type === 'balance-bus');
    if (balanceIssues.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'topology',
        suggestion: '确保系统有且仅有一个平衡节点(Slack Bus)'
      });
    }

    // 参数问题建议
    const paramIssues = result.issues.filter(i => i.type === 'parameters');
    if (paramIssues.length > 0) {
      recommendations.push({
        priority: 'low',
        category: 'parameters',
        suggestion: '检查并修正异常的元件参数值'
      });
    }

    // 整体建议
    if (result.healthScore < 70) {
      recommendations.push({
        priority: 'high',
        category: 'general',
        suggestion: '模型健康度较低，建议进行全面检查和修复后再使用'
      });
    }

    return recommendations;
  }

  /**
   * 生成验证报告
   *
   * @param {Object} validationResult - 验证结果
   * @param {string} format - 报告格式 ('markdown' | 'json')
   * @returns {string|Object} 报告内容
   */
  generateReport(validationResult, format = 'markdown') {
    if (format === 'json') {
      return validationResult;
    }

    const lines = [];
    lines.push('# 模型验证报告');
    lines.push(`\n**算例**: ${validationResult.rid}`);
    lines.push(`**时间**: ${validationResult.timestamp}`);
    lines.push(`**状态**: ${validationResult.overallStatus}`);
    lines.push(`**健康度**: ${validationResult.healthScore}/100`);

    // 检查项
    lines.push('\n## 检查项');
    for (const [name, check] of Object.entries(validationResult.checks)) {
      const status = check.valid !== undefined ? (check.valid ? '✅ 通过' : '❌ 失败') :
                     check.converged !== undefined ? (check.converged ? '✅ 收敛' : '❌ 不收敛') :
                     check.stable !== undefined ? (check.stable ? '✅ 稳定' : '⚠️ 不稳定') : '❓ 未知';
      lines.push(`- ${name}: ${status}`);
    }

    // 问题列表
    if (validationResult.issues.length > 0) {
      lines.push('\n## 发现的问题');
      for (const issue of validationResult.issues) {
        const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🟢';
        lines.push(`${icon} **${issue.type}**: ${issue.message}`);
      }
    }

    // 建议
    if (validationResult.recommendations.length > 0) {
      lines.push('\n## 建议');
      for (const rec of validationResult.recommendations) {
        lines.push(`- [${rec.priority}] ${rec.suggestion}`);
      }
    }

    return lines.join('\n');
  }
}

module.exports = ModelValidationSkill;