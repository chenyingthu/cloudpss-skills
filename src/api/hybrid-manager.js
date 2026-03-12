/**
 * Hybrid API Manager - 混合API管理器
 *
 * 实现本地优先、API兜底的混合模式
 *
 * @module api/hybrid-manager
 */

const { localLoader } = require('../utils/local-loader');
const path = require('path');
const fs = require('fs');

/**
 * HybridAPIManager 类
 */
class HybridAPIManager {
  /**
   * @param {Object} client - CloudPSS API 客户端
   * @param {Object} options - 配置选项
   */
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;

    // 模式: 'local' | 'api' | 'auto'
    this.mode = options.mode || 'auto';

    // 本地模型存储路径
    this.localModelsPath = options.localModelsPath ||
      path.join(process.cwd(), 'local-models');

    // 模型注册表缓存
    this.registry = null;
    this.registryLoaded = false;

    // 加载注册表
    this._loadRegistry();
  }

  /**
   * 加载模型注册表
   */
  _loadRegistry() {
    const registryPath = path.join(this.localModelsPath, '.metadata', 'index.json');

    if (fs.existsSync(registryPath)) {
      try {
        this.registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
        this.registryLoaded = true;
        console.log(`[HybridAPI] Registry loaded: ${Object.keys(this.registry.models || {}).length} models`);
      } catch (e) {
        console.warn(`[HybridAPI] Failed to load registry: ${e.message}`);
        this.registry = { models: {}, aliases: {} };
      }
    } else {
      this.registry = { models: {}, aliases: {} };
    }
  }

  /**
   * 保存模型注册表
   */
  _saveRegistry() {
    const metadataPath = path.join(this.localModelsPath, '.metadata');
    if (!fs.existsSync(metadataPath)) {
      fs.mkdirSync(metadataPath, { recursive: true });
    }

    const registryPath = path.join(metadataPath, 'index.json');
    fs.writeFileSync(registryPath, JSON.stringify(this.registry, null, 2));
  }

  /**
   * 获取当前模式
   *
   * @returns {string} 当前模式
   */
  getMode() {
    return this.mode;
  }

  /**
   * 设置模式
   *
   * @param {string} mode - 模式 ('local' | 'api' | 'auto')
   */
  setMode(mode) {
    if (!['local', 'api', 'auto'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be 'local', 'api', or 'auto'`);
    }
    this.mode = mode;
    console.log(`[HybridAPI] Mode set to: ${mode}`);
  }

  /**
   * 获取拓扑数据（本地优先，API兜底）
   *
   * @param {string} ridOrTag - 算例RID 或 本地标签
   * @param {string} type - 拓扑类型 ('powerFlow' | 'emtp')
   * @returns {Promise<Object>} 拓扑数据
   */
  async getTopology(ridOrTag, type = 'powerFlow') {
    const source = this._resolveSource(ridOrTag);

    if (source.isLocal) {
      // 本地模式
      try {
        const data = localLoader.load(source.filePath);
        const components = localLoader.extractComponents(data);
        return { components, source: 'local', tag: source.tag };
      } catch (e) {
        console.warn(`[HybridAPI] Local load failed: ${e.message}`);

        // 如果模式是 auto，尝试 API（使用原始方法避免代理循环）
        if (this.mode === 'auto' && source.originalRid) {
          console.log(`[HybridAPI] Falling back to API...`);
          const fn = this.client._originalGetTopology || this.client.getTopology;
          return fn(source.originalRid, type);
        }
        throw e;
      }
    } else {
      // API 模式（使用原始方法避免代理循环）
      const fn = this.client._originalGetTopology || this.client.getTopology;
      return fn(ridOrTag, type);
    }
  }

  /**
   * 获取所有组件（本地优先，API兜底）
   *
   * @param {string} ridOrTag - 算例RID 或 本地标签
   * @returns {Promise<Object>} 组件数据
   */
  async getAllComponents(ridOrTag) {
    const source = this._resolveSource(ridOrTag);

    if (source.isLocal) {
      try {
        const data = localLoader.load(source.filePath);
        return {
          components: localLoader.extractComponents(data),
          source: 'local',
          tag: source.tag
        };
      } catch (e) {
        console.warn(`[HybridAPI] Local load failed: ${e.message}`);

        if (this.mode === 'auto' && source.originalRid) {
          console.log(`[HybridAPI] Falling back to API...`);
          // 使用原始方法避免代理循环
          const fn = this.client._originalGetAllComponents || this.client.getAllComponents;
          return fn(source.originalRid);
        }
        throw e;
      }
    } else {
      // API 模式（使用原始方法避免代理循环）
      const fn = this.client._originalGetAllComponents || this.client.getAllComponents;
      return fn(ridOrTag);
    }
  }

  /**
   * 解析数据来源
   *
   * @param {string} ridOrTag - RID 或 标签
   * @returns {Object} 来源信息
   */
  _resolveSource(ridOrTag) {
    // 检查是否是 RID 格式 (model/owner/key)
    const isRid = ridOrTag.includes('/');

    // 如果模式是 api，直接返回 API 来源
    if (this.mode === 'api') {
      return { isLocal: false, rid: ridOrTag, originalRid: ridOrTag };
    }

    // 检查是否是本地标签
    const tag = this._resolveTag(ridOrTag);

    if (tag) {
      const modelInfo = this.registry.models[tag];
      if (modelInfo) {
        const filePath = path.join(this.localModelsPath, 'models', tag, 'model.yaml.gz');
        return {
          isLocal: true,
          tag,
          filePath,
          originalRid: modelInfo.rid
        };
      }
    }

    // 如果模式是 local 且没有找到本地模型
    if (this.mode === 'local') {
      throw new Error(`Local model not found: ${ridOrTag}`);
    }

    // auto 模式下返回 API 来源
    return { isLocal: false, rid: ridOrTag, originalRid: ridOrTag };
  }

  /**
   * 解析标签（支持别名）
   *
   * @param {string} tagOrAlias - 标签或别名
   * @returns {string|null} 实际标签
   */
  _resolveTag(tagOrAlias) {
    // 直接匹配
    if (this.registry.models[tagOrAlias]) {
      return tagOrAlias;
    }

    // 别名匹配
    if (this.registry.aliases && this.registry.aliases[tagOrAlias]) {
      return this.registry.aliases[tagOrAlias];
    }

    return null;
  }

  /**
   * 检查本地是否有指定模型
   *
   * @param {string} tag - 模型标签
   * @returns {boolean} 是否存在
   */
  hasLocalModel(tag) {
    const resolvedTag = this._resolveTag(tag);
    if (!resolvedTag) return false;

    const modelInfo = this.registry.models[resolvedTag];
    if (!modelInfo) return false;

    const filePath = path.join(this.localModelsPath, 'models', resolvedTag, 'model.yaml.gz');
    return fs.existsSync(filePath);
  }

  /**
   * 获取本地模型信息
   *
   * @param {string} tag - 模型标签
   * @returns {Object|null} 模型信息
   */
  getLocalModelInfo(tag) {
    const resolvedTag = this._resolveTag(tag);
    if (!resolvedTag) return null;

    return this.registry.models[resolvedTag] || null;
  }

  /**
   * 列出所有本地模型
   *
   * @returns {Array} 模型列表
   */
  listLocalModels() {
    const models = [];

    for (const [tag, info] of Object.entries(this.registry.models || {})) {
      models.push({
        tag,
        ...info,
        aliases: Object.entries(this.registry.aliases || {})
          .filter(([alias, t]) => t === tag)
          .map(([alias]) => alias)
      });
    }

    return models;
  }

  /**
   * 注册本地模型
   *
   * @param {string} tag - 模型标签
   * @param {Object} metadata - 元数据
   */
  registerLocalModel(tag, metadata) {
    this.registry.models[tag] = {
      ...metadata,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this._saveRegistry();
    console.log(`[HybridAPI] Model registered: ${tag}`);
  }

  /**
   * 添加别名
   *
   * @param {string} tag - 模型标签
   * @param {string} alias - 别名
   */
  addAlias(tag, alias) {
    if (!this.registry.aliases) {
      this.registry.aliases = {};
    }

    // 检查标签是否存在
    if (!this.registry.models[tag]) {
      throw new Error(`Model not found: ${tag}`);
    }

    // 检查别名是否已被使用
    if (this.registry.aliases[alias] && this.registry.aliases[alias] !== tag) {
      throw new Error(`Alias already used by: ${this.registry.aliases[alias]}`);
    }

    this.registry.aliases[alias] = tag;
    this._saveRegistry();
    console.log(`[HybridAPI] Alias added: ${alias} -> ${tag}`);
  }

  /**
   * 移除本地模型
   *
   * @param {string} tag - 模型标签
   */
  removeLocalModel(tag) {
    // 删除模型文件
    const modelDir = path.join(this.localModelsPath, 'models', tag);
    if (fs.existsSync(modelDir)) {
      fs.rmSync(modelDir, { recursive: true });
    }

    // 从注册表删除
    delete this.registry.models[tag];

    // 删除相关别名
    for (const [alias, t] of Object.entries(this.registry.aliases || {})) {
      if (t === tag) {
        delete this.registry.aliases[alias];
      }
    }

    this._saveRegistry();
    console.log(`[HybridAPI] Model removed: ${tag}`);
  }

  /**
   * 获取模式状态摘要
   *
   * @returns {Object} 状态摘要
   */
  getStatus() {
    return {
      mode: this.mode,
      localModelsCount: Object.keys(this.registry.models || {}).length,
      aliasesCount: Object.keys(this.registry.aliases || {}).length,
      localModelsPath: this.localModelsPath
    };
  }

  /**
   * 运行仿真（自动选择本地或API）
   *
   * 注意：仿真始终需要 API，本地模式不支持
   *
   * @param {string} ridOrTag - 算例RID 或 本地标签
   * @param {number} jobIndex - 计算方案索引
   * @param {number} configIndex - 参数方案索引
   * @returns {Promise<Object>} 仿真任务信息
   */
  async runSimulation(ridOrTag, jobIndex = 0, configIndex = 0) {
    const source = this._resolveSource(ridOrTag);

    if (source.isLocal && source.originalRid) {
      // 本地模型需要通过原始 RID 运行
      console.log(`[HybridAPI] Running simulation for local model via API: ${source.originalRid}`);
      return this.client.runSimulation(source.originalRid, jobIndex, configIndex);
    }

    return this.client.runSimulation(ridOrTag, jobIndex, configIndex);
  }

  /**
   * 刷新注册表
   */
  refresh() {
    this._loadRegistry();
    console.log(`[HybridAPI] Registry refreshed`);
  }
}

module.exports = HybridAPIManager;