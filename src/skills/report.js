/**
 * Report Skill - 报告生成技能
 *
 * 用于生成电力系统仿真分析报告
 *
 * 基于 CloudPSS Python SDK:
 * - runner.result.getBuses() 获取节点数据
 * - runner.result.getBranches() 获取支路数据
 * - runner.result.getPlots() 获取曲线数据
 */

const fs = require('fs').promises;

class ReportSkill {
  constructor(client) {
    this.client = client;
  }

  /**
   * 生成分析报告
   *
   * @param {Object} options - 报告选项
   * @param {string} options.jobId - 任务 ID
   * @param {string} options.type - 报告类型 (power_flow, security, emt)
   * @param {string} options.format - 输出格式 (markdown, html, json)
   * @param {string} options.output - 输出文件路径
   * @returns {Promise<Object>} 报告生成结果
   */
  async generate(options) {
    const {
      jobId,
      type = 'power_flow',
      format = 'markdown',
      output
    } = options;

    // 生成报告内容
    let content;
    switch (type) {
      case 'power_flow':
        content = await this._generatePowerFlowReport(jobId);
        break;
      case 'security':
        content = await this._generateSecurityReport(jobId);
        break;
      case 'emt':
        content = await this._generateEMTReport(jobId);
        break;
      default:
        content = await this._generateGenericReport(jobId);
    }

    // 格式化输出
    const formatted = this._formatContent(content, format);

    // 输出到文件或返回内容
    if (output) {
      await this._writeFile(output, formatted);
      return {
        success: true,
        file: output,
        format: format
      };
    }

    return {
      success: true,
      content: formatted,
      format: format
    };
  }

  /**
   * 生成潮流分析报告
   */
  async _generatePowerFlowReport(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    const buses = result.buses || [];
    const branches = result.branches || [];

    return {
      title: '潮流分析报告',
      timestamp: new Date().toISOString(),
      jobId,
      sections: [
        {
          title: '系统概况',
          content: {
            '母线数量': buses.length,
            '支路数量': branches.length,
            '发电机数量': buses.filter(b => b.Pgen !== 0).length,
            '负荷数量': buses.filter(b => b.Pload !== 0).length
          }
        },
        {
          title: '电压统计',
          content: this._summarizeVoltage(buses)
        },
        {
          title: '功率平衡',
          content: this._summarizePower(buses, branches)
        },
        {
          title: '电压越限检查',
          content: this._checkVoltageViolations(buses)
        },
        {
          title: '支路过载检查',
          content: this._checkBranchOverloads(branches)
        }
      ]
    };
  }

  /**
   * 生成安全性分析报告
   */
  async _generateSecurityReport(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    const buses = result.buses || [];
    const branches = result.branches || [];

    const violations = this._getAllViolations(buses, branches);

    return {
      title: '安全性分析报告',
      timestamp: new Date().toISOString(),
      jobId,
      sections: [
        {
          title: '安全评估总览',
          content: {
            '安全状态': violations.length === 0 ? '✓ 安全' : '⚠ 存在风险',
            '问题总数': violations.length,
            '严重问题': violations.filter(v => v.severity === 'critical').length,
            '一般问题': violations.filter(v => v.severity === 'high').length
          }
        },
        {
          title: '电压越限详情',
          content: violations.filter(v => v.type === 'voltage')
        },
        {
          title: '支路过载详情',
          content: violations.filter(v => v.type === 'overload')
        },
        {
          title: '建议措施',
          content: this._generateRecommendations(violations)
        }
      ]
    };
  }

  /**
   * 生成电磁暂态分析报告
   */
  async _generateEMTReport(jobId, plotIndex = 0) {
    const result = await this.client.getEMTResults(jobId, plotIndex);

    return {
      title: '电磁暂态仿真报告',
      timestamp: new Date().toISOString(),
      jobId,
      plotIndex,
      sections: [
        {
          title: '输出通道概况',
          content: {
            '通道数量': result.channels?.length || 0,
            '通道列表': result.channels || []
          }
        },
        {
          title: '数据统计',
          content: this._summarizeChannels(result.channel_data)
        }
      ]
    };
  }

