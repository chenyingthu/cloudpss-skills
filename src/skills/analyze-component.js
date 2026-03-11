/**
 * Analyze Component Skill - 元件分析技能
 *
 * 用于分析电力系统仿真算例中的元件结构
 *
 * 功能:
 * - 元件统计：按类型统计数量和分布
 * - 元件查询：根据 ID、label、类型查询元件
 * - 参数提取：获取指定元件的参数（args 字段）
 * - 类型识别：改进的定义匹配逻辑，识别更多元件类型
 *
 * 支持的数据格式:
 * - CloudPSS Model.dump() 官方导出格式 (JSON/YAML)
 * - 内部自定义导出格式 (experiment-data/*.json)
 * - 直接从 CloudPSS API 获取
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const yaml = require('js-yaml');

class ComponentAnalysisSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    // 元件类型映射规则（基于 definition 字段）
    this.componentTypeMap = {
      // 发电机类
      generator: [
        'SyncGeneratorRouter',
        '_newGen',
        '_newGen_3p',
        'SynchronousGenerator',
        'InductionGenerator',
        'RenewableGenerator'
      ],
      // 线路类
      line: [
        'TransmissionLine',
        '_newLine',
        '_newLine_3p',
        'TransmissionLine_3p',
        'LineParameter'
      ],
      // 负荷类
      load: [
        '_newExpLoad_3p',
        '_newLoad',
        '_newLoad_3p',
        'ConstantLoad',
        'DynamicLoad',
        'MotorLoad'
      ],
      // 母线类
      bus: [
        '_newBus_3p',
        '_newBus',
        'BusBar',
        'ReferenceBus'
      ],
      // 变压器类
      transformer: [
        '_newTransformer_3p2w',
        '_newTransformer_3p3w',
        '_newTransformer',
        'Transformer_2W',
        'Transformer_3W',
        'AutoTransformer'
      ],
      // 故障类
      fault: [
        '_newFaultResistor_3p',
        '_newFault',
        '_newFault_3p',
        'FaultResistance',
        'ThreePhaseFault'
      ],
      // 开关类
      switch: [
        '_newBreaker',
        '_newSwitch',
        '_newDisconnector',
        'CircuitBreaker',
        'Switch_3p'
      ],
      // 可再生能源类
      renewable: [
        '_newWindTurbine',
        '_newSolarPanel',
        '_newPVPlant',
        'WindTurbine',
        'SolarInverter',
        'RenewableEnergySource'
      ],
      // 汽轮机/调速器类
      turbine_governor: [
        '_STEAM_GOV_1',
        '_STEAM_TUR_1',
        'SteamTurbine',
        'HydroTurbine',
        'Governor'
      ],
      // 励磁系统类
      exciter: [
        '_EXST1_PTI',
        '_EXAC1A',
        '_EXDC2A',
        'Exciter',
        'AutomaticVoltageRegulator'
      ],
      // 电力系统稳定器类
      pss: [
        '_PSS1A',
        '_PSS2B',
        '_PSS3B',
        'PowerSystemStabilizer'
      ],
      // 测量类
      measurement: [
        '_NewVoltageMeter',
        '_NewCurrentMeter',
        '_NewPowerMeter',
        'VoltageMeter',
        'CurrentMeter',
        'PowerMeter'
      ],
      // 控制/信号处理类
      control: [
        '_newGain',
        '_newSum',
        '_newLoopNode',
        '_newConstant',
        '_newStepGen',
        '_newChannel',
        'Gain',
        'Sum',
        'Integrator',
        'Filter'
      ],
      // 标签类
      label: [
        'ElectricalLable',
        'Label',
        'Tag'
      ],
      // 接地类
      ground: [
        'GND',
        'Ground',
        'Earth'
      ]
    };
  }

  /**
   * 从本地文件加载算例数据（支持官方 dump 格式）
   *
   * @param {string} filePath - JSON/YAML 文件路径（支持 .gz 压缩）
   * @returns {Object} 算例数据（统一格式）
   */
  loadFromLocalFile(filePath) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`文件不存在：${absolutePath}`);
    }

    let content;
    // 检测是否为 gzip 压缩文件
    if (filePath.endsWith('.gz')) {
      const compressed = fs.readFileSync(absolutePath);
      content = zlib.gunzipSync(compressed).toString('utf-8');
    } else {
      content = fs.readFileSync(absolutePath, 'utf-8');
    }

    // 解析 YAML 或 JSON
    let rawData;
    if (filePath.includes('.yaml') || filePath.includes('.yml')) {
      rawData = yaml.load(content);
    } else {
      rawData = JSON.parse(content);
    }

    // 检测并转换官方 Model.dump() 格式
    if (this._isOfficialDumpFormat(rawData)) {
      return this._convertOfficialDumpToInternalFormat(rawData);
    }

    return rawData;
  }

  /**
   * 检测是否为官方 Model.dump() 格式
   */
  _isOfficialDumpFormat(data) {
    return data.revision &&
           data.revision.implements &&
           data.revision.implements.diagram &&
           data.revision.implements.diagram.cells &&
           !data.model_info;
  }

  /**
   * 将官方 Model.dump() 格式转换为内部统一格式
   */
  _convertOfficialDumpToInternalFormat(dumpData) {
    const cells = dumpData.revision.implements.diagram.cells || {};
    const allComponents = Object.values(cells).filter(c => c.definition);

    return {
      all_components: allComponents.map(c => ({
        id: c.id,
        label: c.label,
        definition: c.definition,
        args: c.args || {},
        pins: c.pins || {}
      }))
    };
  }

  /**
   * 分析模型中的所有元件
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 元件分析报告
   */
  async analyzeComponents(rid, options = {}) {
    const { detailed = false } = options;

    // 获取所有元件（返回的是对象）
    const allComponentsObj = await this.client.getAllComponents(rid);
    // 转换为数组格式
    const allComponents = Object.values(allComponentsObj || {});

    // 重新分类元件
    const classified = this.classifyComponents(allComponentsObj);

    // 统计信息
    const statistics = {
      total: allComponents.length,
      byType: {},
      byCategory: {}
    };

    // 按分类统计
    for (const [category, components] of Object.entries(classified)) {
      statistics.byCategory[category] = components.length;
    }

    // 按原始类型统计
    const typeCount = {};
    for (const comp of allComponents) {
      const type = comp.definition || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    }
    statistics.byType = typeCount;

    // 详细分析
    const analysis = {
      rid,
      timestamp: new Date().toISOString(),
      statistics,
      classified,
      summary: this._generateSummary(classified)
    };

    if (detailed) {
      analysis.details = this._generateDetailedAnalysis(classified);
    }

    return analysis;
  }

  /**
   * 根据条件查询元件
   *
   * @param {string} rid - 项目 rid
   * @param {Object} criteria - 查询条件
   * @returns {Promise<Array>} 匹配的元件列表
   */
  async getComponentBy(rid, criteria) {
    const allComponentsObj = await this.client.getAllComponents(rid);
    // 转换为数组格式
    const allComponents = Object.values(allComponentsObj || {});

    // 支持多种查询条件
    if (criteria.id) {
      return allComponents.filter(c => c.id === criteria.id);
    }

    if (criteria.label) {
      return allComponents.filter(c => c.label === criteria.label);
    }

    if (criteria.labelContains) {
      return allComponents.filter(c =>
        c.label && c.label.includes(criteria.labelContains)
      );
    }

    if (criteria.type) {
      const type = criteria.type.toLowerCase();
      const classified = this.classifyComponents(allComponentsObj);
      return classified[type] || [];
    }

    if (criteria.definition) {
      return allComponents.filter(
        c => c.definition === criteria.definition
      );
    }

    if (criteria.category) {
      // category 支持：generator, line, load, transformer, etc.
      const category = criteria.category.toLowerCase();
      const classified = this.classifyComponents(allComponentsObj);
      return classified[category] || [];
    }

    // 支持自定义过滤函数
    if (criteria.filter && typeof criteria.filter === 'function') {
      return allComponents.filter(criteria.filter);
    }

    // 无条件返回所有元件
    return allComponents;
  }

  /**
   * 获取元件参数
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentId - 元件 ID
   * @returns {Promise<Object>} 元件参数
   */
  async getComponentParameters(rid, componentId) {
    const components = await this.getComponentBy(rid, { id: componentId });

    if (components.length === 0) {
      return {
        error: '元件不存在',
        componentId
      };
    }

    const component = components[0];
    return {
      id: component.id,
      label: component.label,
      definition: component.definition,
      type: this._getComponentType(component.definition),
      parameters: component.args || {},
      parameterCount: Object.keys(component.args || {}).length
    };
  }

  /**
   * 分类元件
   *
   * @param {Array|Object} components - 元件列表或对象
   * @returns {Object} 按类型分类的元件
   */
  classifyComponents(components) {
    const classified = {};

    // 初始化分类
    for (const category of Object.keys(this.componentTypeMap)) {
      classified[category] = [];
    }
    classified['unknown'] = [];

    // 处理对象格式的组件
    let componentArray = Array.isArray(components) ? components : Object.values(components || {});

    for (const comp of componentArray) {
      const category = this._getComponentType(comp.definition);
      if (classified[category]) {
        classified[category].push(comp);
      } else {
        classified['unknown'].push(comp);
      }
    }

    // 移除空分类
    for (const key of Object.keys(classified)) {
      if (classified[key].length === 0) {
        delete classified[key];
      }
    }

    return classified;
  }

  /**
   * 根据 definition 获取元件类型
   *
   * @param {string|null} definition - 元件定义
   * @returns {string} 元件类型
   */
  _getComponentType(definition) {
    if (!definition) {
      return 'unknown';
    }

    // 提取 definition 的最后一段（类名）
    // model/CloudPSS/SyncGeneratorRouter -> SyncGeneratorRouter
    const parts = definition.split('/');
    const className = parts[parts.length - 1];

    // 遍历类型映射，查找匹配
    for (const [type, patterns] of Object.entries(this.componentTypeMap)) {
      for (const pattern of patterns) {
        if (className === pattern || className.includes(pattern)) {
          return type;
        }
      }
    }

    return 'unknown';
  }

  /**
   * 生成分析摘要
   *
   * @param {Object} classified - 分类后的元件
   * @returns {Object} 分析摘要
   */
  _generateSummary(classified) {
    const summary = {
      total_components: 0,
      categories: []
    };

    for (const [category, components] of Object.entries(classified)) {
      summary.total_components += components.length;
      if (components.length > 0) {
        summary.categories.push({
          name: category,
          count: components.length,
          percentage: 0
        });
      }
    }

    // 计算百分比
    for (const cat of summary.categories) {
      cat.percentage = parseFloat(
        ((cat.count / summary.total_components) * 100).toFixed(2)
      );
    }

    // 按数量排序
    summary.categories.sort((a, b) => b.count - a.count);

    return summary;
  }

  /**
   * 生成详细分析报告
   *
   * @param {Object} classified - 分类后的元件
   * @returns {Object} 详细分析报告
   */
  _generateDetailedAnalysis(classified) {
    const details = {};

    for (const [category, components] of Object.entries(classified)) {
      details[category] = {
        count: components.length,
        components: components.map(c => ({
          id: c.id,
          label: c.label,
          definition: c.definition,
          parameterCount: Object.keys(c.args || {}).length
        })),
        parameterStatistics: this._calculateParameterStatistics(components)
      };
    }

    return details;
  }

  /**
   * 计算参数统计信息
   *
   * @param {Array} components - 元件列表
   * @returns {Object} 参数统计
   */
  _calculateParameterStatistics(components) {
    const allParams = new Set();
    const paramCount = [];

    for (const comp of components) {
      const args = comp.args || {};
      paramCount.push(Object.keys(args).length);
      for (const key of Object.keys(args)) {
        allParams.add(key);
      }
    }

    return {
      minParams: Math.min(...paramCount),
      maxParams: Math.max(...paramCount),
      avgParams: parseFloat(
        (paramCount.reduce((a, b) => a + b, 0) / paramCount.length).toFixed(2)
      ),
      uniqueParameters: allParams.size
    };
  }

  // =====================================================
  // P1 技能: 元件参数提取
  // =====================================================

  /**
   * 获取元件详细参数
   *
   * @param {string} componentType - 元件类型 (generator, transformer, line, load 等)
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 元件参数详情
   */
  getComponentParameters(componentType, data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath);
    }

    const components = data.all_components || data.components || [];
    const classified = this.classifyComponents(components);
    const targetComponents = classified[componentType] || [];

    if (targetComponents.length === 0) {
      return { found: false, message: `未找到类型为 ${componentType} 的元件` };
    }

    // 提取参数详情
    const paramDetails = targetComponents.map(comp => {
      const args = comp.args || {};
      return {
        id: comp.id,
        label: comp.label,
        definition: comp.definition,
        parameters: this._extractKeyParameters(componentType, args)
      };
    });

    return {
      found: true,
      type: componentType,
      count: targetComponents.length,
      components: paramDetails
    };
  }

  /**
   * 提取元件的关键参数
   *
   * @param {string} type - 元件类型
   * @param {Object} args - 参数对象
   * @returns {Object} 关键参数
   */
  _extractKeyParameters(type, args) {
    const result = {};

    // 根据元件类型提取关键参数
    switch (type) {
      case 'generator':
        // 发电机关键参数
        result.name = this._extractParamValue(args.Name || args.name);
        result.capacity = this._extractParamValue(args.Smva || args.Sn || args.capacity);
        result.activePower = this._extractParamValue(args.pf_P || args.P || args.Pg);
        result.reactivePower = this._extractParamValue(args.pf_Q || args.Q || args.Qg);
        result.voltage = this._extractParamValue(args.pf_V || args.V_mag || args.V);
        result.frequency = this._extractParamValue(args.freq);
        result.inertia = this._extractParamValue(args.Tj);
        result.xd = this._extractParamValue(args.Xd);
        result.xq = this._extractParamValue(args.Xq);
        break;

      case 'transformer':
        // 变压器关键参数
        result.name = this._extractParamValue(args.Name || args.name);
        result.capacity = this._extractParamValue(args.Tmva || args.Sn);
        result.primaryVoltage = this._extractParamValue(args.V1);
        result.secondaryVoltage = this._extractParamValue(args.V2);
        result.tapRatio = this._extractParamValue(args.Tap || args.InitTap);
        result.leakageReactance = this._extractParamValue(args.Xl || args.Xac);
        break;

      case 'line':
        // 线路关键参数
        result.name = this._extractParamValue(args.Name || args.name);
        result.length = this._extractParamValue(args.length || args.Length);
        result.resistance = this._extractParamValue(args.R);
        result.reactance = this._extractParamValue(args.X);
        result.susceptance = this._extractParamValue(args.B);
        result.rating = this._extractParamValue(args.Rate || args.rating);
        break;

      case 'load':
        // 负荷关键参数
        result.name = this._extractParamValue(args.Name || args.name);
        result.activePower = this._extractParamValue(args.P || args.Pd || args.Pload);
        result.reactivePower = this._extractParamValue(args.Q || args.Qd || args.Qload);
        break;

      case 'bus':
        // 母线关键参数
        result.name = this._extractParamValue(args.Name || args.name);
        result.nominalVoltage = this._extractParamValue(args.Vn || args.Vbase);
        result.baseVoltage = this._extractParamValue(args.Vb);
        break;

      default:
        // 通用参数提取
        result.raw = args;
    }

    return result;
  }

  /**
   * 提取参数值（处理 source 格式）
   */
  _extractParamValue(param) {
    if (!param) return null;
    if (typeof param === 'number' || typeof param === 'string') {
      return param;
    }
    if (typeof param === 'object' && param.source) {
      return param.source;
    }
    return param;
  }

  /**
   * 获取负荷参数详情
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 负荷参数详情
   */
  getLoadParameters(data = null) {
    return this.getComponentParameters('load', data);
  }

  /**
   * 获取总负荷
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 总负荷信息
   */
  getTotalLoad(data = null) {
    const loadParams = this.getLoadParameters(data);

    if (!loadParams.found) {
      return { found: false, totalP: 0, totalQ: 0 };
    }

    let totalP = 0;
    let totalQ = 0;
    const loadDetails = [];

    for (const load of loadParams.components) {
      const P = parseFloat(load.parameters.activePower) || 0;
      const Q = parseFloat(load.parameters.reactivePower) || 0;
      totalP += P;
      totalQ += Q;
      loadDetails.push({
        label: load.label,
        P: P,
        Q: Q
      });
    }

    return {
      found: true,
      totalP: parseFloat(totalP.toFixed(2)),
      totalQ: parseFloat(totalQ.toFixed(2)),
      count: loadParams.count,
      details: loadDetails,
      maxLoad: loadDetails.length > 0
        ? loadDetails.reduce((max, l) => l.P > max.P ? l : max, loadDetails[0])
        : null
    };
  }

  /**
   * 获取发电机容量排名
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 发电机容量排名
   */
  getGeneratorCapacityRanking(data = null) {
    const genParams = this.getComponentParameters('generator', data);

    if (!genParams.found) {
      return { found: false, generators: [] };
    }

    const generators = genParams.components
      .map(g => ({
        label: g.label,
        capacity: parseFloat(g.parameters.capacity) || 0,
        activePower: parseFloat(g.parameters.activePower) || 0,
        voltage: g.parameters.voltage
      }))
      .sort((a, b) => b.capacity - a.capacity);

    return {
      found: true,
      count: generators.length,
      generators: generators,
      maxCapacity: generators.length > 0 ? generators[0] : null,
      totalCapacity: generators.reduce((sum, g) => sum + g.capacity, 0)
    };
  }

  /**
   * 获取线路参数
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 线路参数详情
   */
  getLineParameters(data = null) {
    return this.getComponentParameters('line', data);
  }
}

module.exports = ComponentAnalysisSkill;
