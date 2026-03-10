/**
 * Manage Skill - 算例管理技能
 *
 * 用于管理电力系统仿真算例
 *
 * 基于 CloudPSS Python SDK:
 * - Model.fetch(rid) 获取算例
 * - model.configs 获取参数方案
 * - model.jobs 获取计算方案
 */

class ManageSkill {
  constructor(client) {
    this.client = client;
  }

  /**
   * 列出所有项目
   *
   * @returns {Promise<Array>} 项目列表
   */
  async listProjects() {
    return this.client.listProjects();
  }

  /**
   * 获取算例项目
   *
   * @param {string} rid - 项目 rid，格式为 'model/owner/key'
   * @returns {Promise<Object>} 项目详情
   */
  async getModel(rid) {
    const model = await this.client.fetchModel(rid);
    return {
      rid: model.rid,
      name: model.name,
      description: model.description,
      configs: model.configs,
      jobs: model.jobs,
      revision: model.revision
    };
  }

  /**
   * 列出算例的计算方案
   *
   * @param {string} rid - 项目 rid
   * @returns {Promise<Array>} 计算方案列表
   */
  async listJobs(rid) {
    const model = await this.client.getModel(rid);
    return model.jobs.map((job, index) => ({
      index,
      name: job.name,
      rid: job.rid,
      args: job.args
    }));
  }

  /**
   * 列出算例的参数方案
   *
   * @param {string} rid - 项目 rid
   * @returns {Promise<Array>} 参数方案列表
   */
  async listConfigs(rid) {
    const model = await this.client.getModel(rid);
    return model.configs.map((config, index) => ({
      index,
      name: config.name,
      args: config.args,
      pins: config.pins
    }));
  }

  /**
   * 获取算例详情
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 算例详情
   */
  async getSimulation(rid, options = {}) {
    const { includeComponents = false, includeTopology = false } = options;

    const model = await this.client.fetchModel(rid);
    const result = {
      rid: model.rid,
      name: model.name,
      description: model.description,
      configs: model.configs,
      jobs: model.jobs
    };

    if (includeComponents) {
      result.components = await this.client.getAllComponents(rid);
    }

    if (includeTopology) {
      result.topology = await this.client.getTopology(rid);
    }

    return result;
  }

  /**
   * 搜索算例
   *
   * @param {Object} options - 搜索选项
   * @returns {Promise<Array>} 搜索结果
   */
  async searchSimulations(options = {}) {
    const { keyword, jobType } = options;
    const projects = await this.client.listProjects();

    const results = [];
    for (const project of projects) {
      try {
        const rid = project.rid;
        const model = await this.client.fetchModel(rid);

        let match = true;
        if (keyword && !model.name.toLowerCase().includes(keyword.toLowerCase())) {
          match = false;
        }

        if (jobType) {
          const hasJobType = model.jobs.some(job =>
            job.rid && job.rid.includes(jobType)
          );
          if (!hasJobType) {
            match = false;
          }
        }

        if (match) {
          results.push({
            rid,
            name: model.name,
            description: model.description,
            jobCount: model.jobs.length,
            configCount: model.configs.length
          });
        }
      } catch (e) {
        // 跳过无法访问的项目
      }
    }
    return results;
  }

  /**
   * 创建参数方案
   *
   * @param {string} rid - 项目 rid
   * @param {string} name - 参数方案名称
   * @returns {Promise<Object>} 创建的参数方案
   */
  async createConfig(rid, name) {
    return this.client.createConfig(rid, name);
  }

  /**
   * 创建计算方案
   *
   * @param {string} rid - 项目 rid
   * @param {string} jobType - 计算方案类型
   * @param {string} name - 计算方案名称
   * @returns {Promise<Object>} 创建的计算方案
   */
  async createJob(rid, jobType, name) {
    return this.client.createJob(rid, jobType, name);
  }

  /**
   * 保存项目
   *
   * @param {string} rid - 项目 rid
   * @param {string} newKey - 新项目名称（可选，用于另存为）
   * @returns {Promise<boolean>} 是否成功保存
   */
  async saveProject(rid, newKey = null) {
    return this.client.saveModel(rid, newKey);
  }

  /**
   * 导出算例文件到本地
   *
   * @param {string} rid - 项目 rid
   * @param {string} filePath - 保存文件的路径
   * @param {Object} options - 选项
   * @param {string} options.format - 文件格式 ('yaml', 'json')
   * @param {string} options.compress - 压缩方式 ('gzip', null)
   * @returns {Promise<Object>} 导出结果
   */
  async exportModel(rid, filePath, options = {}) {
    const { format = 'yaml', compress = 'gzip' } = options;
    return this.client.dumpModel(rid, filePath, format, compress);
  }

  /**
   * 从文件导入算例到 CloudPSS
   *
   * @param {string} filePath - 算例文件路径
   * @param {Object} options - 选项
   * @param {string} options.format - 文件格式
   * @param {string} options.compress - 压缩方式
   * @returns {Promise<Object>} 导入结果（包含新算例的 rid）
   */
  async importModel(filePath, options = {}) {
    const { format = 'yaml', compress = 'gzip' } = options;
    return this.client.loadModel(filePath, format, compress);
  }

  /**
   * 复制算例（导出再导入）
   *
   * @param {string} sourceRid - 源算例 rid
   * @param {string} targetKey - 目标算例名称
   * @param {string} tempFile - 临时文件路径
   * @returns {Promise<Object>} 复制结果（包含新算例的 rid）
   */
  async copyModel(sourceRid, targetKey, tempFile = '/tmp/cloudpss_export.tmp') {
    // 1. 导出源算例
    await this.exportModel(sourceRid, tempFile);

    // 2. 导入为新算例（注意：loadModel 可能需要额外的参数来指定新名称）
    // 这里需要 CloudPSS SDK 支持从文件创建并指定名称
    // 当前实现可能需要后续调整
    const result = await this.importModel(tempFile);

    // 清理临时文件
    const fs = require('fs');
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    return result;
  }
}

module.exports = ManageSkill;
