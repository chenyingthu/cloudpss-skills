/**
 * Create Skill - 算例创建技能
 *
 * 用于创建电力系统仿真算例
 *
 * 基于 CloudPSS Python SDK:
 * - Model.fetch(rid) 获取算例
 * - model.createJob(jobType, name) 创建计算方案
 * - model.createConfig(name) 创建参数方案
 * - model.addComponent() 添加元件
 */

class CreateSkill {
  constructor(client) {
    this.client = client;
  }

  /**
   * 创建新的仿真算例（通过复制现有算例）
   *
   * @param {Object} options - 创建选项
   * @param {string} options.sourceRid - 源算例 rid
   * @param {string} options.targetRid - 目标算例 rid（新算例的 rid）
   * @param {string} options.name - 算例名称
   * @param {string} options.description - 算例描述
   * @returns {Promise<Object>} 创建的算例信息
   *
   * @example
   * await create.simulation({
   *   sourceRid: 'model/CloudPSS/IEEE3',
   *   targetRid: 'model/MyProject/IEEE3_Copy',
   *   name: 'IEEE-14 节点系统'
   * });
   */
  async simulation(options) {
    const { sourceRid, targetRid, name, description } = options;

    // 验证必填参数
    if (!sourceRid) {
      throw new Error('源算例 rid (sourceRid) 为必填参数');
    }
    if (!targetRid) {
      throw new Error('目标算例 rid (targetRid) 为必填参数');
    }

    // 获取源算例
    const sourceModel = await this.client.fetchModel(sourceRid);

    // 保存为新项目
    await this.client.saveModel(sourceRid, targetRid);

    // 获取新算例
    const newModel = await this.client.fetchModel(targetRid);

    // 更新名称和描述（如果需要）
    if (name || description) {
      // Note: 当前 SDK 没有直接的 updateModel 方法
      // 可以通过修改元件或配置来间接更新
      console.log('[CreateSkill] 算例已创建，名称和描述更新需要平台支持');
    }

    return {
      rid: newModel.rid,
      name: newModel.name,
      description: newModel.description,
      jobCount: newModel.jobs.length,
      configCount: newModel.configs.length
    };
  }

  /**
   * 从模板创建算例
   *
   * @param {string} templateRid - 模板算例 rid
   * @param {string} targetRid - 目标算例 rid
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 创建的算例信息
   */
  async fromTemplate(templateRid, targetRid, options = {}) {
    return this.simulation({
      ...options,
      sourceRid: templateRid,
      targetRid
    });
  }

  /**
   * 添加元件到算例
   *
   * @param {string} rid - 算例 rid
   * @param {Object} options - 元件选项
   * @param {string} options.definition - 元件定义 rid
   * @param {string} options.label - 元件标签
   * @param {Object} options.args - 元件参数
   * @param {Object} options.pins - 元件引脚数据
   * @param {string} options.canvas - 所在图纸（可选）
   * @param {Object} options.position - 位置信息（可选）
   * @param {Object} options.size - 大小信息（可选）
   * @returns {Promise<Object>} 创建的元件信息
   */
  async addComponent(rid, options) {
    const { definition, label, args, pins, canvas, position, size } = options;

    if (!rid || !definition || !label || !args || !pins) {
      throw new Error('rid, definition, label, args, pins 为必填参数');
    }

    return this.client.addComponent(rid, definition, label, args, pins, canvas, position, size);
  }

  /**
   * 批量添加元件
   *
   * @param {string} rid - 算例 rid
   * @param {Array<Object>} components - 元件列表
   * @returns {Promise<Array>} 创建的元件列表
   */
  async addBatchComponents(rid, components) {
    const results = [];
    for (const comp of components) {
      try {
        const result = await this.addComponent(rid, comp);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * 更新元件
   *
   * @param {string} rid - 算例 rid
   * @param {string} componentKey - 元件 key
   * @param {Object} updates - 更新内容
   * @param {string} updates.label - 新标签（可选）
   * @param {Object} updates.args - 新参数（可选）
   * @param {Object} updates.pins - 新引脚（可选）
   * @returns {Promise<boolean>} 是否成功更新
   */
  async updateComponent(rid, componentKey, updates = {}) {
    const { label } = updates;
    return this.client.updateComponent(rid, componentKey, label);
  }

  /**
   * 创建参数方案
   *
   * @param {string} rid - 算例 rid
   * @param {string} name - 参数方案名称
   * @returns {Promise<Object>} 创建的参数方案
   */
  async createConfig(rid, name) {
    return this.client.createConfig(rid, name);
  }

  /**
   * 创建计算方案
   *
   * @param {string} rid - 算例 rid
   * @param {string} jobType - 计算方案类型
   * @param {string} name - 计算方案名称
   * @returns {Promise<Object>} 创建的计算方案
   */
  async createJob(rid, jobType, name) {
    return this.client.createJob(rid, jobType, name);
  }

  /**
   * 保存算例
   *
   * @param {string} rid - 算例 rid
   * @param {string} newKey - 新名称（可选，用于另存为）
   * @returns {Promise<boolean>} 是否成功保存
   */
  async save(rid, newKey = null) {
    return this.client.saveModel(rid, newKey);
  }
}

module.exports = CreateSkill;
