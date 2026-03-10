#!/usr/bin/env node

/**
 * CloudPSS API 客户端
 *
 * 基于 CloudPSS Python SDK 封装，提供与 www.cloudpss.net 云仿真平台的 API 交互
 *
 * 核心 API 模式:
 * - cloudpss.setToken('{token}') 认证
 * - os.environ['CLOUDPSS_API_URL'] = 'https://cloudpss.net/'
 * - cloudpss.Model.fetch('model/owner/key') 获取算例
 * - model.run(job, config) 运行仿真
 * - runner.result.getBuses/getBranches/getPlots() 获取结果
 */

const CloudPSSPythonBridge = require('./python-bridge');

class CloudPSSClient {
  constructor(options = {}) {
    this.token = options.token || process.env.CLOUDPSS_TOKEN;
    this.apiKey = options.apiKey || process.env.CLOUDPSS_API_KEY;
    this.apiURL = options.apiURL || process.env.CLOUDPSS_API_URL || 'https://cloudpss.net/';

    // 优先使用 token（Python SDK 方式）
    this.authToken = this.token || this.apiKey;

    if (!this.authToken || this.authToken === 'your-cloudpss-token-here') {
      console.warn('[CloudPSS] 警告：Token 未配置，请在 .env.sh 中设置 CLOUDPSS_TOKEN');
    }

    // 使用 Python Bridge 进行 API 调用
    this.bridge = new CloudPSSPythonBridge({
      token: this.authToken,
      apiURL: this.apiURL,
      ...options
    });
  }

  // =====================================================
  // 项目管理 APIs
  // =====================================================

  /**
   * 获取用户有权限的项目列表
   * @returns {Promise<Array>} 项目列表
   */
  async listProjects() {
    return this.bridge.listProjects();
  }

  /**
   * 获取算例项目
   * @param {string} rid - 项目 rid，格式为 'model/owner/key'
   * @returns {Promise<Object>} 项目信息
   */
  async fetchModel(rid) {
    return this.bridge.fetchModel(rid);
  }

  /**
   * 创建参数方案
   * @param {string} rid - 项目 rid
   * @param {string} name - 参数方案名称
   * @returns {Promise<Object>} 创建的参数方案
   */
  async createConfig(rid, name) {
    return this.bridge.createConfig(rid, name);
  }

  /**
   * 创建计算方案
   * @param {string} rid - 项目 rid
   * @param {string} jobType - 计算方案类型 (emtp, sfemt, powerFlow, etc.)
   * @param {string} name - 计算方案名称
   * @returns {Promise<Object>} 创建的计算方案
   */
  async createJob(rid, jobType, name) {
    return this.bridge.createJob(rid, jobType, name);
  }

  // =====================================================
  // 仿真运行 APIs
  // =====================================================

  /**
   * 运行仿真任务
   * @param {string} rid - 项目 rid
   * @param {number} jobIndex - 计算方案索引
   * @param {number} configIndex - 参数方案索引
   * @returns {Promise<Object>} 仿真任务信息
   */
  async runSimulation(rid, jobIndex = 0, configIndex = 0) {
    return this.bridge.runSimulation(rid, jobIndex, configIndex);
  }

  /**
   * 等待仿真完成
   * @param {string} jobId - 任务 ID
   * @param {number} timeout - 超时时间（秒）
   * @returns {Promise<boolean>} 是否成功完成
   */
  async waitForCompletion(jobId, timeout = 300) {
    return this.bridge.waitForCompletion(jobId, timeout);
  }

  /**
   * 中断仿真
   * @param {string} jobId - 任务 ID
   * @returns {Promise<boolean>} 是否成功中断
   */
  async abortSimulation(jobId) {
    return this.bridge.abortSimulation(jobId);
  }

  /**
   * 获取仿真日志
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Array>} 日志列表
   */
  async getLogs(jobId) {
    return this.bridge.getLogs(jobId);
  }

  // =====================================================
  // 结果提取 APIs
  // =====================================================

  /**
   * 获取潮流计算结果
   * @param {string} jobId - 任务 ID
   * @returns {Promise<Object>} 潮流结果（buses 和 branches）
   */
  async getPowerFlowResults(jobId) {
    return this.bridge.getPowerFlowResults(jobId);
  }

  /**
   * 获取电磁暂态仿真结果
   * @param {string} jobId - 任务 ID
   * @param {number} plotIndex - 输出分组索引
   * @returns {Promise<Object>} 电磁暂态结果
   */
  async getEMTResults(jobId, plotIndex = 0) {
    return this.bridge.getEMTResults(jobId, plotIndex);
  }

  // =====================================================
  // 元件管理 APIs
  // =====================================================

  /**
   * 获取所有元件
   * @param {string} rid - 项目 rid
   * @returns {Promise<Object>} 所有元件信息
   */
  async getAllComponents(rid) {
    return this.bridge.getAllComponents(rid);
  }

  /**
   * 更新元件
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 元件 key
   * @param {string} label - 元件标签
   * @returns {Promise<boolean>} 是否成功更新
   */
  async updateComponent(rid, componentKey, label = null) {
    return this.bridge.updateComponent(rid, componentKey, label);
  }

  /**
   * 添加元件
   * @param {string} rid - 项目 rid
   * @param {string} definition - 元件定义 rid
   * @param {string} label - 元件标签
   * @param {Object} args - 元件参数
   * @param {Object} pins - 元件引脚数据
   * @returns {Promise<Object>} 创建的元件信息
   */
  async addComponent(rid, definition, label, args, pins) {
    return this.bridge.addComponent(rid, definition, label, args, pins);
  }