  /**
   * 生成通用报告
   */
  async _generateGenericReport(jobId) {
    return {
      title: '仿真报告',
      timestamp: new Date().toISOString(),
      jobId,
      sections: [
        {
          title: '仿真信息',
          content: {
            '任务 ID': jobId,
            '生成时间': new Date().toISOString()
          }
        },
        {
          title: '说明',
          content: '请使用具体的报告类型：power_flow, security, emt'
        }
      ]
    };
  }

  /**
   * 格式化内容
   */
  _formatContent(content, format) {
    switch (format) {
      case 'markdown':
        return this._toMarkdown(content);
      case 'html':
        return this._toHtml(content);
      case 'json':
        return JSON.stringify(content, null, 2);
      default:
        return this._toMarkdown(content);
    }
  }

  /**
   * 转换为 Markdown 格式
   */
  _toMarkdown(content) {
    let md = `# ${content.title}\n\n`;
    md += `*生成时间：${content.timestamp}*\n\n`;
    if (content.jobId) {
      md += `*任务 ID*: ${content.jobId}\n\n`;
    }

    for (const section of content.sections) {
      md += `## ${section.title}\n\n`;

      if (typeof section.content === 'string') {
        md += `${section.content}\n\n`;
      } else if (Array.isArray(section.content)) {
        if (section.content.length === 0) {
          md += '无\n\n';
        } else {
          for (const item of section.content) {
            md += this._objectToMarkdown(item);
          }
        }
      } else if (typeof section.content === 'object') {
        md += this._objectToMarkdown(section.content);
      }
    }

    return md;
  }

