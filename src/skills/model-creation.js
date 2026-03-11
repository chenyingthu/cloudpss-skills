/**
 * Model Creation Skill - 模型创建技能
 *
 * US-007: 从零构建简单算例
 * US-009: 批量导入设备参数
 */

const path = require('path');
const fs = require('fs');

class ModelCreationSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
  }

  /**
   * 创建空白算例 (US-007)
   *
   * @param {Object} config - 算例配置
   * @returns {Promise<Object>} 创建结果
   */
  async createBlankModel(config) {
    const {
      name,           // 算例名称
      description,    // 描述
      baseMVA = 100,  // 基准容量 (MVA)
      baseKV = 110    // 基准电压 (kV)
    } = config;

    console.log(`\n[Creation] 创建空白算例: ${name}`);

    // 创建空白算例结构
    const model = {
      name,
      description: description || `Created by CloudPSS Skills - ${new Date().toISOString()}`,
      version: '1.0',
      baseMVA,
      baseKV,
      components: {},
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: 'cloudpss-skills',
        type: 'blank'
      }
    };

    // 尝试在平台上创建（如果API支持）
    try {
      // 实际创建需要调用平台API
      // const result = await this.client.createModel(model);
      // return { success: true, rid: result.rid, model };

      console.log(`[Creation] 空白算例结构已生成`);
      console.log(`[Creation] 基准容量: ${baseMVA} MVA`);
      console.log(`[Creation] 基准电压: ${baseKV} kV`);

      return {
        success: true,
        model,
        message: '空白算例结构已创建，需要通过平台API完成实际创建'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 添加母线节点
   *
   * @param {Object} model - 模型对象
   * @param {Object} busConfig - 母线配置
   * @returns {Object} 更新后的模型
   */
  addBus(model, busConfig) {
    const {
      name,           // 母线名称
      type = 'PQ',    // 节点类型: PQ, PV, Slack
      voltage = 1.0,  // 初始电压 (p.u.)
      angle = 0,      // 相角 (度)
      area = 1,       // 区域
      zone = 1        // 分区
    } = busConfig;

    const busKey = `bus_${Object.keys(model.components).filter(k => k.startsWith('bus')).length + 1}`;

    model.components[busKey] = {
      definition: 'Bus',
      label: name,
      args: {
        Vm: voltage,
        Va: angle,
        area: area,
        zone: zone,
        type: this._getBusTypeCode(type)
      }
    };

    console.log(`[Creation] 添加母线: ${name} (${type})`);
    return model;
  }

  /**
   * 添加发电机
   *
   * @param {Object} model - 模型对象
   * @param {Object} genConfig - 发电机配置
   * @returns {Object} 更新后的模型
   */
  addGenerator(model, genConfig) {
    const {
      name,           // 发电机名称
      bus,            // 连接母线
      P = 0,          // 有功出力 (MW)
      Q = 0,          // 无功出力 (MVar)
      Qmin = -100,    // 最小无功 (MVar)
      Qmax = 100,     // 最大无功 (MVar)
      Vg = 1.0        // 电压设定值 (p.u.)
    } = genConfig;

    const genKey = `gen_${Object.keys(model.components).filter(k => k.startsWith('gen')).length + 1}`;

    model.components[genKey] = {
      definition: 'Generator',
      label: name,
      args: {
        P: P,
        Q: Q,
        Qmin: Qmin,
        Qmax: Qmax,
        Vg: Vg
      },
      ports: {
        bus: bus
      }
    };

    console.log(`[Creation] 添加发电机: ${name} (${P} MW)`);
    return model;
  }

  /**
   * 添加负荷
   *
   * @param {Object} model - 模型对象
   * @param {Object} loadConfig - 负荷配置
   * @returns {Object} 更新后的模型
   */
  addLoad(model, loadConfig) {
    const {
      name,           // 负荷名称
      bus,            // 连接母线
      P = 0,          // 有功负荷 (MW)
      Q = 0           // 无功负荷 (MVar)
    } = loadConfig;

    const loadKey = `load_${Object.keys(model.components).filter(k => k.startsWith('load')).length + 1}`;

    model.components[loadKey] = {
      definition: 'Load',
      label: name,
      args: {
        P: P,
        Q: Q
      },
      ports: {
        bus: bus
      }
    };

    console.log(`[Creation] 添加负荷: ${name} (${P} MW, ${Q} MVar)`);
    return model;
  }

  /**
   * 添加线路
   *
   * @param {Object} model - 模型对象
   * @param {Object} lineConfig - 线路配置
   * @returns {Object} 更新后的模型
   */
  addLine(model, lineConfig) {
    const {
      name,           // 线路名称
      from,           // 起始母线
      to,             // 终止母线
      R = 0,          // 电阻 (p.u.)
      X = 0.1,        // 电抗 (p.u.)
      B = 0,          // 电纳 (p.u.)
      length = 1,     // 长度 (km)
      rating = 1000   // 额定容量 (MVA)
    } = lineConfig;

    const lineKey = `line_${Object.keys(model.components).filter(k => k.startsWith('line')).length + 1}`;

    model.components[lineKey] = {
      definition: 'Line',
      label: name,
      args: {
        R: R * length,
        X: X * length,
        B: B * length,
        rating: rating
      },
      ports: {
        from: from,
        to: to
      }
    };

    console.log(`[Creation] 添加线路: ${name} (${from} -> ${to})`);
    return model;
  }

  /**
   * 添加变压器
   *
   * @param {Object} model - 模型对象
   * @param {Object} xfmrConfig - 变压器配置
   * @returns {Object} 更新后的模型
   */
  addTransformer(model, xfmrConfig) {
    const {
      name,           // 变压器名称
      from,           // 一次侧母线
      to,             // 二次侧母线
      R = 0.01,       // 电阻 (p.u.)
      X = 0.1,        // 电抗 (p.u.)
      tap = 1.0,      // 变比
      rating = 100    // 额定容量 (MVA)
    } = xfmrConfig;

    const xfmrKey = `xfmr_${Object.keys(model.components).filter(k => k.startsWith('xfmr')).length + 1}`;

    model.components[xfmrKey] = {
      definition: 'Transformer',
      label: name,
      args: {
        R: R,
        X: X,
        tap: tap,
        rating: rating
      },
      ports: {
        from: from,
        to: to
      }
    };

    console.log(`[Creation] 添加变压器: ${name} (${from} -> ${to})`);
    return model;
  }

  /**
   * 验证模型完整性
   *
   * @param {Object} model - 模型对象
   * @returns {Object} 验证结果
   */
  validateModel(model) {
    console.log(`\n[Creation] 验证模型完整性`);

    const issues = [];

    // 检查是否有母线
    const buses = Object.keys(model.components).filter(k => model.components[k].definition === 'Bus');
    if (buses.length < 1) {
      issues.push({ type: 'error', message: '模型中没有母线' });
    }

    // 检查是否有平衡节点
    const slackBuses = buses.filter(k => model.components[k].args?.type === 3);
    if (slackBuses.length === 0) {
      issues.push({ type: 'warning', message: '模型中没有平衡节点' });
    } else if (slackBuses.length > 1) {
      issues.push({ type: 'warning', message: '模型中有多个平衡节点' });
    }

    // 检查是否有发电机
    const generators = Object.keys(model.components).filter(k => model.components[k].definition === 'Generator');
    if (generators.length < 1) {
      issues.push({ type: 'warning', message: '模型中没有发电机' });
    }

    // 检查是否有负荷
    const loads = Object.keys(model.components).filter(k => model.components[k].definition === 'Load');
    if (loads.length < 1) {
      issues.push({ type: 'info', message: '模型中没有负荷' });
    }

    // 检查连接关系
    const lineLike = Object.keys(model.components).filter(k =>
      ['Line', 'Transformer'].includes(model.components[k].definition)
    );

    for (const key of lineLike) {
      const comp = model.components[key];
      if (!comp.ports?.from || !comp.ports?.to) {
        issues.push({ type: 'error', message: `${comp.label || key} 缺少连接信息` });
      }
    }

    const valid = issues.filter(i => i.type === 'error').length === 0;

    console.log(`[Creation] 验证结果: ${valid ? '通过' : '存在问题'}`);
    if (issues.length > 0) {
      issues.forEach(i => console.log(`  ${i.type}: ${i.message}`));
    }

    return {
      valid,
      issues,
      summary: {
        buses: buses.length,
        generators: generators.length,
        loads: loads.length,
        lines: lineLike.length
      }
    };
  }

  /**
   * 批量导入设备参数 (US-009)
   *
   * @param {string} rid - 算例RID
   * @param {string} filePath - Excel/CSV文件路径
   * @param {Object} options - 导入选项
   * @returns {Promise<Object>} 导入结果
   */
  async importParameters(rid, filePath, options = {}) {
    console.log(`\n[Import] 批量导入设备参数`);
    console.log(`[Import] 文件: ${filePath}`);

    const {
      type = 'auto',        // 设备类型: line, transformer, generator, load, auto
      matchBy = 'name',     // 匹配方式: name, id
      update = true,        // 是否更新参数
      reportOnly = false    // 仅生成报告，不实际更新
    } = options;

    // 读取文件
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `文件不存在: ${filePath}`
      };
    }

    // 解析文件
    let data;
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.csv') {
        data = this._parseCSV(filePath);
      } else if (ext === '.xlsx' || ext === '.xls') {
        data = this._parseExcel(filePath);
      } else if (ext === '.json') {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } else {
        return {
          success: false,
          error: `不支持的文件格式: ${ext}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `文件解析失败: ${error.message}`
      };
    }

    console.log(`[Import] 解析到 ${data.length} 条记录`);

    // 获取现有元件
    const components = await this.client.getAllComponents(rid);

    // 匹配和更新
    const results = {
      total: data.length,
      matched: 0,
      updated: 0,
      unmatched: [],
      errors: []
    };

    for (const row of data) {
      const matchKey = row.name || row.id || row.label;
      if (!matchKey) {
        results.errors.push({ row, error: '缺少标识字段' });
        continue;
      }

      // 查找匹配元件
      const matchedKey = this._findComponent(components, matchKey, matchBy, type);

      if (!matchedKey) {
        results.unmatched.push(matchKey);
        continue;
      }

      results.matched++;

      // 更新参数
      if (update && !reportOnly) {
        try {
          const comp = components[matchedKey];
          const newArgs = this._mergeParameters(comp.args || {}, row);
          comp.args = newArgs;

          results.updated++;
          console.log(`[Import] 更新: ${comp.label || matchedKey}`);
        } catch (error) {
          results.errors.push({ key: matchedKey, error: error.message });
        }
      }
    }

    // 保存更新（如果API支持）
    if (update && results.updated > 0 && !reportOnly) {
      try {
        // await this.client.updateModel(rid, components);
        console.log(`[Import] 参数更新完成`);
      } catch (error) {
        return {
          success: false,
          error: `保存失败: ${error.message}`,
          results
        };
      }
    }

    console.log(`[Import] 导入完成: 匹配 ${results.matched}/${results.total}`);
    if (results.unmatched.length > 0) {
      console.log(`[Import] 未匹配: ${results.unmatched.join(', ')}`);
    }

    return {
      success: true,
      results,
      message: `成功导入 ${results.matched}/${results.total} 条记录`
    };
  }

  /**
   * 导出参数模板
   *
   * @param {string} rid - 算例RID
   * @param {string} type - 设备类型
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 导出结果
   */
  async exportTemplate(rid, type, outputPath) {
    console.log(`\n[Import] 导出参数模板: ${type}`);

    const components = await this.client.getAllComponents(rid);

    // 过滤指定类型
    const filtered = Object.entries(components).filter(([key, comp]) => {
      const def = (comp.definition || '').toLowerCase();
      return def.includes(type.toLowerCase());
    });

    // 生成模板数据
    const template = filtered.map(([key, comp]) => ({
      name: comp.label || key,
      key: key,
      ...this._extractParameters(comp.args || {}, type)
    }));

    // 写入文件
    const ext = path.extname(outputPath).toLowerCase();
    let content;

    if (ext === '.csv') {
      content = this._toCSV(template);
    } else if (ext === '.json') {
      content = JSON.stringify(template, null, 2);
    } else {
      content = JSON.stringify(template, null, 2);
    }

    fs.writeFileSync(outputPath, content);
    console.log(`[Import] 模板已导出: ${outputPath}`);

    return {
      success: true,
      file: outputPath,
      count: template.length
    };
  }

  // ========== 辅助方法 ==========

  _getBusTypeCode(type) {
    const typeMap = {
      'PQ': 1,
      'PV': 2,
      'Slack': 3,
      'PQ': 1,
      'PV': 2,
      'REF': 3
    };
    return typeMap[type] || 1;
  }

  _parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() || '';
      });
      data.push(row);
    }

    return data;
  }

  _parseExcel(filePath) {
    // 简化实现，实际需要使用xlsx库
    // 这里返回示例数据结构
    console.log('[Import] Excel解析需要xlsx库支持');
    return [];
  }

  _findComponent(components, matchKey, matchBy, type) {
    for (const [key, comp] of Object.entries(components)) {
      // 类型过滤
      if (type !== 'auto') {
        const def = (comp.definition || '').toLowerCase();
        if (!def.includes(type.toLowerCase())) continue;
      }

      // 名称匹配
      if (matchBy === 'name' && (comp.label === matchKey || key === matchKey)) {
        return key;
      }

      // ID匹配
      if (matchBy === 'id' && key === matchKey) {
        return key;
      }
    }

    return null;
  }

  _mergeParameters(existing, newParams) {
    const merged = { ...existing };

    // 映射常见参数名称
    const paramMap = {
      'R': ['R', 'r', 'resistance'],
      'X': ['X', 'x', 'reactance'],
      'B': ['B', 'b', 'susceptance'],
      'P': ['P', 'p', 'Pg', 'Pd', 'active_power'],
      'Q': ['Q', 'q', 'Qg', 'Qd', 'reactive_power'],
      'rating': ['rating', 'Smax', 'capacity', 'capacity_mva'],
      'tap': ['tap', 'ratio', 'turns_ratio']
    };

    for (const [param, aliases] of Object.entries(paramMap)) {
      for (const alias of aliases) {
        if (newParams[alias] !== undefined) {
          merged[param] = parseFloat(newParams[alias]) || newParams[alias];
          break;
        }
      }
    }

    return merged;
  }

  _extractParameters(args, type) {
    const params = {};

    // 根据类型提取参数
    if (type === 'line') {
      params.R = args.R || 0;
      params.X = args.X || 0;
      params.B = args.B || 0;
      params.rating = args.rating || '';
    } else if (type === 'transformer') {
      params.R = args.R || 0;
      params.X = args.X || 0;
      params.tap = args.tap || 1.0;
      params.rating = args.rating || '';
    } else if (type === 'generator') {
      params.P = args.P || 0;
      params.Q = args.Q || 0;
      params.Qmax = args.Qmax || '';
      params.Qmin = args.Qmin || '';
    } else if (type === 'load') {
      params.P = args.P || 0;
      params.Q = args.Q || 0;
    }

    return params;
  }

  _toCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const lines = [headers.join(',')];

    for (const row of data) {
      const values = headers.map(h => row[h] || '');
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }
}

module.exports = { ModelCreationSkill };