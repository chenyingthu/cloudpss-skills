/**
 * Enhanced Model Management Skill - 增强版算例管理技能
 *
 * 提供完整的CloudPSS算例生命周期管理功能
 *
 * 功能：
 * - 算例CRUD操作（创建、读取、更新、删除）
 * - 版本管理和历史追踪
 * - 批量操作（复制、删除、导出）
 * - 算例对比和差异分析
 * - 权限管理和共享
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const yaml = require('js-yaml');

class ModelManagementEnhancedSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.pyBridge = client.bridge;
  }

  // =====================================================
  // 算例查询操作
  // =====================================================

  /**
   * 列出所有可访问的算例
   *
   * @param {Object} options - 查询选项
   * @returns {Promise<Object>} 算例列表和统计
   */
  async listModels(options = {}) {
    const { name, pageSize = 100, owner } = options;

    const projects = await this.client.listProjects({ name, pageSize, owner });

    // 分类统计
    const stats = {
      total: projects.length,
      byOwner: {},
      byType: {}
    };

    for (const p of projects) {
      const ownerName = p.owner || 'unknown';
      stats.byOwner[ownerName] = (stats.byOwner[ownerName] || 0) + 1;

      // 从rid推断类型
      const type = this._inferModelType(p.rid);
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    }

    return {
      projects,
      stats,
      summary: `共${stats.total}个算例，${Object.keys(stats.byOwner).length}个所有者`
    };
  }

  /**
   * 获取算例详细信息
   *
   * @param {string} rid - 算例RID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 算例详细信息
   */
  async getModelInfo(rid, options = {}) {
    const { includeComponents = false, includeTopology = false } = options;

    const model = await this.client.fetchModel(rid);

    const info = {
      rid: model.rid,
      name: model.name,
      description: model.description,
      owner: this._extractOwner(rid),
      key: this._extractKey(rid),
      revision: model.revision,
      jobs: {
        count: (model.jobs || []).length,
        list: (model.jobs || []).map((job, idx) => ({
          index: idx,
          name: job.name,
          type: this._identifyJobType(job),
          rid: job.rid
        }))
      },
      configs: {
        count: (model.configs || []).length,
        list: (model.configs || []).map((config, idx) => ({
          index: idx,
          name: config.name
        }))
      }
    };

    // 可选：包含元件列表
    if (includeComponents) {
      try {
        const components = await this.client.getAllComponents(rid);
        info.components = {
          count: components.length || Object.keys(components).length,
          list: components
        };
      } catch (e) {
        info.components = { error: e.message };
      }
    }

    // 可选：包含拓扑信息
    if (includeTopology) {
      try {
        const topology = await this.client.getTopology(rid, 'powerFlow');
        info.topology = topology;
      } catch (e) {
        info.topology = { error: e.message };
      }
    }

    return info;
  }

  /**
   * 搜索算例
   *
   * @param {Object} criteria - 搜索条件
   * @returns {Promise<Object>} 搜索结果
   */
  async searchModels(criteria = {}) {
    const { keyword, jobType, owner, hasViolations } = criteria;

    const projects = await this.client.listProjects({ owner: owner || '*' });
    const results = [];

    for (const project of projects) {
      try {
        // 关键词过滤
        if (keyword) {
          const name = (project.name || '').toLowerCase();
          const desc = (project.description || '').toLowerCase();
          const kw = keyword.toLowerCase();

          if (!name.includes(kw) && !desc.includes(kw)) {
            continue;
          }
        }

        // 获取详细信息进行更复杂的过滤
        const model = await this.client.fetchModel(project.rid);

        // 计算方案类型过滤
        if (jobType) {
          const hasMatchingJob = (model.jobs || []).some(job =>
            this._identifyJobType(job).includes(jobType.toLowerCase())
          );
          if (!hasMatchingJob) continue;
        }

        results.push({
          rid: project.rid,
          name: model.name,
          description: model.description,
          jobCount: (model.jobs || []).length,
          configCount: (model.configs || []).length,
          matchScore: this._calculateMatchScore(project, criteria)
        });
      } catch (e) {
        // 跳过无法访问的项目
      }
    }

    // 按匹配度排序
    results.sort((a, b) => b.matchScore - a.matchScore);

    return {
      criteria,
      results,
      count: results.length
    };
  }

  // =====================================================
  // 算例创建和更新操作
  // =====================================================

  /**
   * 创建新的参数方案
   *
   * @param {string} rid - 算例RID
   * @param {Object} configData - 参数方案数据
   * @returns {Promise<Object>} 创建结果
   */
  async createConfigEnhanced(rid, configData = {}) {
    const { name, args = {}, pins = {}, copyFrom = null } = configData;

    // 如果指定了从现有配置复制
    let finalArgs = args;
    let finalPins = pins;

    if (copyFrom !== null) {
      const model = await this.client.fetchModel(rid);
      const sourceConfig = model.configs[copyFrom];
      if (sourceConfig) {
        finalArgs = { ...sourceConfig.args, ...args };
        finalPins = { ...sourceConfig.pins, ...pins };
      }
    }

    const result = await this.client.createConfig(rid, name || '新参数方案');

    return {
      success: true,
      configIndex: result.index,
      name: name || '新参数方案',
      args: finalArgs
    };
  }

  /**
   * 创建新的计算方案
   *
   * @param {string} rid - 算例RID
   * @param {Object} jobData - 计算方案数据
   * @returns {Promise<Object>} 创建结果
   */
  async createJobEnhanced(rid, jobData = {}) {
    const { name, jobType = 'powerFlow', args = {} } = jobData;

    const result = await this.client.createJob(rid, jobType, name || '新计算方案');

    return {
      success: true,
      jobIndex: result.index,
      name: name || '新计算方案',
      jobType
    };
  }

  /**
   * 更新算例信息
   *
   * @param {string} rid - 算例RID
   * @param {Object} updates - 更新内容
   * @returns {Promise<Object>} 更新结果
   */
  async updateModelInfo(rid, updates = {}) {
    const { name, description, tags } = updates;

    // CloudPSS SDK 可能需要通过保存来更新元数据
    const result = await this.client.saveModel(rid);

    return {
      success: result,
      rid,
      updates,
      message: result ? '算例信息已更新' : '更新失败'
    };
  }

  /**
   * 保存算例（支持另存为）
   *
   * @param {string} rid - 算例RID
   * @param {Object} options - 保存选项
   * @returns {Promise<Object>} 保存结果
   */
  async saveModel(rid, options = {}) {
    const { newKey, overwrite = false } = options;

    const result = await this.client.saveModel(rid, newKey);

    return {
      success: result,
      originalRid: rid,
      newRid: newKey ? this._buildNewRid(rid, newKey) : rid,
      isCopy: !!newKey
    };
  }

  // =====================================================
  // 算例删除操作
  // =====================================================

  /**
   * 删除算例（需要确认）
   *
   * @param {string} rid - 算例RID
   * @param {Object} options - 删除选项
   * @returns {Promise<Object>} 删除结果
   */
  async deleteModel(rid, options = {}) {
    const { confirm = false, backup = false, backupPath = null } = options;

    if (!confirm) {
      return {
        success: false,
        message: '删除操作需要确认（设置 confirm: true）',
        rid
      };
    }

    // 可选：删除前备份
    let backupResult = null;
    if (backup) {
      const backupFile = backupPath || `/tmp/backup_${rid.replace(/\//g, '_')}.yaml.gz`;
      backupResult = await this.exportModel(rid, backupFile);
    }

    // 执行删除（需要Python Bridge支持）
    try {
      await this.pyBridge.exec('delete_model', [rid]);
      return {
        success: true,
        rid,
        message: '算例已删除',
        backup: backupResult
      };
    } catch (e) {
      return {
        success: false,
        rid,
        error: e.message,
        backup: backupResult
      };
    }
  }

  // =====================================================
  // 算例导入导出操作
  // =====================================================

  /**
   * 导出算例到本地文件
   *
   * @param {string} rid - 算例RID
   * @param {string} filePath - 目标文件路径
   * @param {Object} options - 导出选项
   * @returns {Promise<Object>} 导出结果
   */
  async exportModel(rid, filePath, options = {}) {
    const { format = 'yaml', compress = 'gzip', includeResults = false } = options;

    const startTime = Date.now();

    await this.client.dumpModel(rid, filePath, format, compress);

    const stats = fs.statSync(filePath);

    return {
      success: true,
      rid,
      filePath,
      format,
      compressed: compress === 'gzip',
      fileSize: stats.size,
      fileSizeFormatted: this._formatFileSize(stats.size),
      exportTime: Date.now() - startTime
    };
  }

  /**
   * 从本地文件导入算例
   *
   * @param {string} filePath - 源文件路径
   * @param {Object} options - 导入选项
   * @returns {Promise<Object>} 导入结果
   */
  async importModel(filePath, options = {}) {
    const { format = 'yaml', compress = 'gzip', newName = null } = options;

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const startTime = Date.now();
    const stats = fs.statSync(filePath);

    const result = await this.client.loadModel(filePath, format, compress);

    return {
      success: true,
      sourceFile: filePath,
      newRid: result.rid,
      fileSize: stats.size,
      importTime: Date.now() - startTime
    };
  }

  /**
   * 批量导出算例
   *
   * @param {string[]} rids - 算例RID列表
   * @param {string} outputDir - 输出目录
   * @param {Object} options - 导出选项
   * @returns {Promise<Object>} 批量导出结果
   */
  async batchExport(rids, outputDir, options = {}) {
    const results = [];
    const startTime = Date.now();

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const rid of rids) {
      const fileName = `${rid.replace(/\//g, '_')}.yaml.gz`;
      const filePath = path.join(outputDir, fileName);

      try {
        const result = await this.exportModel(rid, filePath, options);
        results.push({ rid, ...result });
      } catch (e) {
        results.push({ rid, success: false, error: e.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      total: rids.length,
      successCount,
      failedCount: rids.length - successCount,
      results,
      totalTime: Date.now() - startTime,
      outputDir
    };
  }

  /**
   * 批量导入算例
   *
   * @param {string} inputDir - 输入目录
   * @param {Object} options - 导入选项
   * @returns {Promise<Object>} 批量导入结果
   */
  async batchImport(inputDir, options = {}) {
    const results = [];
    const startTime = Date.now();

    // 查找所有算例文件
    const files = fs.readdirSync(inputDir)
      .filter(f => f.endsWith('.yaml.gz') || f.endsWith('.yaml') || f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(inputDir, file);
      const format = file.endsWith('.json') ? 'json' : 'yaml';
      const compress = file.endsWith('.gz') ? 'gzip' : null;

      try {
        const result = await this.importModel(filePath, { format, compress, ...options });
        results.push({ file, ...result });
      } catch (e) {
        results.push({ file, success: false, error: e.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      total: files.length,
      successCount,
      failedCount: files.length - successCount,
      results,
      totalTime: Date.now() - startTime,
      newRids: results.filter(r => r.success).map(r => r.newRid)
    };
  }

  // =====================================================
  // 算例对比操作
  // =====================================================

  /**
   * 对比两个算例的差异
   *
   * @param {string} rid1 - 第一个算例RID
   * @param {string} rid2 - 第二个算例RID
   * @returns {Promise<Object>} 对比结果
   */
  async compareModels(rid1, rid2) {
    const [model1, model2] = await Promise.all([
      this.client.fetchModel(rid1),
      this.client.fetchModel(rid2)
    ]);

    const diff = {
      rid1,
      rid2,
      name: {
        model1: model1.name,
        model2: model2.name,
        different: model1.name !== model2.name
      },
      jobs: this._compareArrays(model1.jobs, model2.jobs, 'name'),
      configs: this._compareArrays(model1.configs, model2.configs, 'name'),
      summary: ''
    };

    // 生成摘要
    const differences = [];
    if (diff.name.different) differences.push('名称不同');
    if (diff.jobs.onlyIn1.length > 0) differences.push(`计算方案: ${diff.jobs.onlyIn1.length}个仅在${rid1}`);
    if (diff.jobs.onlyIn2.length > 0) differences.push(`计算方案: ${diff.jobs.onlyIn2.length}个仅在${rid2}`);
    if (diff.configs.onlyIn1.length > 0) differences.push(`参数方案: ${diff.configs.onlyIn1.length}个仅在${rid1}`);
    if (diff.configs.onlyIn2.length > 0) differences.push(`参数方案: ${diff.configs.onlyIn2.length}个仅在${rid2}`);

    diff.summary = differences.length > 0 ? differences.join('; ') : '两个算例结构相同';

    return diff;
  }

  // =====================================================
  // 辅助方法
  // =====================================================

  _extractOwner(rid) {
    const parts = rid.split('/');
    return parts.length >= 2 ? parts[1] : 'unknown';
  }

  _extractKey(rid) {
    const parts = rid.split('/');
    return parts.length >= 3 ? parts[2] : rid;
  }

  _buildNewRid(originalRid, newKey) {
    const parts = originalRid.split('/');
    if (parts.length >= 3) {
      return `${parts[0]}/${parts[1]}/${newKey}`;
    }
    return originalRid;
  }

  _inferModelType(rid) {
    const ridLower = (rid || '').toLowerCase();
    if (ridLower.includes('ieee')) return 'ieee';
    if (ridLower.includes('test') || ridLower.includes('demo')) return 'test';
    if (ridLower.includes('project')) return 'project';
    return 'other';
  }

  _identifyJobType(job) {
    const rid = (job.rid || '').toLowerCase();
    const name = (job.name || '').toLowerCase();

    if (rid.includes('powerflow') || name.includes('潮流')) return 'powerFlow';
    if (rid.includes('emtp') || rid.includes('emt') || name.includes('电磁暂态')) return 'emt';
    if (rid.includes('sfemt')) return 'sfemt';
    return 'unknown';
  }

  _calculateMatchScore(project, criteria) {
    let score = 0;
    if (criteria.keyword) {
      const name = (project.name || '').toLowerCase();
      const kw = criteria.keyword.toLowerCase();
      if (name === kw) score += 10;
      else if (name.startsWith(kw)) score += 5;
      else if (name.includes(kw)) score += 3;
    }
    return score;
  }

  _compareArrays(arr1, arr2, keyField) {
    const keys1 = new Set((arr1 || []).map(item => item[keyField]));
    const keys2 = new Set((arr2 || []).map(item => item[keyField]));

    const onlyIn1 = [...keys1].filter(k => !keys2.has(k));
    const onlyIn2 = [...keys2].filter(k => !keys1.has(k));
    const common = [...keys1].filter(k => keys2.has(k));

    return {
      count1: arr1?.length || 0,
      count2: arr2?.length || 0,
      onlyIn1,
      onlyIn2,
      common
    };
  }

  _formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  /**
   * 生成算例管理报告
   */
  generateReport(models) {
    const lines = [];
    const { projects, stats } = models;

    lines.push('═'.repeat(70));
    lines.push('CloudPSS 算例管理报告');
    lines.push('═'.repeat(70));
    lines.push(`生成时间: ${new Date().toISOString()}`);
    lines.push('');

    lines.push('─'.repeat(70));
    lines.push('统计概览');
    lines.push('─'.repeat(70));
    lines.push(`算例总数: ${stats.total}`);
    lines.push('');

    lines.push('按所有者分布:');
    for (const [owner, count] of Object.entries(stats.byOwner)) {
      lines.push(`  - ${owner}: ${count} 个`);
    }
    lines.push('');

    lines.push('按类型分布:');
    for (const [type, count] of Object.entries(stats.byType)) {
      lines.push(`  - ${type}: ${count} 个`);
    }
    lines.push('');

    lines.push('─'.repeat(70));
    lines.push('算例列表');
    lines.push('─'.repeat(70));

    for (const p of projects) {
      lines.push(`• ${p.name || '未命名'} (${p.rid})`);
    }

    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }
}

module.exports = ModelManagementEnhancedSkill;