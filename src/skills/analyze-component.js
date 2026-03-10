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
 */

class ComponentAnalysisSkill {
  constructor(client) {
    this.client = client;
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
}

module.exports = ComponentAnalysisSkill;
