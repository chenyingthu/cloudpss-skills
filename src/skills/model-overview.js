/**
 * Model Overview Skill - 算例概览技能
 *
 * 用于获取电力系统仿真算例的整体概览信息
 *
 * 功能:
 * - 算例摘要：名称、描述、规模（元件数、节点数）
 * - 配置分析：参数方案列表和内容
 * - 计算方案：潮流、EMT 等计算方案信息
 * - 统计报告：元件类型分布、量测点数量等
 */

const fs = require('fs');
const path = require('path');

class ModelOverviewSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.dataFilePath = options.dataFilePath;
  }

  /**
   * 从本地文件加载算例数据
   *
   * @param {string} filePath - JSON 文件路径
   * @returns {Object} 算例数据
   */
  loadFromLocalFile(filePath) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`文件不存在：${absolutePath}`);
    }
    const content = fs.readFileSync(absolutePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * 获取算例摘要信息
   *
   * @param {Object} data - 算例数据（可选，不提供则从默认文件加载）
   * @returns {Object} 算例摘要
   */
  getSummary(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath || './experiment-data/ieee3-full-structure.json');
    }

    const modelInfo = data.model_info || {};
    const stats = data.statistics || {};
    const componentsByType = data.components_by_type || {};

    // 计算节点数量
    const busCount = componentsByType.bus?.length || 0;

    // 计算量测点数量
    const measurementCount = componentsByType.measurement?.length || 0;

    // 计算输出通道数量（从 jobs 中获取）
    let outputChannelCount = 0;
    for (const job of modelInfo.jobs || []) {
      if (job.args?.output_channels) {
        outputChannelCount += job.args.output_channels.length;
      }
      if (job.args?.XY_Output_channels) {
        outputChannelCount += job.args.XY_Output_channels.length;
      }
    }

    return {
      rid: modelInfo.rid,
      name: modelInfo.name,
      description: modelInfo.description,
      scale: {
        totalComponents: stats.total_components || 0,
        busCount,
        outputChannels: outputChannelCount,
        measurementPoints: measurementCount
      },
      exportedAt: data.exported_at
    };
  }

  /**
   * 获取配置分析信息
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 配置分析结果
   */
  analyzeConfigs(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath || './experiment-data/ieee3-full-structure.json');
    }

    const modelInfo = data.model_info || {};
    const configs = modelInfo.configs || [];

    return {
      totalConfigs: configs.length,
      configs: configs.map((config, index) => ({
        index,
        name: config.name,
        hasArgs: Object.keys(config.args || {}).length > 0,
        hasPins: Object.keys(config.pins || {}).length > 0,
        argsCount: Object.keys(config.args || {}).length,
        pinsCount: Object.keys(config.pins || {}).length,
        args: config.args,
        pins: config.pins
      }))
    };
  }

  /**
   * 获取计算方案信息
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 计算方案信息
   */
  getJobsInfo(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath || './experiment-data/ieee3-full-structure.json');
    }

    const modelInfo = data.model_info || {};
    const jobs = modelInfo.jobs || [];

    return {
      totalJobs: jobs.length,
      jobs: jobs.map((job, index) => {
        // 识别作业类型
        const jobType = this._identifyJobType(job);

        // 提取关键参数
        const keyParams = this._extractJobKeyParams(job, jobType);

        return {
          index,
          name: job.name,
          rid: job.rid,
          type: jobType,
          description: jobType.description,
          keyParams,
          outputChannelCount: (job.args?.output_channels || []).length + (job.args?.XY_Output_channels || []).length
        };
      })
    };
  }

  /**
   * 识别作业类型
   *
   * @param {Object} job - 作业对象
   * @returns {Object} 作业类型信息
   */
  _identifyJobType(job) {
    const rid = job.rid || '';

    if (rid.includes('power-flow')) {
      return {
        code: 'power_flow',
        name: '潮流计算',
        description: '电力系统稳态潮流计算'
      };
    }
    if (rid.includes('emtps')) {
      return {
        code: 'emt',
        name: '电磁暂态仿真',
        description: '电磁暂态过程仿真计算'
      };
    }
    if (rid.includes('shifted-frequency') || rid.includes('sfemtps')) {
      return {
        code: 'shifted_frequency_emt',
        name: '移频电磁暂态仿真',
        description: '移频电磁暂态过程仿真计算'
      };
    }

    return {
      code: 'unknown',
      name: '未知类型',
      description: '未识别的计算类型'
    };
  }

  /**
   * 提取作业关键参数
   *
   * @param {Object} job - 作业对象
   * @param {Object} jobType - 作业类型
   * @returns {Object} 关键参数
   */
  _extractJobKeyParams(job, jobType) {
    const args = job.args || {};
    const params = {};

    if (jobType.code === 'power_flow') {
      params.maxIteration = args.MaxIteration;
      params.checkInput = args.CheckInput;
      params.useVoltageLimit = args.UseVoltageLimit;
      params.useReactivePowerLimit = args.UseReactivePowerLimit;
      params.skipPF = args.SkipPF;
    } else if (jobType.code === 'emt') {
      params.stepTime = args.step_time;
      params.beginTime = args.begin_time;
      params.endTime = args.end_time;
      params.solver = args.solver;
      params.fileBufferSize = args.file_buffer_size;
      params.fileBufferDeltaT = args.file_buffer_deltaT;
    }

    return params;
  }

  /**
   * 获取统计报告
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 统计报告
   */
  getStatisticsReport(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath || './experiment-data/ieee3-full-structure.json');
    }

    const stats = data.statistics || {};
    const componentsByType = data.components_by_type || {};

    // 构建元件类型分布
    const typeDistribution = {};
    for (const [type, components] of Object.entries(componentsByType)) {
      typeDistribution[type] = {
        count: Array.isArray(components) ? components.length : components,
        components: Array.isArray(components) ? components.map(c => ({
          id: c.id,
          label: c.label,
          definition: c.definition
        })) : null
      };
    }

    // 统计主要元件数量
    const mainComponents = {
      bus: typeDistribution.bus?.count || 0,
      transformer: typeDistribution.transformer?.count || 0,
      turbineGovernor: typeDistribution.turbine_governor?.count || 0,
      measurement: typeDistribution.measurement?.count || 0,
      label: typeDistribution.label?.count || 0
    };

    // 计算其他元件数量
    const otherCount = typeDistribution.other?.count || 0;

    return {
      totalComponents: stats.total_components || 0,
      typeDistribution: Object.fromEntries(
        Object.entries(typeDistribution).map(([type, info]) => [
          type,
          Array.isArray(info.components) ? info.count : info.count
        ])
      ),
      mainComponents,
      otherComponents: otherCount,
      componentDetails: typeDistribution
    };
  }

  /**
   * 获取完整概览报告
   *
   * @param {Object} options - 选项
   * @returns {Object} 完整概览报告
   */
  getFullOverview(options = {}) {
    const { includeComponentDetails = false } = options;

    // 加载数据
    const data = this.loadFromLocalFile(this.dataFilePath || './experiment-data/ieee3-full-structure.json');

    // 如果不包含元件详情，从统计数据中移除详细信息
    if (!includeComponentDetails) {
      for (const key of Object.keys(data.components_by_type || {})) {
        if (Array.isArray(data.components_by_type[key])) {
          data.components_by_type[key] = data.components_by_type[key].map(c => ({
            id: c.id,
            label: c.label
          }));
        }
      }
    }

    return {
      summary: this.getSummary(data),
      configs: this.analyzeConfigs(data),
      jobs: this.getJobsInfo(data),
      statistics: this.getStatisticsReport(data),
      rawData: includeComponentDetails ? data : null
    };
  }

  /**
   * 生成人类可读的报告文本
   *
   * @param {Object} overview - 概览数据
   * @returns {string} 格式化的报告文本
   */
  generateReportText(overview) {
    const lines = [];

    // 标题
    lines.push('═'.repeat(60));
    lines.push(`  算例概览报告：${overview.summary.name}`);
    lines.push('═'.repeat(60));
    lines.push('');

    // 基本信息
    lines.push('【基本信息】');
    lines.push(`  标识符 (RID): ${overview.summary.rid}`);
    lines.push(`  描述：${overview.summary.description}`);
    lines.push(`  导出时间：${overview.summary.exportedAt}`);
    lines.push('');

    // 规模信息
    lines.push('【算例规模】');
    lines.push(`  元件总数：${overview.summary.scale.totalComponents}`);
    lines.push(`  节点数量：${overview.summary.scale.busCount}`);
    lines.push(`  量测点数量：${overview.summary.scale.measurementPoints}`);
    lines.push(`  输出通道：${overview.summary.scale.outputChannels}`);
    lines.push('');

    // 配置信息
    lines.push('【参数方案】');
    lines.push(`  方案数量：${overview.configs.totalConfigs}`);
    for (const config of overview.configs.configs) {
      lines.push(`  - ${config.name} (参数：${config.argsCount}, 引脚：${config.pinsCount})`);
    }
    lines.push('');

    // 计算方案
    lines.push('【计算方案】');
    lines.push(`  方案数量：${overview.jobs.totalJobs}`);
    for (const job of overview.jobs.jobs) {
      lines.push(`  - ${job.name}`);
      lines.push(`    类型：${job.type.name} (${job.type.description})`);
      lines.push(`    输出通道：${job.outputChannelCount}`);
    }
    lines.push('');

    // 元件统计
    lines.push('【元件分布】');
    for (const [type, count] of Object.entries(overview.statistics.typeDistribution)) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push('');

    lines.push('═'.repeat(60));

    return lines.join('\n');
  }
}

module.exports = ModelOverviewSkill;
