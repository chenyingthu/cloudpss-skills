/**
 * Visualization Skill - 结果可视化技能
 *
 * US-020: 结果可视化
 * - 电压等高线图
 * - 线路负载热力图
 * - 潮流流向图
 * - 图表导出
 */

const PowerFlowAnalysisSkill = require('./power-flow-analysis');

class VisualizationSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.powerFlow = new PowerFlowAnalysisSkill(client, options);
  }

  /**
   * 生成电压等高线数据
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 可视化选项
   * @returns {Promise<Object>} 等高线数据
   */
  async voltageContour(jobId, options = {}) {
    const {
      levels = 20,          // 等高线级数
      minVoltage = 0.9,     // 最小电压
      maxVoltage = 1.1,     // 最大电压
      colorScheme = 'RdYlGn' // 色彩方案
    } = options;

    // 获取节点电压数据
    const voltageData = await this.powerFlow.getBusVoltages(jobId);
    const buses = voltageData.buses;

    // 生成等高线数据
    const contourLevels = [];
    const step = (maxVoltage - minVoltage) / levels;
    for (let i = 0; i <= levels; i++) {
      contourLevels.push(minVoltage + i * step);
    }

    // 统计各电压区间的节点数量
    const distribution = {};
    for (const level of contourLevels) {
      distribution[level.toFixed(3)] = 0;
    }

    for (const bus of buses) {
      const v = bus.voltage;
      for (let i = 0; i < contourLevels.length - 1; i++) {
        if (v >= contourLevels[i] && v < contourLevels[i + 1]) {
          distribution[contourLevels[i].toFixed(3)]++;
          break;
        }
      }
    }

    // 生成节点电压分级数据
    const nodeCategories = buses.map(bus => {
      const v = bus.voltage;
      if (v < 0.90) return { ...bus, category: 'critical-low', color: '#d32f2f' };
      if (v < 0.95) return { ...bus, category: 'warning-low', color: '#ff9800' };
      if (v <= 1.05) return { ...bus, category: 'normal', color: '#4caf50' };
      if (v <= 1.10) return { ...bus, category: 'warning-high', color: '#ff9800' };
      return { ...bus, category: 'critical-high', color: '#d32f2f' };
    });

    return {
      jobId,
      levels: contourLevels,
      distribution,
      nodes: nodeCategories,
      summary: {
        total: buses.length,
        criticalLow: nodeCategories.filter(n => n.category === 'critical-low').length,
        warningLow: nodeCategories.filter(n => n.category === 'warning-low').length,
        normal: nodeCategories.filter(n => n.category === 'normal').length,
        warningHigh: nodeCategories.filter(n => n.category === 'warning-high').length,
        criticalHigh: nodeCategories.filter(n => n.category === 'critical-high').length
      },
      colorScheme,
      exportFormat: 'json' // 可导出为图表库使用
    };
  }

  /**
   * 生成线路负载热力图数据
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 可视化选项
   * @returns {Promise<Object>} 热力图数据
   */
  async branchHeatmap(jobId, options = {}) {
    const {
      warningThreshold = 0.8,
      criticalThreshold = 1.0,
      colorScheme = 'RdYlGn_r'
    } = options;

    // 获取支路潮流数据
    const flowData = await this.powerFlow.getBranchFlows(jobId);
    const branches = flowData.branches;

    // 生成热力图数据
    const heatmapData = branches.map(branch => {
      const loading = branch.loading || 0;
      let category, color;

      if (loading >= criticalThreshold) {
        category = 'overload';
        color = '#d32f2f';
      } else if (loading >= warningThreshold) {
        category = 'heavy';
        color = '#ff9800';
      } else if (loading >= 0.5) {
        category = 'moderate';
        color = '#ffeb3b';
      } else {
        category = 'light';
        color = '#4caf50';
      }

      return {
        ...branch,
        loadingPercent: (loading * 100).toFixed(2),
        category,
        color,
        intensity: Math.min(loading / criticalThreshold, 1.5)
      };
    });

    // 按负载率排序
    heatmapData.sort((a, b) => b.loading - a.loading);

    // 统计各负载区间的线路数量
    const stats = {
      total: branches.length,
      overload: heatmapData.filter(b => b.category === 'overload').length,
      heavy: heatmapData.filter(b => b.category === 'heavy').length,
      moderate: heatmapData.filter(b => b.category === 'moderate').length,
      light: heatmapData.filter(b => b.category === 'light').length
    };

    return {
      jobId,
      branches: heatmapData,
      statistics: stats,
      colorScheme,
      thresholds: { warning: warningThreshold, critical: criticalThreshold },
      exportFormat: 'json'
    };
  }

  /**
   * 生成潮流流向图数据
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 可视化选项
   * @returns {Promise<Object>} 流向图数据
   */
  async powerFlowDiagram(jobId, options = {}) {
    const {
      minFlowMW = 10,    // 最小显示功率
      showLosses = true
    } = options;

    // 获取潮流结果
    const [busData, branchData] = await Promise.all([
      this.powerFlow.getBusVoltages(jobId),
      this.powerFlow.getBranchFlows(jobId)
    ]);

    // 生成节点数据
    const nodes = busData.buses.map(bus => ({
      id: bus.id,
      name: bus.name,
      voltage: bus.voltage,
      angle: bus.angle,
      pGen: bus.pGen,
      qGen: bus.qGen,
      pLoad: bus.pLoad,
      qLoad: bus.qLoad,
      type: bus.pGen > 0 ? 'generator' : (bus.pLoad > 0 ? 'load' : 'junction')
    }));

    // 生成边数据（潮流流向）
    const edges = branchData.branches
      .filter(branch => Math.abs(branch.pij) >= minFlowMW)
      .map(branch => ({
        id: branch.id,
        name: branch.name,
        source: branch.fromBus,
        target: branch.toBus,
        pij: branch.pij,
        qij: branch.qij,
        pji: branch.pji,
        qji: branch.qji,
        pLoss: branch.pLoss,
        qLoss: branch.qLoss,
        loading: branch.loading,
        direction: branch.pij >= 0 ? 'forward' : 'reverse'
      }));

    // 计算潮流方向
    const flowSummary = {
      totalGeneration: nodes.reduce((s, n) => s + n.pGen, 0),
      totalLoad: nodes.reduce((s, n) => s + n.pLoad, 0),
      totalLoss: branchData.summary.totalPLoss,
      avgLoading: edges.reduce((s, e) => s + e.loading, 0) / edges.length
    };

    return {
      jobId,
      nodes,
      edges,
      summary: flowSummary,
      exportFormat: 'json'
    };
  }

  /**
   * 生成综合可视化报告
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 可视化选项
   * @returns {Promise<Object>} 综合可视化数据
   */
  async generateVisualizationReport(jobId, options = {}) {
    const {
      includeContour = true,
      includeHeatmap = true,
      includeFlowDiagram = true
    } = options;

    const results = {
      jobId,
      timestamp: new Date().toISOString()
    };

    const promises = [];
    if (includeContour) promises.push(this.voltageContour(jobId, options));
    if (includeHeatmap) promises.push(this.branchHeatmap(jobId, options));
    if (includeFlowDiagram) promises.push(this.powerFlowDiagram(jobId, options));

    const [contour, heatmap, flowDiagram] = await Promise.all(promises);

    if (includeContour) results.voltageContour = contour;
    if (includeHeatmap) results.branchHeatmap = heatmap;
    if (includeFlowDiagram) results.powerFlowDiagram = flowDiagram;

    return results;
  }

  /**
   * 导出图表为指定格式
   *
   * @param {Object} chartData - 图表数据
   * @param {string} format - 导出格式 (json/svg/png)
   * @returns {string|Buffer} 导出数据
   */
  exportChart(chartData, format = 'json') {
    if (format === 'json') {
      return JSON.stringify(chartData, null, 2);
    }

    // SVG和PNG需要额外的图形库支持
    if (format === 'svg') {
      return this._generateSVG(chartData);
    }

    // PNG需要进一步处理
    throw new Error(`Unsupported export format: ${format}. Use 'json' or 'svg'.`);
  }

  /**
   * 生成简单的SVG图表
   */
  _generateSVG(chartData) {
    // 简化的SVG生成
    const svgLines = [];
    svgLines.push('<?xml version="1.0" encoding="UTF-8"?>');
    svgLines.push('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">');

    if (chartData.nodes) {
      // 绘制节点
      const nodeCount = chartData.nodes.length;
      const cols = Math.ceil(Math.sqrt(nodeCount));

      chartData.nodes.forEach((node, i) => {
        const x = 50 + (i % cols) * 100;
        const y = 50 + Math.floor(i / cols) * 80;
        const color = node.color || '#4caf50';

        svgLines.push(`<circle cx="${x}" cy="${y}" r="15" fill="${color}" stroke="black"/>`);
        svgLines.push(`<text x="${x}" y="${y + 30}" text-anchor="middle" font-size="10">${node.name || node.id}</text>`);
      });
    }

    svgLines.push('</svg>');
    return svgLines.join('\n');
  }
}

module.exports = VisualizationSkill;