  /**
   * 获取拓扑数据
   * @param {string} rid - 项目 rid
   * @param {string} implementType - 拓扑实现类型
   * @returns {Promise<Object>} 拓扑数据
   */
  async getTopology(rid, implementType = 'emtp') {
    return this.bridge.getTopology(rid, implementType);
  }

  /**
   * 保存项目
   * @param {string} rid - 项目 rid
   * @param {string} newKey - 新项目名称（可选）
   * @returns {Promise<boolean>} 是否成功保存
   */
  async saveModel(rid, newKey = null) {
    return this.bridge.saveModel(rid, newKey);
  }

  // =====================================================
  // Python Bridge Generic API
  // =====================================================

  /**
   * 执行 Python 命令（通用接口）
   * @param {string} command - Python 命令名称
   * @param {Array<string>} args - 命令参数列表
   * @returns {Promise<any>} Python 函数返回结果
   */
  async execPython(command, args = []) {
    return this.bridge.exec(command, args);
  }

  // =====================================================
  // N-1 Contingency Scan APIs
  // =====================================================

  /**
   * 运行 N-1 扫描分析
   * @param {string} rid - 项目 rid
   * @param {string} jobType - 计算方案类型
   * @param {string[]} elements - 要扫描的元件 ID 列表
   * @returns {Promise<Array>} N-1 扫描结果
   */
  async runContingencyScan(rid, jobType = 'powerFlow', elements = null) {
    return this.bridge.runContingencyScan(rid, jobType, elements);
  }

  /**
   * 检查电压越限
   * @param {Object[]} buses - 节点数据列表
   * @param {Object} limits - 电压限制配置
   * @returns {Promise<Array>} 越限列表
   */
  async checkVoltageViolations(buses, limits = null) {
    return this.bridge.checkVoltageViolations(buses, limits);
  }

  /**
   * 检查线路过载
   * @param {Object[]} branches - 支路数据列表
   * @param {Object} limits - 线路负载限制配置
   * @returns {Promise<Array>} 过载列表
   */
  async checkLineOverloads(branches, limits = null) {
    return this.bridge.checkLineOverloads(branches, limits);
  }

  // =====================================================
  // Harmonic Analysis APIs
  // =====================================================

  /**
   * 谐波分析
   * @param {string} jobId - 任务 ID
   * @param {string} channel - 通道名称
   * @param {number} fundamentalFreq - 基波频率 (Hz)
   * @param {number} plotIndex - 输出分组索引
   * @returns {Promise<Object>} 谐波分析结果
   */
  async analyzeHarmonic(jobId, channel, fundamentalFreq = 50.0, plotIndex = 0) {
    return this.bridge.analyzeHarmonic(jobId, channel, fundamentalFreq, plotIndex);
  }

  /**
   * 计算 THD
   * @param {Object} signalData - 信号数据
   * @param {number} fundamentalFreq - 基波频率 (Hz)
   * @returns {Promise<Object>} THD 计算结果
   */
  async calculateTHD(signalData, fundamentalFreq = 50.0) {
    return this.bridge.calculateTHD(signalData, fundamentalFreq);
  }

  /**
   * 检查谐波合规性
   * @param {Object} thdResult - THD 计算结果
   * @param {string} standard - 标准名称
   * @param {number} voltageLevel - 电压等级 (kV)
   * @returns {Promise<Object>} 合规性检查结果
   */
  async checkHarmonicCompliance(thdResult, standard = 'GB/T 14549', voltageLevel = 10.0) {
    return this.bridge.checkHarmonicCompliance(thdResult, standard, voltageLevel);
  }

  /**
   * 阻抗扫描
   * @param {string} jobId - 任务 ID
   * @param {number} minFreq - 最小频率 (Hz)
   * @param {number} maxFreq - 最大频率 (Hz)
   * @param {number} numPoints - 扫描点数
   * @returns {Promise<Object>} 阻抗扫描结果
   */
  async impedanceScan(jobId, minFreq = 10, maxFreq = 5000, numPoints = 500) {
    return this.bridge.impedanceScan(jobId, minFreq, maxFreq, numPoints);
  }

  // =====================================================
  // Batch Simulation APIs
  // =====================================================

  /**
   * 批量运行仿真场景
   * @param {Array<Object>} scenarios - 场景列表
   * @param {string} rid - 项目 rid
   * @param {number} maxParallel - 最大并行数
   * @param {string} jobType - 计算方案类型
   * @returns {Promise<Array>} 批量仿真结果
   */
  async runBatchSimulations(scenarios, rid, maxParallel = 5, jobType = 'powerFlow') {
    return this.bridge.runBatchSimulations(scenarios, rid, maxParallel, jobType);
  }

  /**
   * 参数扫描仿真
   * @param {string} rid - 项目 rid
   * @param {string} paramName - 参数名称
   * @param {Array<number>} values - 参数值列表
   * @param {string} componentId - 元件 ID（可选）
   * @param {number} maxParallel - 最大并行数
   * @param {string} jobType - 计算方案类型
   * @returns {Promise<Array>} 参数扫描结果
   */
  async parameterSweep(rid, paramName, values, componentId = null, maxParallel = 5, jobType = 'powerFlow') {
    return this.bridge.parameterSweep(rid, paramName, values, componentId, maxParallel, jobType);
  }

  /**
   * 汇总批量仿真结果
   * @param {Array<Object>} results - 仿真结果列表
   * @returns {Promise<Object>} 汇总统计结果
   */
  async aggregateResults(results) {
    return this.bridge.aggregateResults(results);
  }
}

module.exports = CloudPSSClient;
