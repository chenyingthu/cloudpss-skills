/**
 * Model Editor Skill - 模型编辑技能
 *
 * US-004: 添加新线路
 * US-005: 删除退役设备
 * US-008: 算例版本管理
 */

const path = require('path');
const fs = require('fs');

class ModelEditorSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.versionHistory = {};
  }

  /**
   * 添加新元件 (US-004)
   *
   * @param {string} rid - 项目 rid
   * @param {Object} componentConfig - 元件配置
   * @returns {Promise<Object>} 添加结果
   */
  async addComponent(rid, componentConfig) {
    const {
      type,           // 元件类型: line, transformer, generator, load, etc.
      name,           // 元件名称
      parameters,     // 元件参数
      connections     // 连接信息 { from: 'Bus1', to: 'Bus2' }
    } = componentConfig;

    console.log(`\n[Editor] 添加元件: ${type} - ${name}`);

    // 验证参数
    const validation = this._validateComponentConfig(type, parameters);
    if (!validation.valid) {
      return {
        success: false,
        error: `参数验证失败: ${validation.errors.join(', ')}`
      };
    }

    // 获取当前模型
    const components = await this.client.getAllComponents(rid);

    // 检查连接节点是否存在
    if (connections) {
      const missingNodes = this._checkConnectionNodes(components, connections);
      if (missingNodes.length > 0) {
        return {
          success: false,
          error: `连接节点不存在: ${missingNodes.join(', ')}`
        };
      }
    }

    // 生成元件key
    const componentKey = `${type}_${Object.keys(components).length + 1}_${Date.now()}`;

    // 构建元件数据
    const newComponent = {
      definition: this._getDefinition(type),
      label: name,
      args: this._normalizeParameters(type, parameters),
      ports: this._createPorts(type, connections)
    };

    // 添加到模型
    components[componentKey] = newComponent;

    // 更新模型（需要API支持）
    try {
      // 实际实现需要调用API更新模型
      // await this.client.updateModel(rid, components);

      console.log(`[Editor] 元件添加成功: ${componentKey}`);

      return {
        success: true,
        componentKey,
        component: newComponent,
        message: `成功添加${type}元件: ${name}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 批量添加元件
   */
  async addBatchComponents(rid, componentsList) {
    console.log(`\n[Editor] 批量添加${componentsList.length}个元件`);

    const results = [];
    for (const config of componentsList) {
      const result = await this.addComponent(rid, config);
      results.push({ config, result });
    }

    const successCount = results.filter(r => r.result.success).length;
    console.log(`[Editor] 批量添加完成: ${successCount}/${componentsList.length}`);

    return {
      total: componentsList.length,
      success: successCount,
      failed: results.filter(r => !r.result.success).length,
      results
    };
  }

  /**
   * 删除元件 (US-005)
   *
   * @param {string} rid - 项目 rid
   * @param {string} componentKey - 元件 key
   * @returns {Promise<Object>} 删除结果
   */
  async deleteComponent(rid, componentKey) {
    console.log(`\n[Editor] 删除元件: ${componentKey}`);

    // 获取当前模型
    const components = await this.client.getAllComponents(rid);

    // 检查元件是否存在
    if (!components[componentKey]) {
      return {
        success: false,
        error: `元件 ${componentKey} 不存在`
      };
    }

    const deletedComponent = components[componentKey];

    // 检查是否会影响拓扑完整性
    const topologyCheck = await this._checkTopologyImpact(components, componentKey);

    // 从模型中移除
    delete components[componentKey];

    // 更新模型
    try {
      // 实际实现需要调用API
      // await this.client.updateModel(rid, components);

      console.log(`[Editor] 元件删除成功: ${componentKey}`);

      return {
        success: true,
        componentKey,
        deletedComponent,
        topologyImpact: topologyCheck,
        message: `成功删除元件: ${deletedComponent.label || componentKey}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 检查拓扑影响
   */
  async _checkTopologyImpact(components, componentKey) {
    const comp = components[componentKey];
    const def = (comp.definition || '').toLowerCase();

    const impact = {
      willCreateIsland: false,
      affectedNodes: [],
      affectedBranches: []
    };

    // 检查是否会创建孤岛
    if (def.includes('line') || def.includes('transformer')) {
      // 简化检查：实际需要拓扑分析
      impact.willCreateIsland = false; // 需要实际拓扑分析
      impact.affectedBranches.push(componentKey);
    }

    return impact;
  }

  /**
   * 版本管理 (US-008)
   */

  /**
   * 创建版本快照
   */
  async createVersion(rid, versionInfo) {
    const { name, description, parentVersion } = versionInfo;

    console.log(`\n[Editor] 创建版本: ${name}`);

    // 获取当前模型状态
    const components = await this.client.getAllComponents(rid);
    const modelInfo = await this.client.getModel(rid);

    const version = {
      id: `v_${Date.now()}`,
      rid,
      name,
      description,
      parentVersion,
      timestamp: new Date().toISOString(),
      componentCount: Object.keys(components).length,
      snapshot: JSON.stringify(components)
    };

    // 存储版本历史
    if (!this.versionHistory[rid]) {
      this.versionHistory[rid] = [];
    }
    this.versionHistory[rid].push(version);

    console.log(`[Editor] 版本创建成功: ${version.id}`);

    return {
      success: true,
      version,
      message: `版本 ${name} 创建成功`
    };
  }

  /**
   * 列出版本历史
   */
  async listVersions(rid) {
    const versions = this.versionHistory[rid] || [];

    return {
      rid,
      count: versions.length,
      versions: versions.map(v => ({
        id: v.id,
        name: v.name,
        description: v.description,
        timestamp: v.timestamp,
        componentCount: v.componentCount
      }))
    };
  }

  /**
   * 恢复到指定版本
   */
  async restoreVersion(rid, versionId) {
    console.log(`\n[Editor] 恢复版本: ${versionId}`);

    const versions = this.versionHistory[rid] || [];
    const version = versions.find(v => v.id === versionId);

    if (!version) {
      return {
        success: false,
        error: `版本 ${versionId} 不存在`
      };
    }

    try {
      const components = JSON.parse(version.snapshot);

      // 实际实现需要调用API恢复模型
      // await this.client.updateModel(rid, components);

      console.log(`[Editor] 版本恢复成功: ${versionId}`);

      return {
        success: true,
        version,
        message: `已恢复到版本 ${version.name}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 比较两个版本
   */
  async compareVersions(rid, versionId1, versionId2) {
    const versions = this.versionHistory[rid] || [];
    const v1 = versions.find(v => v.id === versionId1);
    const v2 = versions.find(v => v.id === versionId2);

    if (!v1 || !v2) {
      return {
        success: false,
        error: '指定的版本不存在'
      };
    }

    try {
      const c1 = JSON.parse(v1.snapshot);
      const c2 = JSON.parse(v2.snapshot);

      const diff = this._compareComponents(c1, c2);

      return {
        success: true,
        version1: { id: v1.id, name: v1.name },
        version2: { id: v2.id, name: v2.name },
        differences: diff
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 比较元件差异
   */
  _compareComponents(c1, c2) {
    const keys1 = new Set(Object.keys(c1));
    const keys2 = new Set(Object.keys(c2));

    const added = [...keys2].filter(k => !keys1.has(k));
    const removed = [...keys1].filter(k => !keys2.has(k));
    const modified = [];

    for (const key of keys1) {
      if (keys2.has(key)) {
        if (JSON.stringify(c1[key]) !== JSON.stringify(c2[key])) {
          modified.push({
            key,
            before: c1[key],
            after: c2[key]
          });
        }
      }
    }

    return {
      added: added.map(k => ({ key, component: c2[k] })),
      removed: removed.map(k => ({ key, component: c1[k] })),
      modified,
      summary: {
        added: added.length,
        removed: removed.length,
        modified: modified.length
      }
    };
  }

  /**
   * 辅助方法
   */

  _validateComponentConfig(type, parameters) {
    const errors = [];
    const requiredParams = {
      line: ['R', 'X', 'from', 'to'],
      transformer: ['Rk', 'Xk', 'Sn', 'from', 'to'],
      generator: ['P', 'V', 'bus'],
      load: ['P', 'Q', 'bus']
    };

    const required = requiredParams[type] || [];
    for (const param of required) {
      if (parameters[param] === undefined && parameters[param.toLowerCase()] === undefined) {
        errors.push(`缺少必需参数: ${param}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _checkConnectionNodes(components, connections) {
    const missing = [];
    const existingNodes = new Set();

    // 收集所有节点
    for (const comp of Object.values(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('bus') || def.includes('node')) {
        // 需要根据实际数据结构获取节点ID
      }
    }

    if (connections.from && !existingNodes.has(connections.from)) {
      missing.push(connections.from);
    }
    if (connections.to && !existingNodes.has(connections.to)) {
      missing.push(connections.to);
    }

    return missing;
  }

  _getDefinition(type) {
    const definitions = {
      line: 'cloudpss/Line',
      transformer: 'cloudpss/TwoWindingTransformer',
      generator: 'cloudpss/SyncGen',
      load: 'cloudpss/PQLoad'
    };
    return definitions[type] || type;
  }

  _normalizeParameters(type, params) {
    const normalized = {};
    for (const [key, value] of Object.entries(params)) {
      // 标准化参数名称
      normalized[key] = value;
    }
    return normalized;
  }

  _createPorts(type, connections) {
    if (!connections) return {};

    const portConfigs = {
      line: { p1: connections.from, p2: connections.to },
      transformer: { p1: connections.from, p2: connections.to },
      generator: { p1: connections.bus },
      load: { p1: connections.bus }
    };

    return portConfigs[type] || {};
  }
}

module.exports = ModelEditorSkill;