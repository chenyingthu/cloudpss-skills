#!/usr/bin/env node

/**
 * CloudPSS Python SDK Bridge
 *
 * 通过子进程调用 Python SDK，提供与 CloudPSS 平台的交互
 */

const { spawn } = require('child_process');
const path = require('path');

class CloudPSSPythonBridge {
  constructor(options = {}) {
    this.token = options.token || process.env.CLOUDPSS_TOKEN;
    this.apiKey = options.apiKey || process.env.CLOUDPSS_API_KEY;
    this.apiURL = options.apiURL || process.env.CLOUDPSS_API_URL || 'https://cloudpss.net/';
    this.pythonPath = options.pythonPath || '/home/chenying/anaconda3/bin/python3';
    this.wrapperPath = path.join(__dirname, '../../python/cloudpss_wrapper.py');

    // 优先使用 token，如果没有则使用 apiKey
    this.authToken = this.token || this.apiKey;

    if (!this.authToken || this.authToken === 'your-cloudpss-token-here') {
      console.warn('[CloudPSS] 警告：Token 未配置，请在 .env.sh 中设置 CLOUDPSS_TOKEN');
    }
  }

  /**
   * 执行 Python 命令
   */
  async _exec(command, args = []) {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        CLOUDPSS_TOKEN: this.authToken,
        CLOUDPSS_API_URL: this.apiURL
      };

