/**
 * Operation Support Skill - 运维支持技能
 *
 * US-044: 设备台账提取
 * US-046: 设备过载预警
 * US-047: 检修影响评估
 * US-048: 系统运行方式档案
 */

const PowerFlowAnalysisSkill = require('./power-flow-analysis');

class OperationSupportSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.powerFlow = new PowerFlowAnalysisSkill(client, options);
  }

  /**
   * 设备台账提取 (US-044)
   *
   * 从算例中批量提取设备台账信息
   *
   * @param {string} rid - 项目 rid
   * @param {Object} options - 提取选项
   * @returns {Promise<Object>} 设备台账
   */
  async extractAssetInventory(rid, options = {}) {
    const {
      deviceTypes = ['generator', 'transformer', 'line', 'load', 'capacitor', 'reactor'],
      format = 'table'
    } = options;

    console.log(`\n[Asset] 提取设备台账`);
    console.log(`[Asset] 设备类型: ${deviceTypes.join(', ')}`);

    // 获取所有元件
    const components = await this.client.getAllComponents(rid);

    // 按类型分类提取
    const inventory = {
      rid,
      timestamp: new Date().toISOString(),
      summary: {},
      devices: {}
    };

    for (const type of deviceTypes) {
      const devices = this._extractDevicesByType(components, type);
      inventory.devices[type] = devices;
      inventory.summary[type] = devices.length;
    }

    // 生成表格格式
    if (format === 'table' || format === 'excel') {
      inventory.tableData = this._generateTableData(inventory.devices);
    }

    // 生成CSV格式
    inventory.csv = this._generateCSV(inventory.devices);

    console.log(`[Asset] 提取完成，共${Object.values(inventory.summary).reduce((a, b) => a + b, 0)}台设备`);

    return inventory;
  }

  /**
   * 按类型提取设备
   */
  _extractDevicesByType(components, type) {
    const devices = [];
    const typePatterns = {
      generator: ['syncgen', 'generator', 'gen'],
      transformer: ['transformer', 'xfmr', 'two-winding'],
      line: ['line', 'branch', 'acline'],
      load: ['load', 'pq', 'pqload'],
      capacitor: ['capacitor', 'cap', 'shuntcap'],
      reactor: ['reactor', 'reactor', 'shuntrea']
    };

    const patterns = typePatterns[type] || [];

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (patterns.some(p => def.includes(p))) {
        devices.push({
          key,
          label: comp.label || key,
          definition: comp.definition,
          args: comp.args || {},
          ports: comp.ports || {}
        });
      }
    }

    return devices;
  }

  /**
   * 生成表格数据
   */
  _generateTableData(devices) {
    const tables = {};

    for (const [type, list] of Object.entries(devices)) {
      if (list.length === 0) continue;

      // 获取所有参数键
      const allKeys = new Set(['label', 'definition']);
      list.forEach(d => {
        Object.keys(d.args).forEach(k => allKeys.add(k));
      });

      const headers = Array.from(allKeys);
      const rows = list.map(d => {
        const row = { label: d.label, definition: d.definition };
        Object.assign(row, d.args);
        return headers.map(h => row[h] || '');
      });

      tables[type] = { headers, rows };
    }

    return tables;
  }

  /**
   * 生成CSV格式
   */
  _generateCSV(devices) {
    const lines = [];

    for (const [type, list] of Object.entries(devices)) {
      lines.push(`\n# ${type.toUpperCase()}`);
      lines.push('label,definition,key');

      list.forEach(d => {
        const args = Object.entries(d.args)
          .map(([k, v]) => `${k}=${v}`)
          .join(';');
        lines.push(`"${d.label}","${d.definition}","${d.key}","${args}"`);
      });
    }

    return lines.join('\n');
  }

  /**
   * 设备过载预警 (US-046)
   *
   * 识别并预警设备过载情况
   *
   * @param {string} jobId - 任务 ID
   * @param {Object} options - 预警选项
   * @returns {Promise<Object>} 预警结果
   */
  async generateOverloadWarnings(jobId, options = {}) {
    const {
      warningThreshold = 0.8,   // 预警阈值 80%
      criticalThreshold = 1.0,   // 严重阈值 100%
      includeVoltage = true      // 是否包含电压越限
    } = options;

    console.log(`\n[Alert] 生成设备过载预警`);

    // 获取越限信息
    const violations = await this.powerFlow.checkViolations(jobId);

    // 生成预警列表
    const warnings = {
      jobId,
      timestamp: new Date().toISOString(),
      critical: [],    // 紧急：需立即处理
      warning: [],     // 警告：需关注
      notice: [],      // 提示：接近限值
      summary: {
        criticalCount: 0,
        warningCount: 0,
        noticeCount: 0
      }
    };

    // 处理线路过载
    if (violations.lineOverloads && violations.lineOverloads.details) {
      for (const overload of violations.lineOverloads.details) {
        const warning = {
          type: 'branch-overload',
          deviceId: overload.branchId,
          deviceName: overload.branchName,
          value: overload.loading,
          limit: criticalThreshold,
          percent: (overload.loading * 100).toFixed(1) + '%',
          severity: overload.severity,
          message: `${overload.branchName} 负载率 ${(overload.loading * 100).toFixed(1)}%`,
          suggestion: this._getOverloadSuggestion(overload)
        };

        if (overload.loading >= criticalThreshold) {
          warnings.critical.push(warning);
        } else if (overload.loading >= warningThreshold) {
          warnings.warning.push(warning);
        }
      }
    }

    // 处理电压越限
    if (includeVoltage && violations.voltageViolations && violations.voltageViolations.details) {
      for (const voltage of violations.voltageViolations.details) {
        const warning = {
          type: 'voltage-violation',
          deviceId: voltage.busId,
          deviceName: voltage.busName,
          value: voltage.voltage,
          limit: voltage.type === 'undervoltage' ? 0.95 : 1.05,
          severity: voltage.severity,
          message: `${voltage.busName} 电压 ${voltage.voltage.toFixed(4)} p.u. (${voltage.type === 'undervoltage' ? '偏低' : '偏高'})`,
          suggestion: this._getVoltageSuggestion(voltage)
        };

        if (voltage.severity === 'critical') {
          warnings.critical.push(warning);
        } else {
          warnings.warning.push(warning);
        }
      }
    }

    // 检查接近限值的设备
    const flows = await this.powerFlow.getBranchFlows(jobId);
    for (const branch of flows.branches) {
      const loading = branch.loading || 0;
      if (loading >= warningThreshold * 0.9 && loading < warningThreshold) {
        warnings.notice.push({
          type: 'branch-loading',
          deviceId: branch.id,
          deviceName: branch.name,
          value: loading,
          percent: (loading * 100).toFixed(1) + '%',
          message: `${branch.name} 负载率 ${(loading * 100).toFixed(1)}%，接近预警阈值`,
          suggestion: '建议关注负荷变化趋势'
        });
      }
    }

    // 更新统计
    warnings.summary.criticalCount = warnings.critical.length;
    warnings.summary.warningCount = warnings.warning.length;
    warnings.summary.noticeCount = warnings.notice.length;

    console.log(`[Alert] 预警生成完成: 紧急${warnings.summary.criticalCount}项, 警告${warnings.summary.warningCount}项`);

    return warnings;
  }

  /**
   * 获取过载建议
   */
  _getOverloadSuggestion(overload) {
    const loading = overload.loading;
    if (loading > 1.2) {
      return '紧急减负荷或转移负荷，否则可能导致设备损坏';
    } else if (loading > 1.0) {
      return '尽快转移负荷或限制该线路输送功率';
    } else {
      return '关注负荷变化，必要时采取预防性措施';
    }
  }

  /**
   * 获取电压越限建议
   */
  _getVoltageSuggestion(voltage) {
    if (voltage.type === 'undervoltage') {
      if (voltage.voltage < 0.85) {
        return '紧急投入无功补偿设备或切除部分负荷';
      } else {
        return '投入电容器或增加发电机无功出力';
      }
    } else {
      return '投入电抗器或减少发电机无功出力';
    }
  }

  /**
   * 检修影响评估 (US-047)
   *
   * 评估设备检修对系统的影响
   *
   * @param {string} rid - 项目 rid
   * @param {Object} maintenanceConfig - 检修配置
   * @returns {Promise<Object>} 影响评估结果
   */
  async assessMaintenanceImpact(rid, maintenanceConfig) {
    const {
      deviceKey,       // 检修设备key
      deviceName,      // 设备名称
      maintenanceType, // 检修类型
      duration         // 检修时长
    } = maintenanceConfig;

    console.log(`\n[Maintenance] 评估检修影响: ${deviceName}`);

    const assessment = {
      rid,
      deviceKey,
      deviceName,
      maintenanceType,
      duration,
      timestamp: new Date().toISOString(),
      baseCase: null,
      maintenanceCase: null,
      impact: {},
      recommendations: []
    };

    // 1. 基准潮流计算
    try {
      const baseJob = await this.powerFlow.runPowerFlow(rid, 0, 0);
      const baseViolations = await this.powerFlow.checkViolations(baseJob.jobId);
      assessment.baseCase = {
        jobId: baseJob.jobId,
        status: 'success',
        violations: baseViolations
      };
    } catch (error) {
      assessment.baseCase = { status: 'failed', error: error.message };
      assessment.recommendations.push({
        priority: 'high',
        message: '基准潮流计算失败，请先确保系统正常运行'
      });
      return assessment;
    }

    // 2. 模拟检修状态
    // 注意：实际需要修改模型，这里提供框架
    assessment.maintenanceCase = {
      note: '检修模拟需要修改模型状态',
      simulatedDevice: deviceKey,
      simulationRequired: true
    };

    // 3. 影响分析（基于设备类型）
    const components = await this.client.getAllComponents(rid);
    const device = components[deviceKey];

    if (device) {
      const def = (device.definition || '').toLowerCase();

      if (def.includes('line') || def.includes('branch')) {
        assessment.impact.type = 'line-maintenance';
        assessment.impact.description = `线路${deviceName}检修将影响输电能力`;
        assessment.recommendations.push({
          priority: 'high',
          message: '检查检修期间剩余线路的N-1安全性'
        });
        assessment.recommendations.push({
          priority: 'medium',
          message: '评估是否需要限制相关区域负荷'
        });
      } else if (def.includes('transformer')) {
        assessment.impact.type = 'transformer-maintenance';
        assessment.impact.description = `变压器${deviceName}检修将影响供电能力`;
        assessment.recommendations.push({
          priority: 'high',
          message: '检查并列变压器的负载能力'
        });
        assessment.recommendations.push({
          priority: 'medium',
          message: '准备负荷转移方案'
        });
      } else if (def.includes('generator') || def.includes('syncgen')) {
        assessment.impact.type = 'generator-maintenance';
        assessment.impact.description = `发电机${deviceName}检修将减少系统发电能力`;
        assessment.recommendations.push({
          priority: 'high',
          message: '检查系统备用容量是否充足'
        });
        assessment.recommendations.push({
          priority: 'medium',
          message: '评估其他机组的调节能力'
        });
      }
    }

    // 4. 风险等级评估
    assessment.riskLevel = this._assessRiskLevel(assessment);

    return assessment;
  }

  /**
   * 评估风险等级
   */
  _assessRiskLevel(assessment) {
    const criticalRecs = assessment.recommendations.filter(r => r.priority === 'high').length;

    if (criticalRecs >= 2) {
      return { level: 'high', color: 'red', message: '高风险检修，需详细评估' };
    } else if (criticalRecs === 1) {
      return { level: 'medium', color: 'yellow', message: '中等风险检修，需关注' };
    } else {
      return { level: 'low', color: 'green', message: '低风险检修，可正常执行' };
    }
  }

  /**
   * 保存运行方式快照 (US-048)
   *
   * @param {string} rid - 项目 rid
   * @param {Object} snapshotConfig - 快照配置
   * @returns {Promise<Object>} 快照信息
   */
  async saveOperatingModeSnapshot(rid, snapshotConfig) {
    const {
      name,
      description,
      tags = []
    } = snapshotConfig;

    console.log(`\n[Snapshot] 保存运行方式快照: ${name}`);

    // 获取当前系统状态
    const components = await this.client.getAllComponents(rid);
    const modelInfo = await this.client.getModel(rid);

    const snapshot = {
      id: `snapshot_${Date.now()}`,
      rid,
      name,
      description,
      tags,
      timestamp: new Date().toISOString(),
      modelInfo: {
        name: modelInfo.name,
        rid: modelInfo.rid
      },
      componentSummary: {
        total: Object.keys(components).length,
        byType: this._countByType(components)
      },
      // 实际快照数据需要导出模型
      snapshotPath: null,
      status: 'created'
    };

    // 导出模型快照
    try {
      const exportPath = `/tmp/snapshot_${snapshot.id}.yaml.gz`;
      await this.client.exportModel(rid, exportPath, { format: 'yaml', compress: 'gzip' });
      snapshot.snapshotPath = exportPath;
      snapshot.status = 'completed';
    } catch (error) {
      snapshot.status = 'failed';
      snapshot.error = error.message;
    }

    console.log(`[Snapshot] 快照保存${snapshot.status === 'completed' ? '成功' : '失败'}`);

    return snapshot;
  }

  /**
   * 统计各类型元件数量
   */
  _countByType(components) {
    const count = {};
    for (const comp of Object.values(components)) {
      const def = (comp.definition || 'unknown').toLowerCase();
      // 简化类型名称
      let type = def.split('/')[0] || def;
      count[type] = (count[type] || 0) + 1;
    }
    return count;
  }

  /**
   * 搜索运行方式档案
   *
   * @param {Object} query - 搜索查询
   * @returns {Promise<Array>} 档案列表
   */
  async searchOperatingModeArchive(query = {}) {
    const { name, tags, dateRange } = query;

    // 这是一个框架实现，实际需要连接数据库或文件系统
    const archiveList = [];

    // 示例：搜索快照文件
    // 实际实现需要持久化存储

    return {
      query,
      results: archiveList,
      message: '档案搜索功能需要配置持久化存储'
    };
  }
}

module.exports = OperationSupportSkill;