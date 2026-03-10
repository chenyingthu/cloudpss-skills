#!/usr/bin/env node

/**
 * Harmonic Analysis Skill - 谐波分析技能
 *
 * 用于分析电力系统电磁暂态仿真结果的谐波特性
 *
 * 功能包括:
 * - 总谐波畸变率 (THD) 计算
 * - 谐波含有率分析
 * - 频域阻抗扫描
 * - 谐波合规性检查 (GB/T 14549)
 *
 * 基于 CloudPSS Python SDK 和 FFT 分析器
 */

class HarmonicAnalysisSkill {
  /**
   * 创建谐波分析技能实例
   * @param {Object} client - CloudPSS 客户端实例
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * 分析电磁暂态仿真结果的谐波特性
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 分析选项
   * @param {string} options.channel - 通道名称 (如 'Ia', 'Vb', 'Uc' 等)
   * @param {number} options.fundamentalFreq - 基波频率 (Hz)，默认 50 Hz
   * @param {number} options.plotIndex - 输出分组索引，默认 0
   * @param {number} options.maxHarmonic - 最大分析谐波次数，默认 20
   * @returns {Promise<Object>} 谐波分析结果
   *
   * @example
   * const result = await harmonicSkill.analyzeHarmonic(jobId, {
   *   channel: 'Ia',
   *   fundamentalFreq: 50,
   *   maxHarmonic: 20
   * });
   * console.log(`THD: ${result.thd_pct.toFixed(2)}%`);
   */
  async analyzeHarmonic(jobId, options = {}) {
    const {
      channel,
      fundamentalFreq = 50.0,
      plotIndex = 0,
      maxHarmonic = 20
    } = options;

    if (!channel) {
      throw new Error('Channel is required for harmonic analysis');
    }

    // 调用 Python 层进行分析
    const result = await this.client.execPython('analyze_harmonic', [
      jobId,
      channel,
      String(fundamentalFreq),
      String(plotIndex)
    ]);

    // 验证结果
    if (!result || !result.fundamental_freq) {
      throw new Error('Harmonic analysis failed: invalid result');
    }

    // 添加分析元数据
    return {
      ...result,
      analysisType: 'harmonic',
      timestamp: new Date().toISOString(),
      options: {
        channel,
        fundamentalFreq,
        plotIndex,
        maxHarmonic
      }
    };
  }

