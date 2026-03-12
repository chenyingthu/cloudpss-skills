/**
 * Local Model Manager Skill - 本地模型管理技能
 *
 * 用于将验证通过的模型dump到本地，支持tag标记和别名管理
 *
 * 功能:
 * - dumpToLocal: 将模型保存到本地
 * - loadFromLocal: 从本地加载模型
 * - setTag/addAlias: 标签和别名管理
 * - listModels/hasModel/deleteModel: 模型管理
 *
 * @module skills/local-model-manager
 */

const { localLoader } = require('../utils/local-loader');
const HybridAPIManager = require('../api/hybrid-manager');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class LocalModelManagerSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;

    // 本地模型存储路径
    this.localModelsPath = options.localModelsPath ||
      path.join(process.cwd(), 'local-models');

    // 初始化 HybridAPIManager 用于模式管理
    this.hybridManager = new HybridAPIManager(client, {
      localModelsPath: this.localModelsPath,
      ...options
    });
  }

  /**
   * 将模型dump到本地
   *
   * @param {string} rid - 算例RID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} dump结果
   */
  async dumpToLocal(rid, options = {}) {
    const {
      tag = null,              // 自定义标签
      validate = true,         // 是否先验证
      validateOptions = {},    // 验证选项
      overwrite = false,       // 是否覆盖已存在的模型
      description = '',        // 描述
      metadata = {}            // 额外元数据
    } = options;

    console.log(`\n[LocalModelManager] 开始dump模型: ${rid}`);

    // 生成标签
    const modelTag = tag || this._generateTag(rid);

    // 检查是否已存在
    if (!overwrite && this.hybridManager.hasLocalModel(modelTag)) {
      throw new Error(`模型已存在: ${modelTag}。使用 overwrite=true 覆盖`);
    }

    // 验证模型（可选）
    if (validate) {
      console.log(`[LocalModelManager] 验证模型...`);
      const ModelValidationSkill = require('./model-validation');
      const validator = new ModelValidationSkill(this.client, this.options);
      const validationResult = await validator.quickValidate(rid);

      if (validationResult.overallStatus === 'invalid') {
        console.log(`[LocalModelManager] 验证失败: ${validationResult.healthScore}/100`);
        return {
          success: false,
          tag: modelTag,
          error: 'validation_failed',
          validationResult
        };
      }

      console.log(`[LocalModelManager] 验证通过: ${validationResult.healthScore}/100`);
      metadata.validationResult = {
        status: validationResult.overallStatus,
        healthScore: validationResult.healthScore,
        timestamp: validationResult.timestamp
      };
    }

    // 获取模型信息
    const modelInfo = await this._getModelInfo(rid);

    // 准备保存目录
    const modelDir = path.join(this.localModelsPath, 'models', modelTag);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // dump模型文件
    const filePath = path.join(modelDir, 'model.yaml.gz');
    console.log(`[LocalModelManager] 保存到: ${filePath}`);

    try {
      await this.client.dumpModel(rid, filePath, 'yaml', 'gzip');
    } catch (error) {
      // 如果dump失败，尝试备用方法
      console.log(`[LocalModelManager] dumpModel失败，尝试手动获取...`);
      await this._manualDump(rid, filePath);
    }

    // 计算文件哈希
    const fileHash = this._calculateFileHash(filePath);

    // 保存元数据
    const fullMetadata = {
      rid,
      tag: modelTag,
      description: description || modelInfo.name || rid,
      owner: modelInfo.owner,
      modelName: modelInfo.name,
      dumpedAt: new Date().toISOString(),
      fileHash,
      fileSize: fs.statSync(filePath).size,
      ...metadata
    };

    // 保存元数据文件
    const metaPath = path.join(modelDir, 'metadata.json');
    fs.writeFileSync(metaPath, JSON.stringify(fullMetadata, null, 2));

    // 注册到 HybridAPIManager
    this.hybridManager.registerLocalModel(modelTag, fullMetadata);

    console.log(`[LocalModelManager] dump完成: ${modelTag}`);

    return {
      success: true,
      tag: modelTag,
      rid,
      filePath,
      metadata: fullMetadata
    };
  }

  /**
   * 从本地加载模型
   *
   * @param {string} tag - 模型标签
   * @returns {Object} 模型数据
   */
  loadFromLocal(tag) {
    const resolvedTag = this.hybridManager._resolveTag(tag);
    if (!resolvedTag) {
      throw new Error(`模型不存在: ${tag}`);
    }

    const filePath = path.join(this.localModelsPath, 'models', resolvedTag, 'model.yaml.gz');

    console.log(`[LocalModelManager] 加载本地模型: ${tag}`);

    const data = localLoader.load(filePath);
    const components = localLoader.extractComponents(data);
    const metadata = this.hybridManager.getLocalModelInfo(resolvedTag);

    return {
      tag: resolvedTag,
      data,
      components,
      metadata,
      source: 'local'
    };
  }

  /**
   * 设置标签（为已存在的模型设置新标签）
   *
   * @param {string} oldTag - 原标签
   * @param {string} newTag - 新标签
   */
  setTag(oldTag, newTag) {
    const resolvedTag = this.hybridManager._resolveTag(oldTag);
    if (!resolvedTag) {
      throw new Error(`模型不存在: ${oldTag}`);
    }

    if (this.hybridManager.hasLocalModel(newTag)) {
      throw new Error(`标签已存在: ${newTag}`);
    }

    // 重命名目录
    const oldDir = path.join(this.localModelsPath, 'models', resolvedTag);
    const newDir = path.join(this.localModelsPath, 'models', newTag);

    if (fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    }

    // 更新注册表
    const modelInfo = this.hybridManager.registry.models[resolvedTag];
    delete this.hybridManager.registry.models[resolvedTag];
    modelInfo.tag = newTag;
    this.hybridManager.registry.models[newTag] = modelInfo;

    // 更新别名
    for (const [alias, t] of Object.entries(this.hybridManager.registry.aliases || {})) {
      if (t === resolvedTag) {
        this.hybridManager.registry.aliases[alias] = newTag;
      }
    }

    this.hybridManager._saveRegistry();
    console.log(`[LocalModelManager] 标签已更新: ${oldTag} -> ${newTag}`);
  }

  /**
   * 添加别名
   *
   * @param {string} tag - 模型标签
   * @param {string} alias - 别名
   */
  addAlias(tag, alias) {
    this.hybridManager.addAlias(tag, alias);
    console.log(`[LocalModelManager] 别名已添加: ${alias} -> ${tag}`);
  }

  /**
   * 移除别名
   *
   * @param {string} alias - 别名
   */
  removeAlias(alias) {
    if (this.hybridManager.registry.aliases && this.hybridManager.registry.aliases[alias]) {
      delete this.hybridManager.registry.aliases[alias];
      this.hybridManager._saveRegistry();
      console.log(`[LocalModelManager] 别名已移除: ${alias}`);
    }
  }

  /**
   * 列出所有本地模型
   *
   * @param {Object} options - 查询选项
   * @returns {Array} 模型列表
   */
  listModels(options = {}) {
    const { filter = null, sortBy = 'dumpedAt', sortOrder = 'desc' } = options;

    let models = this.hybridManager.listLocalModels();

    // 过滤
    if (filter) {
      models = models.filter(m => {
        if (typeof filter === 'string') {
          return m.tag.includes(filter) ||
                 (m.description && m.description.includes(filter)) ||
                 (m.rid && m.rid.includes(filter));
        }
        if (typeof filter === 'function') {
          return filter(m);
        }
        return true;
      });
    }

    // 排序
    models.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return models;
  }

  /**
   * 检查模型是否存在
   *
   * @param {string} tag - 模型标签或别名
   * @returns {boolean} 是否存在
   */
  hasModel(tag) {
    return this.hybridManager.hasLocalModel(tag);
  }

  /**
   * 获取模型信息
   *
   * @param {string} tag - 模型标签
   * @returns {Object|null} 模型信息
   */
  getModelInfo(tag) {
    return this.hybridManager.getLocalModelInfo(tag);
  }

  /**
   * 删除本地模型
   *
   * @param {string} tag - 模型标签
   * @returns {Object} 删除结果
   */
  deleteModel(tag) {
    const resolvedTag = this.hybridManager._resolveTag(tag);
    if (!resolvedTag) {
      throw new Error(`模型不存在: ${tag}`);
    }

    const modelInfo = this.hybridManager.getLocalModelInfo(resolvedTag);
    this.hybridManager.removeLocalModel(resolvedTag);

    console.log(`[LocalModelManager] 模型已删除: ${tag}`);

    return {
      success: true,
      tag: resolvedTag,
      deletedInfo: modelInfo
    };
  }

  /**
   * 清理无效的本地模型引用
   */
  cleanup() {
    console.log(`[LocalModelManager] 开始清理...`);

    const cleaned = [];
    const models = this.hybridManager.registry.models || {};

    for (const [tag, info] of Object.entries(models)) {
      const filePath = path.join(this.localModelsPath, 'models', tag, 'model.yaml.gz');
      if (!fs.existsSync(filePath)) {
        delete this.hybridManager.registry.models[tag];
        cleaned.push(tag);
        console.log(`[LocalModelManager] 清理无效引用: ${tag}`);
      }
    }

    // 清理无效别名
    const aliases = this.hybridManager.registry.aliases || {};
    for (const [alias, tag] of Object.entries(aliases)) {
      if (!this.hybridManager.registry.models[tag]) {
        delete this.hybridManager.registry.aliases[alias];
        cleaned.push(`alias:${alias}`);
      }
    }

    if (cleaned.length > 0) {
      this.hybridManager._saveRegistry();
    }

    console.log(`[LocalModelManager] 清理完成: ${cleaned.length} 项`);

    return {
      cleaned,
      count: cleaned.length
    };
  }

  /**
   * 导出模型到指定路径
   *
   * @param {string} tag - 模型标签
   * @param {string} exportPath - 导出路径
   * @param {Object} options - 导出选项
   */
  exportModel(tag, exportPath, options = {}) {
    const { format = 'yaml', compress = true, includeMetadata = true } = options;

    const model = this.loadFromLocal(tag);
    const targetPath = path.resolve(exportPath);

    // 保存模型文件
    const savedPath = localLoader.save(
      compress ? `${targetPath}.gz` : targetPath,
      model.data,
      { format, compress }
    );

    // 保存元数据
    if (includeMetadata) {
      const metaPath = path.join(path.dirname(targetPath), `${path.basename(targetPath)}.meta.json`);
      fs.writeFileSync(metaPath, JSON.stringify(model.metadata, null, 2));
    }

    console.log(`[LocalModelManager] 模型已导出: ${savedPath}`);

    return {
      success: true,
      tag,
      exportPath: savedPath
    };
  }

  /**
   * 获取存储统计信息
   */
  getStats() {
    const models = this.listModels();
    let totalSize = 0;

    for (const model of models) {
      const filePath = path.join(this.localModelsPath, 'models', model.tag, 'model.yaml.gz');
      if (fs.existsSync(filePath)) {
        totalSize += fs.statSync(filePath).size;
      }
    }

    return {
      modelCount: models.length,
      aliasCount: Object.keys(this.hybridManager.registry.aliases || {}).length,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      localModelsPath: this.localModelsPath
    };
  }

  // ========== 内部方法 ==========

  /**
   * 生成标签
   */
  _generateTag(rid) {
    // 从 RID 提取关键部分: model/owner/key -> owner_key
    const parts = rid.split('/');
    if (parts.length >= 3) {
      return `${parts[1]}_${parts[2]}`;
    }
    // 使用 RID 的哈希
    return `model_${crypto.createHash('md5').update(rid).digest('hex').substring(0, 8)}`;
  }

  /**
   * 获取模型信息
   */
  async _getModelInfo(rid) {
    try {
      const model = await this.client.fetchModel(rid);
      return {
        name: model.name || rid,
        owner: model.owner || rid.split('/')[1],
        rid
      };
    } catch (error) {
      return {
        name: rid,
        owner: rid.split('/')[1],
        rid
      };
    }
  }

  /**
   * 计算文件哈希
   */
  _calculateFileHash(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * 手动dump（备用方法）
   */
  async _manualDump(rid, filePath) {
    // 获取拓扑数据
    const topologyData = await this.client.getTopology(rid, 'powerFlow');

    // 获取所有组件
    const components = await this.client.getAllComponents(rid);

    // 构建保存数据
    const data = {
      rid,
      dumpedAt: new Date().toISOString(),
      components: { ...topologyData.components, ...components },
      revision: {
        implements: {
          diagram: {
            cells: { ...topologyData.components, ...components }
          }
        }
      }
    };

    // 使用 localLoader 保存
    localLoader.save(filePath, data, { format: 'yaml', compress: true });
  }
}

module.exports = LocalModelManagerSkill;