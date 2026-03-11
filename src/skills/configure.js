/**
 * Configure Skill - 参数配置技能
 *
 * 用于配置电力系统仿真算例的参数
 *
 * 基于 CloudPSS Python SDK:
 * - model.configs 获取参数方案
 * - model.updateComponent 更新元件参数
 * - model.createConfig 创建参数方案
 */

class ConfigureSkill {
  constructor(client) {
    this.client = client;
  }

  /**
   * 获取算例的参数方案
   *
   * @param {string} rid - 项目 rid
   * @returns {Promise<Array>} 参数方案列表
   */
  async getConfigs(rid) {
    const model = await this.client.fetchModel(rid);
    return model.configs || [];
  }

  /**
   * 创建新的参数方案
   *
   * @param {string} rid - 项目 rid
   * @param {string} name - 参数方案名称
   * @returns {Promise<Object>} 创建的参数方案
   */
  async createConfig(rid, name) {
    return this.client.createConfig(rid, name);
  }

  /**
   * 更新元件参数
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 元件 key
   * @param {Object} args - 元件参数
   * @returns {Promise<boolean>} 是否成功更新
   */
  async updateComponent(rid, componentKey, args) {
    return this.client.updateComponent(rid, componentKey, null, args);
  }

  /**
   * 批量更新元件参数
   *
   * @param {string} rid - 项目 rid
   * @param {Array<Object>} updates - 更新列表
   * @returns {Promise<Array>} 更新结果
   */
  async batchUpdateComponents(rid, updates) {
    const results = [];
    for (const update of updates) {
      try {
        await this.updateComponent(rid, update.componentKey, update.args);
        results.push({ success: true, componentKey: update.componentKey });
      } catch (error) {
        results.push({ success: false, componentKey: update.componentKey, error: error.message });
      }
    }
    return results;
  }

  /**
   * 配置发电机参数
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 发电机元件 key
   * @param {Object} params - 发电机参数
   * @returns {Promise<boolean>} 是否成功更新
   */
  async configureGenerator(rid, componentKey, params) {
    const { p, v, q, model } = params;
    const args = {};

    if (p !== undefined) args.P = p;
    if (v !== undefined) args.V = v;
    if (q !== undefined) args.Q = q;
    if (model !== undefined) args.Model = model;

    return this.updateComponent(rid, componentKey, args);
  }

  /**
   * 配置负荷参数
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 负荷元件 key
   * @param {Object} params - 负荷参数
   * @returns {Promise<boolean>} 是否成功更新
   */
  async configureLoad(rid, componentKey, params) {
    const { p, q, model } = params;
    const args = {};

    if (p !== undefined) args.P = p;
    if (q !== undefined) args.Q = q;
    if (model !== undefined) args.Model = model;

    return this.updateComponent(rid, componentKey, args);
  }

  /**
   * 配置变压器参数
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 变压器元件 key
   * @param {Object} params - 变压器参数
   * @returns {Promise<boolean>} 是否成功更新
   */
  async configureTransformer(rid, componentKey, params) {
    const { ratio, angle, tap } = params;
    const args = {};

    if (ratio !== undefined) args.Ratio = ratio;
    if (angle !== undefined) args.Angle = angle;
    if (tap !== undefined) args.Tap = tap;

    return this.updateComponent(rid, componentKey, args);
  }

  /**
   * 配置线路参数
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 线路元件 key
   * @param {Object} params - 线路参数
   * @returns {Promise<boolean>} 是否成功更新
   */
  async configureLine(rid, componentKey, params) {
    const { r, x, b, g } = params;
    const args = {};

    if (r !== undefined) args.R = r;
    if (x !== undefined) args.X = x;
    if (b !== undefined) args.B = b;
    if (g !== undefined) args.G = g;

    return this.updateComponent(rid, componentKey, args);
  }

  /**
   * 配置系统基准值
   *
   * @param {string} rid - 项目 rid
   * @param {Object} params - 系统参数
   * @returns {Promise<boolean>} 是否成功更新
   */
  async configureSystemBase(rid, params) {
    const { baseMVA, baseFreq } = params;
    const args = {};

    if (baseMVA !== undefined) args.BaseMVA = baseMVA;
    if (baseFreq !== undefined) args.BaseFreq = baseFreq;

    // 系统参数通常存储在特殊的 system 元件中
    return this.updateComponent(rid, 'system', args);
  }

  /**
   * 获取元件当前参数
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 元件 key
   * @returns {Promise<Object>} 元件参数
   */
  async getComponentArgs(rid, componentKey) {
    const components = await this.client.getAllComponents(rid);
    const component = components?.[componentKey];
    return component?.args || {};
  }

  /**
   * 保存项目
   *
   * @param {string} rid - 项目 rid
   * @param {string} newKey - 新名称（可选，用于另存为）
   * @returns {Promise<boolean>} 是否成功保存
   */
  async save(rid, newKey = null) {
    return this.client.saveModel(rid, newKey);
  }
}

module.exports = ConfigureSkill;
