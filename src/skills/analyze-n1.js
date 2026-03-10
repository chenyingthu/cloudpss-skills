/**
 * N-1 Contingency Scan Skill
 *
 * N-1 安全分析技能：自动遍历所有线路/变压器开断故障
 * 识别电压越限、线路过载，生成扫描报告
 *
 * 功能：
 * - 并行执行多个 N-1 场景
 * - 电压越限检查
 * - 线路过载检查
 * - 严重程度评估
 * - 生成调度友好的报告
 */

class N1ContingencySkill {
  constructor(client) {
    this.client = client;
    this.pyBridge = client.bridge;
  }

  /**
   * 执行 N-1 扫描
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 扫描选项
   * @param {string[]} options.elements - 要扫描的元件 ID 列表（可选，默认扫描所有）
   * @param {string} options.jobType - 计算方案类型 ('powerFlow', 'emtp')
   * @param {Object} options.limits - 越限判断配置
   * @param {number} options.maxConcurrency - 最大并行度（默认 5）
   * @returns {Promise<Object>} 扫描结果
   */
  async scan(rid, options = {}) {
    const {
      elements = null,
      jobType = 'powerFlow',
      limits = {
        voltage: { min: 0.95, max: 1.05, critical_min: 0.90, critical_max: 1.10 },
        loading: { threshold: 100, critical_threshold: 120, default_rate: 100 }
      },
      maxConcurrency = 5
    } = options;

    console.log(`[N1Scan] 开始 N-1 扫描，项目：${rid}`);
    console.log(`[N1Scan] 扫描模式：${jobType}, 并行度：${maxConcurrency}`);

    // 运行 contingency scan
    const scanResults = await this.pyBridge.runContingencyScan(rid, jobType, elements);

    console.log(`[N1Scan] 完成 ${scanResults.length} 个场景扫描`);

    // 对每个场景进行越限分析
    const analyzedResults = [];
    for (const result of scanResults) {
      const analyzed = await this._analyzeScenario(result, limits);
      analyzedResults.push(analyzed);
    }

    // 生成汇总报告
    const summary = this._generateSummary(analyzedResults);

    return {
      rid,
      timestamp: new Date().toISOString(),
      totalScenes: analyzedResults.length,
      summary,
      results: analyzedResults
    };
  }

  /**
   * 分析单个 N-1 场景
   */
  async _analyzeScenario(scanResult, limits) {
    const analyzed = { ...scanResult };

    if (scanResult.status !== 'success') {
      analyzed.severity = 'critical';
      analyzed.violations = {
        voltage: [],
        line_overload: [],
        convergence_failure: scanResult.status === 'convergence_error'
      };
      return analyzed;
    }

    // 电压越限检查
    const voltageViolations = await this.pyBridge.checkVoltageViolations(
      scanResult.buses,
      limits.voltage
    );

    // 线路过载检查
    const lineOverloads = await this.pyBridge.checkLineOverloads(
      scanResult.branches,
      limits.loading
    );

    // 合并越限信息
    analyzed.violations = {
      voltage: voltageViolations,
      line_overload: lineOverloads,
      convergence_failure: false
    };

    // 评估严重程度
    analyzed.severity = this._evaluateSeverity(voltageViolations, lineOverloads);

    return analyzed;
  }