  /**
   * 计算总谐波畸变率 (THD)
   *
   * THD = sqrt(sum of squares of all harmonic magnitudes) / fundamental magnitude
   * THD% = THD * 100
   *
   * @param {Object} channelData - 通道数据
   * @param {Array<number>} channelData.time - 时间数组 (秒)
   * @param {Array<number>} channelData.signal - 信号值数组
   * @param {number} channelData.samplingRate - 采样率 (Hz)，可选
   * @param {number} fundamentalFreq - 基波频率 (Hz)，默认 50 Hz
   * @returns {Promise<Object>} THD 计算结果
   *
   * @example
   * const thdResult = await harmonicSkill.calculateTHD({
   *   time: [0, 0.001, 0.002, ...],
   *   signal: [0, 0.5, 0.8, ...],
   *   samplingRate: 10000
   * }, 50);
   * console.log(`THD: ${thdResult.thd_pct.toFixed(2)}%`);
   */
  async calculateTHD(channelData, fundamentalFreq = 50.0) {
    if (!channelData || !channelData.time || !channelData.signal) {
      throw new Error('Channel data must include time and signal arrays');
    }

    if (channelData.time.length < 2 || channelData.signal.length < 2) {
      throw new Error('Insufficient data points for THD calculation');
    }

    // 准备信号数据
    const signalData = {
      time: channelData.time,
      signal: channelData.signal,
      sampling_rate: channelData.samplingRate
    };

    // 调用 Python 层计算 THD
    const result = await this.client.execPython('calculate_thd', [
      JSON.stringify(signalData),
      String(fundamentalFreq)
    ]);

    return {
      ...result,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 检查谐波是否符合 GB/T 14549 标准
   *
   * @param {Object} thdResult - THD 计算结果（来自 calculateTHD 或 analyzeHarmonic）
   * @param {Object} options - 检查选项
   * @param {string} options.standard - 标准名称，默认 "GB/T 14549"
   * @param {number} options.voltageLevel - 电压等级 (kV)，默认 10 kV
   * @returns {Promise<Object>} 合规性检查结果
   *
   * @example
   * const compliance = await harmonicSkill.checkCompliance(thdResult, {
   *   standard: 'GB/T 14549',
   *   voltageLevel: 10
   * });
   * console.log(`Overall Compliance: ${compliance.overall_compliance}`);
   * console.log(`Violations: ${compliance.violations_count}`);
   */
  async checkCompliance(thdResult, options = {}) {
    const {
      standard = 'GB/T 14549',
      voltageLevel = 10.0
    } = options;

    if (!thdResult || !thdResult.harmonic_magnitudes) {
      throw new Error('Invalid THD result for compliance check');
    }

    // 调用 Python 层检查合规性
    const result = await this.client.execPython('check_harmonic_compliance', [
      JSON.stringify(thdResult),
      standard,
      String(voltageLevel)
    ]);

    return {
      ...result,
      timestamp: new Date().toISOString(),
      input: {
        standard,
        voltageLevel
      }
    };
  }

  /**
   * 频域阻抗扫描分析
   *
   * 通过注入不同频率的小扰动信号，分析系统的频率响应特性
   * 用于检测谐振风险和系统稳定性
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 扫描选项
   * @param {number} options.minFreq - 最小扫描频率 (Hz)，默认 10 Hz
   * @param {number} options.maxFreq - 最大扫描频率 (Hz)，默认 5000 Hz
   * @param {number} options.numPoints - 扫描点数，默认 500
   * @returns {Promise<Object>} 阻抗扫描结果
   *
   * @example
   * const impedance = await harmonicSkill.impedanceScan(jobId, {
   *   minFreq: 10,
   *   maxFreq: 5000,
   *   numPoints: 500
   * });
   * console.log(`Critical frequencies: ${impedance.critical_frequencies.length}`);
   */
  async impedanceScan(jobId, options = {}) {
    const {
      minFreq = 10,
      maxFreq = 5000,
      numPoints = 500
    } = options;

    if (minFreq <= 0 || maxFreq <= minFreq) {
      throw new Error('Invalid frequency range: minFreq must be positive and less than maxFreq');
    }

    if (numPoints < 10 || numPoints > 10000) {
      throw new Error('numPoints must be between 10 and 10000');
    }

    // 调用 Python 层进行阻抗扫描
    const result = await this.client.execPython('impedance_scan', [
      jobId,
      String(minFreq),
      String(maxFreq),
      String(numPoints)
    ]);

    return {
      ...result,
      timestamp: new Date().toISOString(),
      options: {
        minFreq,
        maxFreq,
        numPoints
      }
    };
  }

  /**
   * 生成谐波分析报告
   *
   * @param {Object} analysisResult - 谐波分析结果
   * @param {Object} complianceResult - 合规性检查结果
   * @param {Object} options - 报告选项
   * @param {string} options.format - 报告格式 ('json' | 'markdown' | 'text')
   * @returns {Object} 谐波分析报告
   */
  generateReport(analysisResult, complianceResult, options = {}) {
    const { format = 'json' } = options;

    const report = {
      type: 'harmonic_analysis',
      timestamp: new Date().toISOString(),
      summary: this._generateSummary(analysisResult, complianceResult),
      analysis: analysisResult,
      compliance: complianceResult,
      recommendations: this._generateRecommendations(analysisResult, complianceResult)
    };

    if (format === 'markdown') {
      return this._formatAsMarkdown(report);
    } else if (format === 'text') {
      return this._formatAsText(report);
    }

    return report;
  }

  /**
   * 生成分析摘要
   * @private
   */
  _generateSummary(analysis, compliance) {
    return {
      fundamentalFreq: analysis.fundamental_freq,
      fundamentalMagnitude: analysis.fundamental_magnitude,
      thd: analysis.thd,
      thdPct: analysis.thd_pct,
      totalHarmonics: analysis.harmonics?.length || 0,
      complianceStatus: compliance.overall_compliance ? '合规' : '不合规',
      violationsCount: compliance.violations_count || 0
    };
  }

  /**
   * 生成建议措施
   * @private
   */
  _generateRecommendations(analysis, compliance) {
    const recommendations = [];

    // THD 超标建议
    if (compliance.thd_compliance && !compliance.thd_compliance.compliant) {
      recommendations.push({
        priority: 'high',
        issue: '总谐波畸变率超标',
        suggestion: '建议安装有源或无源滤波器，降低 THD 至标准限值以内'
      });
    }

    // 主要谐波源分析
    if (analysis.harmonics && analysis.harmonics.length > 0) {
      const dominantHarmonics = analysis.harmonics
        .filter(h => h.order > 1 && h.magnitude_pct > 1)
        .sort((a, b) => b.magnitude_pct - a.magnitude_pct)
        .slice(0, 3);

      if (dominantHarmonics.length > 0) {
        const harmonicOrders = dominantHarmonics.map(h => `${h.order}次`).join(', ');
        recommendations.push({
          priority: 'medium',
          issue: `主要谐波成分：${harmonicOrders}`,
          suggestion: '针对主导谐波频率设计单调谐滤波器'
        });
      }
    }

    // 偶次谐波建议
    const evenHarmonics = analysis.harmonics?.filter(h => h.order > 1 && h.order % 2 === 0) || [];
    if (evenHarmonics.some(h => h.magnitude_pct > 0.5)) {
      recommendations.push({
        priority: 'medium',
        issue: '检测到偶次谐波',
        suggestion: '偶次谐波通常由不对称负荷或半波整流产生，建议检查负荷特性'
      });
    }

    // 添加合规性建议
    if (compliance.recommendations) {
      compliance.recommendations.forEach(rec => {
        recommendations.push({
          priority: 'medium',
          issue: '合规性建议',
          suggestion: rec
        });
      });
    }

    return recommendations;
  }

  /**
   * 格式化为 Markdown 报告
   * @private
   */
  _formatAsMarkdown(report) {
    const lines = [
      '# 谐波分析报告',
      '',
      `**生成时间**: ${report.timestamp}`,
      '',
      '## 分析摘要',
      '',
      `| 指标 | 数值 |`,
      `|------|------|`,
      `| 基波频率 | ${report.summary.fundamentalFreq} Hz |`,
      `| 基波幅值 | ${report.summary.fundamentalMagnitude.toFixed(4)} |`,
      `| THD | ${report.summary.thd.toFixed(4)} (${report.summary.thdPct.toFixed(2)}%) |`,
      `| 谐波次数 | ${report.summary.totalHarmonics} |`,
      `| 合规状态 | ${report.summary.complianceStatus} |`,
      `| 越限数量 | ${report.summary.violationsCount} |`,
      '',
      '## 合规性检查',
      '',
      `**标准**: ${report.compliance.standard}`,
      `**电压等级**: ${report.compliance.voltage_level} kV`,
      '',
      `**THD 合规性**: ${report.compliance.thd_compliance?.compliant ? '合格' : '不合格'}`,
      `- 实测值：${report.compliance.thd_compliance?.measured?.toFixed(2) || 'N/A'}%`,
      `- 限值：${report.compliance.thd_compliance?.limit || 'N/A'}%`,
      '',
    ];

    if (report.compliance.harmonic_violations?.length > 0) {
      lines.push('### 谐波越限');
      lines.push('');
      lines.push('| 次数 | 类型 | 实测值 (%) | 限值 (%) | 越限量 |');
      lines.push('|------|------|-----------|---------|--------|');
      report.compliance.harmonic_violations.forEach(v => {
        lines.push(`| ${v.order} | ${v.harmonic_type} | ${v.measured.toFixed(2)} | ${v.limit} | ${v.violation.toFixed(2)} |`);
      });
      lines.push('');
    }

    if (report.recommendations.length > 0) {
      lines.push('## 建议措施');
      lines.push('');
      report.recommendations.forEach((rec, i) => {
        lines.push(`${i + 1}. **[${rec.priority === 'high' ? '高' : '中'}优先级]** ${rec.issue}`);
        lines.push(`   - ${rec.suggestion}`);
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * 格式化为文本报告
   * @private
   */
  _formatAsText(report) {
    const lines = [
      '========================================',
      '         谐波分析报告',
      '========================================',
      `生成时间：${report.timestamp}`,
      '',
      '--- 分析摘要 ---',
      `基波频率：${report.summary.fundamentalFreq} Hz`,
      `基波幅值：${report.summary.fundamentalMagnitude.toFixed(4)}`,
      `THD: ${report.summary.thd.toFixed(4)} (${report.summary.thdPct.toFixed(2)}%)`,
      `谐波次数：${report.summary.totalHarmonics}`,
      `合规状态：${report.summary.complianceStatus}`,
      `越限数量：${report.summary.violationsCount}`,
      '',
      '--- 合规性检查 ---',
      `标准：${report.compliance.standard}`,
      `电压等级：${report.compliance.voltage_level} kV`,
    ];

    if (report.compliance.thd_compliance) {
      const tc = report.compliance.thd_compliance;
      lines.push(`THD 合规性：${tc.compliant ? '合格' : '不合格'}`);
      lines.push(`  实测值：${tc.measured?.toFixed(2) || 'N/A'}%`);
      lines.push(`  限值：${tc.limit || 'N/A'}%`);
    }

    if (report.recommendations.length > 0) {
      lines.push('');
      lines.push('--- 建议措施 ---');
      report.recommendations.forEach((rec, i) => {
        lines.push(`${i + 1}. [${rec.priority === 'high' ? '高' : '中'}优先级] ${rec.issue}`);
        lines.push(`   ${rec.suggestion}`);
      });
    }

    lines.push('');
    lines.push('========================================');

    return lines.join('\n');
  }
}

module.exports = HarmonicAnalysisSkill;