  /**
   * 对象转 Markdown
   */
  _objectToMarkdown(obj) {
    if (!obj) return '';
    let md = '';
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        md += `- **${key}**: ${value.join(', ')}\n`;
      } else if (typeof value === 'object') {
        md += `- **${key}**: ${JSON.stringify(value)}\n`;
      } else {
        md += `- **${key}**: ${value}\n`;
      }
    }
    return md;
  }

  /**
   * 转换为 HTML 格式
   */
  _toHtml(content) {
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${content.title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; background: #f8f9fa; padding: 10px; }
    .meta { color: #888; font-style: italic; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background-color: #f5f5f5; font-weight: bold; }
    .safe { color: green; }
    .warning { color: orange; }
    .danger { color: red; }
  </style>
</head>
<body>
`;

    html += `<h1>${content.title}</h1>\n`;
    html += `<p class="meta">生成时间：${content.timestamp}`;
    if (content.jobId) {
      html += ` | 任务 ID: ${content.jobId}`;
    }
    html += '</p>\n';

    for (const section of content.sections) {
      html += `<h2>${section.title}</h2>\n`;

      if (typeof section.content === 'string') {
        html += `<p>${section.content}</p>\n`;
      } else if (Array.isArray(section.content)) {
        if (section.content.length === 0) {
          html += '<p>无</p>\n';
        } else {
          html += '<table>\n';
          for (const item of section.content) {
            html += this._objectToHtmlRow(item);
          }
          html += '</table>\n';
        }
      } else if (typeof section.content === 'object') {
        html += '<table>\n';
        for (const [key, value] of Object.entries(section.content)) {
          html += `<tr><th>${key}</th><td>${value}</td></tr>\n`;
        }
        html += '</table>\n';
      }
    }

    html += '</body></html>';
    return html;
  }

  /**
   * 对象转 HTML 行
   */
  _objectToHtmlRow(obj) {
    if (!obj) return '';
    let html = '<tr>';
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object') {
        html += `<td>${key}: ${JSON.stringify(value)}</td>`;
      } else {
        html += `<td><strong>${key}:</strong> ${value}</td>`;
      }
    }
    html += '</tr>\n';
    return html;
  }

  /**
   * 写入文件
   */
  async _writeFile(path, content) {
    await fs.writeFile(path, content, 'utf-8');
  }

  // =====================================================
  // 辅助方法
  // =====================================================

  _summarizeVoltage(buses) {
    if (!buses || buses.length === 0) return { '状态': '无数据' };

    const voltages = buses.map(b => b.Vm || 0);
    return {
      '最低电压': Math.min(...voltages).toFixed(4) + ' pu',
      '最高电压': Math.max(...voltages).toFixed(4) + ' pu',
      '平均电压': (voltages.reduce((a, b) => a + b, 0) / voltages.length).toFixed(4) + ' pu',
      '母线数量': buses.length
    };
  }

  _summarizePower(buses, branches) {
    const totalPgen = buses.reduce((sum, b) => sum + (b.Pgen || 0), 0);
    const totalQgen = buses.reduce((sum, b) => sum + (b.Qgen || 0), 0);
    const totalPload = buses.reduce((sum, b) => sum + (b.Pload || 0), 0);
    const totalQload = buses.reduce((sum, b) => sum + (b.Qload || 0), 0);
    const totalPloss = branches.reduce((sum, b) => sum + (b.Ploss || 0), 0);
    const totalQloss = branches.reduce((sum, b) => sum + (b.Qloss || 0), 0);

    return {
      '总有功出力': totalPgen.toFixed(2) + ' MW',
      '总无功出力': totalQgen.toFixed(2) + ' MVar',
      '总有功负荷': totalPload.toFixed(2) + ' MW',
      '总无功负荷': totalQload.toFixed(2) + ' MVar',
      '总有功损耗': totalPloss.toFixed(2) + ' MW',
      '总无功损耗': totalQloss.toFixed(2) + ' MVar'
    };
  }

  _checkVoltageViolations(buses) {
    const violations = [];
    for (const bus of buses) {
      const vm = bus.Vm || 0;
      if (vm < 0.95 || vm > 1.05) {
        violations.push({
          '母线': bus.name || bus.id,
          '电压': vm.toFixed(4) + ' pu',
          '越限类型': vm < 0.95 ? '低电压' : '高电压'
        });
      }
    }
    return violations.length === 0 ? { '状态': '✓ 无越限' } : violations;
  }

  _checkBranchOverloads(branches) {
    const overloads = [];
    for (const branch of branches) {
      const pij = Math.abs(branch.Pij || 0);
      // 简化判断，假设额定 100MW
      if (pij > 100) {
        overloads.push({
          '支路': branch.Branch || branch.id,
          '有功功率': pij.toFixed(2) + ' MW',
          '负载率': (pij / 100 * 100).toFixed(1) + '%'
        });
      }
    }
    return overloads.length === 0 ? { '状态': '✓ 无过载' } : overloads;
  }

  _getAllViolations(buses, branches) {
    const violations = [];

    // 电压越限
    for (const bus of buses) {
      const vm = bus.Vm || 0;
      if (vm < 0.9 || vm > 1.1) {
        violations.push({
          type: 'voltage',
          severity: vm < 0.85 || vm > 1.15 ? 'critical' : 'high',
          location: bus.name || bus.id,
          value: vm.toFixed(4) + ' pu'
        });
      }
    }

    // 支路过载
    for (const branch of branches) {
      const pij = Math.abs(branch.Pij || 0);
      if (pij > 100) {
        violations.push({
          type: 'overload',
          severity: pij > 120 ? 'critical' : 'high',
          location: branch.Branch || branch.id,
          value: pij.toFixed(2) + ' MW'
        });
      }
    }

    return violations;
  }

  _summarizeChannels(channelData) {
    const summary = {};
    for (const [name, data] of Object.entries(channelData || {})) {
      const values = data?.y || [];
      if (values.length > 0) {
        summary[name] = {
          '最小值': Math.min(...values),
          '最大值': Math.max(...values),
          '平均值': (values.reduce((a, b) => a + b, 0) / values.length).toFixed(4),
          '样本数': values.length
        };
      }
    }
    return summary;
  }

  _generateRecommendations(violations) {
    const recs = [];
    const types = new Set(violations.map(v => v.type));

    if (types.has('voltage')) {
      recs.push('1. 调整变压器分接头或投入无功补偿装置');
      recs.push('2. 优化发电机无功出力分配');
    }
    if (types.has('overload')) {
      recs.push('1. 调整发电出力分布，减轻重载线路负担');
      recs.push('2. 考虑切改负荷或投入备用线路');
    }

    return recs.length === 0 ? '系统运行正常，无需调整' : recs.join('\n');
  }
}

module.exports = ReportSkill;