  /**
   * 评估严重程度
   */
  _evaluateSeverity(voltageViolations, lineOverloads) {
    const criticalVoltage = voltageViolations.filter(v => v.severity === 'critical').length;
    const criticalOverload = lineOverloads.filter(v => v.severity === 'critical').length;

    if (criticalVoltage > 0 || criticalOverload > 0) {
      return 'critical';
    }

    const warningVoltage = voltageViolations.filter(v => v.severity === 'warning').length;
    const warningOverload = lineOverloads.filter(v => v.severity === 'warning').length;

    if (warningVoltage > 0 || warningOverload > 0) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * 生成汇总报告
   */
  _generateSummary(results) {
    const total = results.length;
    const success = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const convergenceErrors = results.filter(r => r.status === 'convergence_error').length;

    const critical = results.filter(r => r.severity === 'critical').length;
    const warning = results.filter(r => r.severity === 'warning').length;
    const normal = results.filter(r => r.severity === 'normal').length;

    // 最严重的 N-1 场景
    const criticalScenes = results
      .filter(r => r.severity === 'critical')
      .sort((a, b) => {
        const aViolations = (a.violations?.voltage?.length || 0) + (a.violations?.line_overload?.length || 0);
        const bViolations = (b.violations?.voltage?.length || 0) + (b.violations?.line_overload?.length || 0);
        return bViolations - aViolations;
      })
      .slice(0, 10);

    // 收敛率
    const convergenceRate = success / total * 100;

    return {
      total,
      success,
      failed,
      convergenceErrors,
      convergenceRate: convergenceRate.toFixed(1) + '%',
      severity: {
        critical,
        warning,
        normal
      },
      criticalScenes: criticalScenes.map(s => ({
        element_id: s.element_id,
        element_name: s.element_name,
        element_type: s.element_type,
        voltage_violations: s.violations?.voltage?.length || 0,
        line_overloads: s.violations?.line_overload?.length || 0
      }))
    };
  }

  /**
   * 仅扫描线路 N-1
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 扫描选项
   * @returns {Promise<Object>} 扫描结果
   */
  async scanLines(rid, options = {}) {
    console.log(`[N1Scan] 开始线路 N-1 扫描，项目：${rid}`);

    // 获取拓扑，过滤出线路
    const topology = await this.pyBridge.getTopology(rid, 'powerFlow');
    const lineElements = [];

    for (const [key, comp] of Object.entries(topology.components)) {
      const compType = (comp.type || comp.definition || '').toLowerCase();
      if (compType.includes('line') || compType.includes('branch')) {
        lineElements.push(key);
      }
    }

    console.log(`[N1Scan] 发现 ${lineElements.length} 条线路`);

    return this.scan(rid, { ...options, elements: lineElements });
  }

  /**
   * 仅扫描变压器 N-1
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 扫描选项
   * @returns {Promise<Object>} 扫描结果
   */
  async scanTransformers(rid, options = {}) {
    console.log(`[N1Scan] 开始变压器 N-1 扫描，项目：${rid}`);

    // 获取拓扑，过滤出变压器
    const topology = await this.pyBridge.getTopology(rid, 'powerFlow');
    const transformerElements = [];

    for (const [key, comp] of Object.entries(topology.components)) {
      const compType = (comp.type || comp.definition || '').toLowerCase();
      if (compType.includes('transformer') || compType.includes('xfmr')) {
        transformerElements.push(key);
      }
    }

    console.log(`[N1Scan] 发现 ${transformerElements.length} 台变压器`);

    return this.scan(rid, { ...options, elements: transformerElements });
  }

  /**
   * 生成详细的 N-1 扫描报告
   *
   * @param {Object} scanResults - 扫描结果
   * @returns {string} 格式化的报告文本
   */
  generateReport(scanResults) {
    const lines = [];
    const { summary, results, rid, timestamp } = scanResults;

    lines.push('=' .repeat(60));
    lines.push('N-1 安全扫描报告');
    lines.push('=' .repeat(60));
    lines.push(`项目：${rid}`);
    lines.push(`时间：${timestamp}`);
    lines.push('');

    // 汇总信息
    lines.push('-'.repeat(60));
    lines.push('扫描汇总');
    lines.push('-'.repeat(60));
    lines.push(`扫描场景总数：${summary.total}`);
    lines.push(`成功收敛：${summary.success} (${summary.convergenceRate})`);
    lines.push(`失败：${summary.failed}`);
    lines.push(`收敛失败：${summary.convergenceErrors}`);
    lines.push('');
    lines.push('严重程度分布：');
    lines.push(`  - 严重 (Critical): ${summary.severity.critical}`);
    lines.push(`  - 警告 (Warning): ${summary.severity.warning}`);
    lines.push(`  - 正常 (Normal): ${summary.severity.normal}`);
    lines.push('');

    // 严重场景详情
    if (summary.criticalScenes && summary.criticalScenes.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('严重 N-1 场景 (Top 10)');
      lines.push('-'.repeat(60));

      summary.criticalScenes.forEach((scene, idx) => {
        lines.push(`${idx + 1}. ${scene.element_name} (${scene.element_id})`);
        lines.push(`   类型：${scene.element_type}`);
        lines.push(`   电压越限：${scene.voltage_violations} 个`);
        lines.push(`   线路过载：${scene.line_overloads} 个`);
      });
      lines.push('');
    }

    // 详细结果
    lines.push('-'.repeat(60));
    lines.push('详细扫描结果');
    lines.push('-'.repeat(60));

    // 按严重程度排序
    const sortedResults = [...results].sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, normal: 2, failed: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    for (const result of sortedResults) {
      const statusIcon = {
        normal: '[OK]',
        warning: '[WARN]',
        critical: '[CRIT]',
        failed: '[FAIL]'
      }[result.severity] || '[?]';

      lines.push(`${statusIcon} ${result.element_name} (${result.element_id}) - ${result.element_type}`);

      if (result.status !== 'success') {
        lines.push(`    状态：${result.status}${result.error ? ` - ${result.error}` : ''}`);
      } else if (result.severity !== 'normal') {
        if (result.violations?.voltage?.length > 0) {
          lines.push(`    电压越限：${result.violations.voltage.length} 个`);
          result.violations.voltage.slice(0, 3).forEach(v => {
            lines.push(`      - ${v.bus_name}: ${v.voltage.toFixed(3)} pu (${v.violation_type}, ${v.severity})`);
          });
        }
        if (result.violations?.line_overload?.length > 0) {
          lines.push(`    线路过载：${result.violations.line_overload.length} 个`);
          result.violations.line_overload.slice(0, 3).forEach(l => {
            lines.push(`      - ${l.branch_name}: ${l.loading.toFixed(1)}% (${l.severity})`);
          });
        }
      }
    }

    lines.push('');
    lines.push('=' .repeat(60));
    lines.push('报告结束');
    lines.push('=' .repeat(60));

    return lines.join('\n');
  }
}

module.exports = N1ContingencySkill;