      // Ensure args is always an array
      const argsArray = Array.isArray(args) ? args : [args];
      const proc = spawn(this.pythonPath, [this.wrapperPath, command, ...argsArray], {
        env,
        cwd: path.join(__dirname, '../../'),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          if (result.success) {
            resolve(result.data);
          } else {
            reject(new Error(result.error || 'Unknown error'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${e.message}\nOutput: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start Python process: ${err.message}`));
      });
    });
  }

  // =====================================================
  // 模型/项目管理 APIs
  // =====================================================

  /**
   * 获取算例项目
   * @param {string} rid - 项目 rid，格式为 'model/owner/key'
   */
  async fetchModel(rid) {
    return this._exec('fetch_model', rid);
  }

  /**
   * 获取用户有权限的项目列表
   */
  async listProjects() {
    return this._exec('list_projects');
  }

  /**
   * 创建参数方案
   * @param {string} rid - 项目 rid
   * @param {string} name - 参数方案名称
   */
  async createConfig(rid, name) {
    return this._exec('create_config', rid, name);
  }

  /**
   * 创建计算方案
   * @param {string} rid - 项目 rid
   * @param {string} jobType - 计算方案类型 (emtp, sfemt, powerFlow, etc.)
   * @param {string} name - 计算方案名称
   */
  async createJob(rid, jobType, name) {
    return this._exec('create_job', rid, jobType, name);
  }

  // =====================================================
  // 仿真运行 APIs
  // =====================================================

  /**
   * 运行仿真任务
   * @param {string} rid - 项目 rid
   * @param {number} jobIndex - 计算方案索引
   * @param {number} configIndex - 参数方案索引
   */
  async runSimulation(rid, jobIndex = 0, configIndex = 0) {
    return this._exec('run_simulation', rid, String(jobIndex), String(configIndex));
  }

  /**
   * 等待仿真完成
   * @param {string} jobId - 任务 ID
   * @param {number} timeout - 超时时间（秒）
   */
  async waitForCompletion(jobId, timeout = 300) {
    return this._exec('wait_completion', jobId, String(timeout));
  }

  /**
   * 中断仿真
   * @param {string} jobId - 任务 ID
   */
  async abortSimulation(jobId) {
    return this._exec('abort', jobId);
  }

  /**
   * 获取仿真日志
   * @param {string} jobId - 任务 ID
   */
  async getLogs(jobId) {
    return this._exec('get_logs', jobId);
  }

  // =====================================================
  // 结果提取 APIs
  // =====================================================

  /**
   * 获取潮流计算结果
   * @param {string} jobId - 任务 ID
   */
  async getPowerFlowResults(jobId) {
    return this._exec('get_power_flow_results', jobId);
  }

  /**
   * 获取电磁暂态仿真结果
   * @param {string} jobId - 任务 ID
   * @param {number} plotIndex - 输出分组索引
   */
  async getEMTResults(jobId, plotIndex = 0) {
    return this._exec('get_emt_results', jobId, String(plotIndex));
  }

  // =====================================================
  // 元件管理 APIs
  // =====================================================

  /**
   * 获取所有元件
   * @param {string} rid - 项目 rid
   */
  async getAllComponents(rid) {
    return this._exec('get_components', rid);
  }

  /**
   * 更新元件
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 元件 key
   * @param {string} label - 元件标签
   */
  async updateComponent(rid, componentKey, label = null) {
    return this._exec('update_component', rid, componentKey, label || '');
  }

  /**
   * 添加元件
   * @param {string} rid - 项目 rid
   * @param {string} definition - 元件定义 rid
   * @param {string} label - 元件标签
   * @param {Object} args - 元件参数
   * @param {Object} pins - 元件引脚数据
   */
  async addComponent(rid, definition, label, args, pins) {
    const argsJson = JSON.stringify(args);
    const pinsJson = JSON.stringify(pins);
    return this._exec('add_component', rid, definition, label, argsJson, pinsJson);
  }

  /**
   * 获取拓扑数据
   * @param {string} rid - 项目 rid
   * @param {string} implementType - 拓扑实现类型
   */
  async getTopology(rid, implementType = 'emtp') {
    return this._exec('get_topology', rid, implementType);
  }

  /**
   * 保存项目
   * @param {string} rid - 项目 rid
   * @param {string} newKey - 新项目名称（可选）
   */
  async saveModel(rid, newKey = null) {
    return this._exec('save_model', rid, newKey || '');
  }

  // =====================================================
  // N-1 Contingency Scan APIs
  // =====================================================

  /**
   * 运行 N-1 扫描分析
   * @param {string} rid - 项目 rid
   * @param {string} jobType - 计算方案类型
   * @param {string[]} elements - 要扫描的元件 ID 列表
   */
  async runContingencyScan(rid, jobType = 'powerFlow', elements = null) {
    const args = [rid, jobType];
    if (elements) {
      args.push(JSON.stringify(elements));
    } else {
      args.push('null');
    }
    return this._exec('run_contingency_scan', args);
  }

  /**
   * 检查电压越限
   * @param {Object[]} buses - 节点数据列表
   * @param {Object} limits - 电压限制配置
   */
  async checkVoltageViolations(buses, limits = null) {
    const args = [JSON.stringify(buses)];
    if (limits) {
      args.push(JSON.stringify(limits));
    } else {
      args.push('null');
    }
    return this._exec('check_voltage_violations', args);
  }

  /**
   * 检查线路过载
   * @param {Object[]} branches - 支路数据列表
   * @param {Object} limits - 线路负载限制配置
   */
  async checkLineOverloads(branches, limits = null) {
    const args = [JSON.stringify(branches)];
    if (limits) {
      args.push(JSON.stringify(limits));
    } else {
      args.push('null');
    }
    return this._exec('check_line_overloads', args);
  }

  // =====================================================
  // Harmonic Analysis APIs
  // =====================================================

  /**
   * 执行通用 Python 命令
   * @param {string} command - Python 命令名称
   * @param {Array<string>} args - 命令参数列表
   * @returns {Promise<any>} Python 函数返回结果
   */
  async exec(command, args = []) {
    return this._exec(command, args);
  }

  /**
   * 谐波分析
   * @param {string} jobId - 任务 ID
   * @param {string} channel - 通道名称
   * @param {number} fundamentalFreq - 基波频率 (Hz)
   * @param {number} plotIndex - 输出分组索引
   */
  async analyzeHarmonic(jobId, channel, fundamentalFreq = 50.0, plotIndex = 0) {
    return this._exec('analyze_harmonic', [jobId, channel, String(fundamentalFreq), String(plotIndex)]);
  }

  /**
   * 计算 THD
   * @param {Object} signalData - 信号数据
   * @param {number} fundamentalFreq - 基波频率 (Hz)
   */
  async calculateTHD(signalData, fundamentalFreq = 50.0) {
    return this._exec('calculate_thd', [JSON.stringify(signalData), String(fundamentalFreq)]);
  }

  /**
   * 检查谐波合规性
   * @param {Object} thdResult - THD 计算结果
   * @param {string} standard - 标准名称
   * @param {number} voltageLevel - 电压等级 (kV)
   */
  async checkHarmonicCompliance(thdResult, standard = 'GB/T 14549', voltageLevel = 10.0) {
    return this._exec('check_harmonic_compliance', [JSON.stringify(thdResult), standard, String(voltageLevel)]);
  }

  /**
   * 阻抗扫描
   * @param {string} jobId - 任务 ID
   * @param {number} minFreq - 最小频率 (Hz)
   * @param {number} maxFreq - 最大频率 (Hz)
   * @param {number} numPoints - 扫描点数
   */
  async impedanceScan(jobId, minFreq = 10, maxFreq = 5000, numPoints = 500) {
    return this._exec('impedance_scan', [jobId, String(minFreq), String(maxFreq), String(numPoints)]);
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
   */
  async runBatchSimulations(scenarios, rid, maxParallel = 5, jobType = 'powerFlow') {
    return this._exec('run_batch_simulations', [
      JSON.stringify(scenarios),
      rid,
      String(maxParallel),
      jobType
    ]);
  }

  /**
   * 参数扫描仿真
   * @param {string} rid - 项目 rid
   * @param {string} paramName - 参数名称
   * @param {Array<number>} values - 参数值列表
   * @param {string} componentId - 元件 ID（可选）
   * @param {number} maxParallel - 最大并行数
   * @param {string} jobType - 计算方案类型
   */
  async parameterSweep(rid, paramName, values, componentId = null, maxParallel = 5, jobType = 'powerFlow') {
    return this._exec('parameter_sweep', [
      rid,
      paramName,
      JSON.stringify(values),
      componentId || '',
      String(maxParallel),
      jobType
    ]);
  }

  /**
   * 汇总批量仿真结果
   * @param {Array<Object>} results - 仿真结果列表
   */
  async aggregateResults(results) {
    return this._exec('aggregate_results', [JSON.stringify(results)]);
  }
}

module.exports = CloudPSSPythonBridge;
