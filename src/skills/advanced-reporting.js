/**
 * Advanced Reporting Skill - 高级报告生成技能
 *
 * US-036: 多方案比选分析
 * US-040: PPT素材生成
 * US-041: 技术规范文档
 * US-056: 碳排放分析
 */

const path = require('path');
const fs = require('fs');

class AdvancedReportingSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
  }

  /**
   * 多方案比选分析 (US-036)
   *
   * @param {Array} schemes - 方案列表 [{ rid, name, description }]
   * @param {Object} config - 比选配置
   * @returns {Promise<Object>} 比选结果
   */
  async compareSchemes(schemes, config = {}) {
    const {
      criteria = ['powerFlow', 'n1', 'loss', 'voltage', 'cost'],
      weights = { powerFlow: 0.25, n1: 0.25, loss: 0.2, voltage: 0.15, cost: 0.15 }
    } = config;

    console.log(`\n[Compare] 多方案比选分析`);
    console.log(`[Compare] 方案数量: ${schemes.length}`);

    const results = [];

    // 分析各方案
    for (const scheme of schemes) {
      console.log(`[Compare] 分析方案: ${scheme.name}`);

      const analysis = await this._analyzeScheme(scheme.rid, criteria);

      results.push({
        name: scheme.name,
        rid: scheme.rid,
        description: scheme.description,
        analysis,
        scores: {}
      });
    }

    // 计算综合评分
    for (const result of results) {
      let totalScore = 0;

      for (const [criterion, weight] of Object.entries(weights)) {
        const score = this._calculateCriterionScore(result.analysis, criterion);
        result.scores[criterion] = score;
        totalScore += score * weight;
      }

      result.scores.total = totalScore.toFixed(2);
    }

    // 排序
    results.sort((a, b) => parseFloat(b.scores.total) - parseFloat(a.scores.total));

    // 生成对比表
    const comparisonTable = this._generateComparisonTable(results, criteria);

    // 推荐方案
    const recommendation = {
      best: results[0].name,
      reason: this._generateRecommendationReason(results[0]),
      alternatives: results.slice(1, 3).map(r => r.name)
    };

    console.log(`[Compare] 推荐方案: ${recommendation.best}`);

    return {
      success: true,
      results,
      comparisonTable,
      weights,
      recommendation,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 生成PPT素材 (US-040)
   *
   * @param {Object} data - 分析数据
   * @param {Object} config - PPT配置
   * @returns {Object} PPT素材
   */
  generatePPTSlides(data, config = {}) {
    const {
      title = '分析报告',
      subtitle = '',
      template = 'default',
      slides = []
    } = config;

    console.log(`\n[PPT] 生成PPT素材`);

    const pptContent = {
      title,
      subtitle,
      slides: []
    };

    // 标题页
    pptContent.slides.push({
      type: 'title',
      content: {
        title: title,
        subtitle: subtitle || `生成时间: ${new Date().toLocaleDateString()}`,
        footer: 'CloudPSS Skills 自动生成'
      }
    });

    // 概述页
    pptContent.slides.push({
      type: 'overview',
      content: {
        title: '概述',
        points: [
          `分析对象: ${data.modelName || '系统算例'}`,
          `分析时间: ${new Date().toLocaleString()}`,
          `分析方法: ${data.analysisType || '综合分析'}`
        ]
      }
    });

    // 关键发现页
    if (data.keyFindings) {
      pptContent.slides.push({
        type: 'findings',
        content: {
          title: '关键发现',
          findings: data.keyFindings.map(f => ({
            title: f.title,
            value: f.value,
            status: f.status || 'normal'
          }))
        }
      });
    }

    // 图表页
    if (data.charts) {
      for (const chart of data.charts) {
        pptContent.slides.push({
          type: 'chart',
          content: {
            title: chart.title,
            chartType: chart.type || 'bar',
            data: chart.data,
            imageBase64: chart.imageBase64
          }
        });
      }
    }

    // 结论页
    pptContent.slides.push({
      type: 'conclusion',
      content: {
        title: '结论与建议',
        conclusions: data.conclusions || ['分析已完成'],
        recommendations: data.recommendations || []
      }
    });

    // 导出格式
    const exportFormats = {
      json: JSON.stringify(pptContent, null, 2),
      markdown: this._convertPPTToMarkdown(pptContent)
    };

    console.log(`[PPT] 生成 ${pptContent.slides.length} 页幻灯片`);

    return {
      success: true,
      pptContent,
      exportFormats,
      slideCount: pptContent.slides.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 生成技术规范文档 (US-041)
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 文档配置
   * @returns {Promise<Object>} 文档内容
   */
  async generateTechnicalSpec(rid, config = {}) {
    const {
      includeParameters = true,
      includeTopology = true,
      includeCalculations = true,
      format = 'markdown'
    } = config;

    console.log(`\n[Spec] 生成技术规范文档`);
    console.log(`[Spec] 算例: ${rid}`);

    // 获取算例信息
    const modelInfo = await this.client.fetchModel(rid);
    const components = await this.client.getAllComponents(rid);

    // 构建文档结构
    const doc = {
      title: `${modelInfo.name || rid} 技术规范`,
      version: '1.0',
      date: new Date().toLocaleDateString(),
      sections: []
    };

    // 1. 概述
    doc.sections.push({
      title: '1. 概述',
      content: {
        description: modelInfo.description || '本技术规范描述算例的结构和参数配置。',
        rid: rid,
        createdAt: modelInfo.createdAt || new Date().toISOString(),
        lastModified: new Date().toISOString()
      }
    });

    // 2. 系统规模
    const stats = this._calculateSystemStats(components);
    doc.sections.push({
      title: '2. 系统规模',
      content: stats
    });

    // 3. 网络拓扑
    if (includeTopology) {
      doc.sections.push({
        title: '3. 网络拓扑',
        content: {
          description: '系统拓扑结构说明',
          busCount: stats.buses,
          branchCount: stats.branches,
          topologyType: this._determineTopologyType(components)
        }
      });
    }

    // 4. 设备参数
    if (includeParameters) {
      const equipmentList = this._organizeEquipmentParameters(components);
      doc.sections.push({
        title: '4. 设备参数清单',
        content: equipmentList
      });
    }

    // 5. 计算方案
    if (includeCalculations) {
      doc.sections.push({
        title: '5. 计算方案配置',
        content: {
          powerFlow: { method: 'Newton-Raphson', maxIterations: 30 },
          n1Analysis: { enabled: true, elements: 'all' }
        }
      });
    }

    // 6. 附录
    doc.sections.push({
      title: '6. 附录',
      content: {
        notes: '本文档由CloudPSS Skills自动生成',
        disclaimer: '参数数值仅供参考，请以实际配置为准'
      }
    });

    // 格式化输出
    let formattedOutput;
    if (format === 'markdown') {
      formattedOutput = this._formatAsMarkdown(doc);
    } else if (format === 'html') {
      formattedOutput = this._formatAsHTML(doc);
    } else {
      formattedOutput = doc;
    }

    console.log(`[Spec] 文档生成完成`);

    return {
      success: true,
      document: doc,
      formatted: formattedOutput,
      format,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 碳排放分析 (US-056)
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 分析配置
   * @returns {Promise<Object>} 碳排放分析结果
   */
  async analyzeCarbonEmissions(rid, config = {}) {
    const {
      emissionFactors = null,  // 自定义排放因子 { type: factor } kgCO2/MWh
      period = 'annual',       // 分析周期
      includeRenewable = true
    } = config;

    console.log(`\n[Carbon] 碳排放分析`);
    console.log(`[Carbon] 算例: ${rid}`);

    // 默认排放因子 (kgCO2/MWh)
    const defaultFactors = {
      coal: 950,        // 燃煤
      gas: 450,         // 燃气
      oil: 750,         // 燃油
      nuclear: 12,      // 核电
      hydro: 4,         // 水电
      wind: 11,         // 风电
      solar: 41,        // 光伏
      biomass: 230,     // 生物质
      default: 600      // 默认值
    };

    const factors = emissionFactors || defaultFactors;

    // 获取发电机数据
    const components = await this.client.getAllComponents(rid);

    // 运行潮流获取发电出力
    const pfResult = await this.client.runSimulation(rid, 0, 0);
    await this.client.waitForCompletion(pfResult.jobId);

    // 计算各机组发电量和碳排放
    const generatorEmissions = [];
    let totalGeneration = 0;
    let totalEmissions = 0;

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('gen')) {
        const args = comp.args || {};
        const P = args.P || 0;  // MW

        // 判断机组类型
        const genType = this._determineGeneratorType(comp, args);
        const factor = factors[genType] || factors.default;

        // 年发电量 (假设年利用小时数)
        const annualHours = this._getAnnualHours(genType);
        const annualGeneration = P * annualHours;  // MWh

        // 碳排放
        const emission = annualGeneration * factor / 1000;  // tCO2

        generatorEmissions.push({
          name: comp.label || key,
          type: genType,
          capacity_MW: P.toFixed(2),
          annualGeneration_MWh: annualGeneration.toFixed(0),
          emissionFactor: factor,
          annualEmission_tCO2: emission.toFixed(2)
        });

        totalGeneration += annualGeneration;
        totalEmissions += emission;
      }
    }

    // 计算碳强度
    const carbonIntensity = totalGeneration > 0
      ? (totalEmissions / totalGeneration * 1000).toFixed(2)  // gCO2/kWh
      : 0;

    // 减排潜力分析
    const abatementPotential = this._analyzeAbatementPotential(
      generatorEmissions,
      factors
    );

    // 对标分析
    const benchmark = this._getCarbonBenchmark(totalGeneration);

    console.log(`[Carbon] 总发电量: ${totalGeneration.toFixed(0)} MWh`);
    console.log(`[Carbon] 总碳排放: ${totalEmissions.toFixed(2)} tCO2`);
    console.log(`[Carbon] 碳强度: ${carbonIntensity} gCO2/kWh`);

    return {
      success: true,
      summary: {
        totalGeneration_MWh: totalGeneration.toFixed(0),
        totalEmission_tCO2: totalEmissions.toFixed(2),
        carbonIntensity_gCO2kWh: carbonIntensity,
        period
      },
      generators: generatorEmissions,
      abatementPotential,
      benchmark,
      recommendations: this._generateCarbonRecommendations(
        carbonIntensity,
        generatorEmissions
      ),
      timestamp: new Date().toISOString()
    };
  }

  // ========== 内部方法 ==========

  async _analyzeScheme(rid, criteria) {
    const analysis = {};

    // 获取元件
    const components = await this.client.getAllComponents(rid);

    // 潮流分析
    if (criteria.includes('powerFlow')) {
      const pfResult = await this.client.runSimulation(rid, 0, 0);
      await this.client.waitForCompletion(pfResult.jobId);
      const pfData = await this.client.getPowerFlowResults(pfResult.jobId);

      analysis.powerFlow = {
        converged: true,
        totalLoad: this._sumLoad(components),
        totalGeneration: this._sumGeneration(components),
        violations: this._countViolations(pfData)
      };
    }

    // N-1分析
    if (criteria.includes('n1')) {
      try {
        const n1Result = await this.client.runContingencyScan(rid, 'powerFlow');
        analysis.n1 = {
          scanned: true,
          criticalCount: n1Result.criticalCount || 0,
          warningCount: n1Result.warningCount || 0
        };
      } catch (e) {
        analysis.n1 = { scanned: false, error: e.message };
      }
    }

    // 网损分析
    if (criteria.includes('loss')) {
      const totalLoad = this._sumLoad(components);
      const totalGen = this._sumGeneration(components);
      analysis.loss = {
        totalLoss_MW: Math.abs(totalGen - totalLoad).toFixed(2),
        lossRate_percent: ((Math.abs(totalGen - totalLoad) / totalGen) * 100).toFixed(2)
      };
    }

    // 电压分析
    if (criteria.includes('voltage')) {
      analysis.voltage = {
        minVoltage: 0.95,
        maxVoltage: 1.05,
        violationCount: 0
      };
    }

    // 成本分析
    if (criteria.includes('cost')) {
      analysis.cost = {
        investment: 1000,  // 万元
        annualOperation: 50
      };
    }

    return analysis;
  }

  _calculateCriterionScore(analysis, criterion) {
    // 评分范围 0-100
    switch (criterion) {
      case 'powerFlow':
        return analysis.powerFlow?.converged
          ? Math.max(0, 100 - analysis.powerFlow.violations * 10)
          : 0;

      case 'n1':
        const n1 = analysis.n1 || {};
        return Math.max(0, 100 - (n1.criticalCount || 0) * 20 - (n1.warningCount || 0) * 5);

      case 'loss':
        const lossRate = parseFloat(analysis.loss?.lossRate_percent || 5);
        return Math.max(0, 100 - lossRate * 10);

      case 'voltage':
        return analysis.voltage?.violationCount === 0 ? 100 : 80;

      case 'cost':
        const cost = analysis.cost?.investment || 0;
        return Math.max(0, 100 - cost / 20);

      default:
        return 50;
    }
  }

  _generateComparisonTable(results, criteria) {
    const headers = ['方案名称', ...criteria.map(c => this._criterionLabel(c)), '综合评分'];
    const rows = results.map(r => [
      r.name,
      ...criteria.map(c => r.scores[c]?.toFixed(1) || '-'),
      r.scores.total
    ]);

    return { headers, rows };
  }

  _criterionLabel(criterion) {
    const labels = {
      powerFlow: '潮流',
      n1: 'N-1安全',
      loss: '网损',
      voltage: '电压',
      cost: '经济性'
    };
    return labels[criterion] || criterion;
  }

  _generateRecommendationReason(best) {
    const reasons = [];

    if (best.scores.n1 > 80) reasons.push('N-1安全性最优');
    if (best.scores.loss > 80) reasons.push('网损最低');
    if (best.scores.voltage > 80) reasons.push('电压水平最佳');

    return reasons.length > 0 ? reasons.join('，') : '综合评分最高';
  }

  _sumLoad(components) {
    let total = 0;
    for (const comp of Object.values(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('load')) {
        total += (comp.args?.P || 0);
      }
    }
    return total;
  }

  _sumGeneration(components) {
    let total = 0;
    for (const comp of Object.values(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('gen')) {
        total += (comp.args?.P || 0);
      }
    }
    return total;
  }

  _countViolations(pfData) {
    let count = 0;
    const buses = pfData.buses || [];

    for (const bus of buses) {
      const v = bus.voltage || 1.0;
      if (v < 0.95 || v > 1.05) count++;
    }

    return count;
  }

  _convertPPTToMarkdown(ppt) {
    let md = `# ${ppt.title}\n\n`;
    if (ppt.subtitle) md += `${ppt.subtitle}\n\n`;

    for (const slide of ppt.slides) {
      md += `## ${slide.content.title || '幻灯片'}\n\n`;

      if (slide.type === 'findings') {
        for (const f of (slide.content.findings || [])) {
          md += `- **${f.title}**: ${f.value}\n`;
        }
      } else if (slide.type === 'conclusion') {
        for (const c of (slide.content.conclusions || [])) {
          md += `- ${c}\n`;
        }
      }

      md += '\n';
    }

    return md;
  }

  _calculateSystemStats(components) {
    const stats = {
      buses: 0,
      generators: 0,
      loads: 0,
      lines: 0,
      transformers: 0,
      totalCapacity: 0
    };

    for (const comp of Object.values(components)) {
      const def = (comp.definition || '').toLowerCase();

      if (def.includes('bus')) stats.buses++;
      else if (def.includes('gen')) {
        stats.generators++;
        stats.totalCapacity += (comp.args?.P || 0);
      }
      else if (def.includes('load')) stats.loads++;
      else if (def.includes('line')) stats.lines++;
      else if (def.includes('transformer')) stats.transformers++;
    }

    return stats;
  }

  _determineTopologyType(components) {
    const lines = Object.values(components).filter(c =>
      (c.definition || '').toLowerCase().includes('line')
    ).length;

    if (lines > 50) return '大型输电网络';
    if (lines > 20) return '中型输电网络';
    return '小型输电网络';
  }

  _organizeEquipmentParameters(components) {
    const equipment = {
      generators: [],
      transformers: [],
      lines: [],
      loads: []
    };

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      const item = {
        key,
        name: comp.label || key,
        parameters: comp.args || {}
      };

      if (def.includes('gen')) equipment.generators.push(item);
      else if (def.includes('transformer')) equipment.transformers.push(item);
      else if (def.includes('line')) equipment.lines.push(item);
      else if (def.includes('load')) equipment.loads.push(item);
    }

    return equipment;
  }

  _formatAsMarkdown(doc) {
    let md = `# ${doc.title}\n\n`;
    md += `版本: ${doc.version} | 日期: ${doc.date}\n\n`;

    for (const section of doc.sections) {
      md += `## ${section.title}\n\n`;

      if (typeof section.content === 'object') {
        for (const [key, value] of Object.entries(section.content)) {
          if (Array.isArray(value)) {
            md += `### ${key}\n`;
            value.forEach(item => {
              if (typeof item === 'object') {
                md += `- **${item.name || item.key}**: ${JSON.stringify(item.parameters || {})}\n`;
              } else {
                md += `- ${value}\n`;
              }
            });
          } else {
            md += `**${key}**: ${value}\n\n`;
          }
        }
      }

      md += '\n';
    }

    return md;
  }

  _formatAsHTML(doc) {
    return `<html><body><h1>${doc.title}</h1></body></html>`;
  }

  _determineGeneratorType(comp, args) {
    const label = (comp.label || '').toLowerCase();
    const name = (comp.name || '').toLowerCase();

    if (label.includes('pv') || label.includes('solar') || name.includes('solar')) return 'solar';
    if (label.includes('wind') || name.includes('wind')) return 'wind';
    if (label.includes('hydro') || name.includes('hydro')) return 'hydro';
    if (label.includes('nuclear') || name.includes('nuclear')) return 'nuclear';
    if (label.includes('gas') || name.includes('gas')) return 'gas';
    if (label.includes('biomass')) return 'biomass';

    // 默认假设为燃煤
    return 'coal';
  }

  _getAnnualHours(genType) {
    const hours = {
      coal: 4500,
      gas: 3500,
      oil: 3000,
      nuclear: 7500,
      hydro: 3500,
      wind: 2000,
      solar: 1200,
      biomass: 5000,
      default: 4000
    };
    return hours[genType] || hours.default;
  }

  _analyzeAbatementPotential(generators, factors) {
    const potential = [];
    const renewableTypes = ['wind', 'solar', 'hydro', 'nuclear'];

    for (const gen of generators) {
      if (!renewableTypes.includes(gen.type)) {
        // 计算替换为新能源的减排潜力
        const avgRenewableFactor = 15;  // gCO2/kWh
        const currentFactor = gen.emissionFactor;
        const generation = parseFloat(gen.annualGeneration_MWh);

        const saving = generation * (currentFactor - avgRenewableFactor) / 1000;  // tCO2

        potential.push({
          generator: gen.name,
          currentType: gen.type,
          potentialSaving_tCO2: saving.toFixed(2),
          recommendation: saving > 1000 ? '建议替换为清洁能源' : '可优化运行'
        });
      }
    }

    return {
      items: potential,
      totalPotential_tCO2: potential.reduce((sum, p) => sum + parseFloat(p.potentialSaving_tCO2), 0).toFixed(2)
    };
  }

  _getCarbonBenchmark(totalGeneration) {
    // 对标国内外电网平均碳强度
    return {
      china_average: 583,  // gCO2/kWh
      world_average: 460,
      eu_average: 300,
      current_analysis: null  // 由调用者填充
    };
  }

  _generateCarbonRecommendations(carbonIntensity, generators) {
    const recommendations = [];

    if (carbonIntensity > 500) {
      recommendations.push({
        priority: 'high',
        message: '碳强度较高，建议增加清洁能源发电比例'
      });
    }

    const coalCount = generators.filter(g => g.type === 'coal').length;
    if (coalCount > generators.length * 0.5) {
      recommendations.push({
        priority: 'high',
        message: '燃煤机组占比较高，建议逐步转型为燃气或新能源'
      });
    }

    const renewableCount = generators.filter(g =>
      ['wind', 'solar', 'hydro'].includes(g.type)
    ).length;

    if (renewableCount < generators.length * 0.2) {
      recommendations.push({
        priority: 'medium',
        message: '新能源装机比例较低，建议规划建设风光项目'
      });
    }

    return recommendations;
  }
}

module.exports = { AdvancedReportingSkill };