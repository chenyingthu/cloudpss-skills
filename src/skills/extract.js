/**
 * Extract Skill - 信息提取技能
 *
 * 用于从电力系统仿真算例中提取信息
 *
 * 基于 CloudPSS Python SDK:
 * - runner.result.getBuses() 获取节点数据
 * - runner.result.getBranches() 获取支路数据
 * - runner.result.getPlots() 获取曲线数据
 */

class ExtractSkill {
  constructor(client) {
    this.client = client;
  }

  /**
   * 提取模型元件
   *
   * @param {string} rid - 项目 rid
   * @returns {Promise<Object>} 元件信息
   */
  async extractComponents(rid) {
    return this.client.getAllComponents(rid);
  }

  /**
   * 提取网络拓扑
   *
   * @param {string} rid - 项目 rid
   * @param {string} implementType - 拓扑实现类型 (emtp, powerFlow, etc.)
   * @returns {Promise<Object>} 拓扑信息
   */
  async extractTopology(rid, implementType = 'emtp') {
    return this.client.getTopology(rid, implementType);
  }

  /**
   * 提取潮流结果 - 节点数据
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Array>} 节点电压表
   */
  async extractBuses(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    return result.buses;
  }

  /**
   * 提取潮流结果 - 支路数据
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Array>} 支路功率表
   */
  async extractBranches(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    return result.branches;
  }

  /**
   * 提取电磁暂态结果 - 曲线数据
   *
   * @param {string} jobId - 任务 ID
   * @param {number} plotIndex - 输出分组索引
   * @returns {Promise<Object>} 曲线数据
   */
  async extractPlots(jobId, plotIndex = 0) {
    return this.client.getEMTResults(jobId, plotIndex);
  }

  /**
   * 提取特定通道数据
   *
   * @param {string} jobId - 任务 ID
   * @param {number} plotIndex - 输出分组索引
   * @param {string} channelName - 通道名称
   * @returns {Promise<Object>} 通道数据
   */
  async extractChannelData(jobId, plotIndex, channelName) {
    const result = await this.client.getEMTResults(jobId, plotIndex);
    return result.channel_data?.[channelName] || null;
  }

  /**
   * 提取仿真日志
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Array>} 日志列表
   */
  async extractLogs(jobId) {
    return this.client.getLogs(jobId);
  }

  /**
   * 提取节点电压
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 节点电压数据
   */
  async extractBusVoltages(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    return result.buses?.map(bus => ({
      id: bus.Bus || bus.id,
      name: bus.Bus || bus.name,
      voltage: bus.Vm,
      angle: bus.Va
    }));
  }

  /**
   * 提取支路潮流
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 支路潮流数据
   */
  async extractLineFlows(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    return result.branches?.map(branch => ({
      id: branch.Branch || branch.id,
      fromBus: branch.fromBus,
      toBus: branch.toBus,
      pij: branch.Pij,
      qij: branch.Qij,
      pji: branch.Pji,
      qji: branch.Qji,
      pLoss: branch.Ploss,
      qLoss: branch.Qloss
    }));
  }

  /**
   * 提取发电机出力
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 发电机出力数据
   */
  async extractGeneratorOutput(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    return result.buses?.filter(bus => bus.Pgen !== 0).map(bus => ({
      id: bus.Bus || bus.id,
      name: bus.Bus || bus.name,
      pGen: bus.Pgen,
      qGen: bus.Qgen
    }));
  }

  /**
   * 提取负荷数据
   *
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 负荷数据
   */
  async extractLoadData(jobId) {
    const result = await this.client.getPowerFlowResults(jobId);
    return result.buses?.filter(bus => bus.Pload !== 0).map(bus => ({
      id: bus.Bus || bus.id,
      name: bus.Bus || bus.name,
      pLoad: bus.Pload,
      qLoad: bus.Qload
    }));
  }

  /**
   * 提取所有输出通道名称
   *
   * @param {string} jobId - 任务 ID
   * @param {number} plotIndex - 输出分组索引
   * @returns {Promise<Array>} 通道名称列表
   */
  async extractChannelNames(jobId, plotIndex = 0) {
    const result = await this.client.getEMTResults(jobId, plotIndex);
    return result.channels || [];
  }
}

module.exports = ExtractSkill;
