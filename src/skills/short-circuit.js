/**
 * Short Circuit Analysis Skill - 短路电流计算技能
 *
 * US-027: 短路电流计算
 */

class ShortCircuitSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
  }

  /**
   * 计算三相短路电流 (US-027)
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 计算配置
   * @returns {Promise<Object>} 计算结果
   */
  async calculateThreePhase(rid, config = {}) {
    const {
      buses = null,         // 指定母线列表，null表示全部
      includeImpedance = true,
      voltageLevel = null   // 电压等级过滤 (kV)
    } = config;

    console.log(`\n[ShortCircuit] 三相短路电流计算`);
    console.log(`[ShortCircuit] 算例: ${rid}`);

    // 获取拓扑数据（包含完整的 pins 连接信息）
    // 注意：必须使用 getTopology() 而不是 getAllComponents()
    // 因为 getAllComponents() 返回的 pins 为空，而 getTopology() 返回解析后的连接编号
    console.log(`[ShortCircuit] 获取拓扑数据...`);
    const topologyData = await this.client.getTopology(rid, 'powerFlow');
    const components = topologyData.components || {};

    console.log(`[ShortCircuit] 获取到 ${Object.keys(components).length} 个元件`);

    // 构建节点导纳矩阵
    const { Ybus, buses: busList, baseMVA, connectivityStatus } = await this._buildYbus(components);

    // 检查数据质量
    if (!connectivityStatus.hasLineConnectivity) {
      console.log(`[ShortCircuit] ⚠️ 警告: 线路连接信息缺失，无法构建准确的导纳矩阵`);
      console.log(`[ShortCircuit] 建议: 请确保模型数据包含完整的元件连接信息`);

      // 返回带有警告的结果
      return {
        success: false,
        type: 'three-phase',
        error: 'DATA_INCOMPLETE',
        message: '线路连接信息缺失，短路电流计算需要完整的元件连接数据',
        details: {
          busCount: busList.length,
          lineCount: connectivityStatus.lineCount,
          generatorCount: connectivityStatus.generatorCount,
          connectedGenerators: connectivityStatus.connectedGenerators,
          suggestion: '请使用 getTopology() 获取完整的拓扑连接信息'
        },
        results: [],
        summary: {
          total: busList.length,
          validCount: 0,
          invalidCount: busList.length,
          warning: '数据不完整，无法计算短路电流'
        },
        timestamp: new Date().toISOString()
      };
    }

    // 求解短路电流
    const results = [];

    const targetBuses = buses || busList;

    for (const bus of targetBuses) {
      const busIdx = busList.indexOf(bus);
      if (busIdx < 0) continue;

      // 计算该节点的短路电流
      const scResult = this._calculateBusShortCircuit(
        bus, busIdx, Ybus, baseMVA, components
      );

      results.push(scResult);
    }

    console.log(`[ShortCircuit] 计算完成: ${results.length} 个节点`);

    // 生成汇总
    const summary = this._generateSummary(results);

    return {
      success: true,
      type: 'three-phase',
      results,
      summary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 计算单相短路电流
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 计算配置
   * @returns {Promise<Object>} 计算结果
   */
  async calculateSinglePhase(rid, config = {}) {
    const {
      buses = null,
      groundImpedance = 0
    } = config;

    console.log(`\n[ShortCircuit] 单相短路电流计算`);

    // 获取拓扑数据（包含完整的 pins 连接信息）
    // 注意：必须使用 getTopology() 而不是 getAllComponents()
    // 因为 getAllComponents() 返回的 pins 为空，而 getTopology() 返回解析后的连接编号
    const topologyData = await this.client.getTopology(rid, 'powerFlow');
    const components = topologyData.components || {};

    // 构建序网阻抗
    const { Z1, Z2, Z0, buses: busList, baseMVA } = await this._buildSequenceImpedance(components);

    const results = [];
    const targetBuses = buses || busList;

    for (const bus of targetBuses) {
      const busIdx = busList.indexOf(bus);
      if (busIdx < 0) continue;

      // 计算单相短路电流
      // I_f = 3 * V_prefault / (Z1 + Z2 + Z0 + 3*Zg)
      const Z1bus = Z1[busIdx]?.[busIdx] || { r: 0.001, x: 0.1 };
      const Z2bus = Z2[busIdx]?.[busIdx] || Z1bus;
      const Z0bus = Z0[busIdx]?.[busIdx] || { r: 0.01, x: 1.0 };

      const Ztotal = {
        r: Z1bus.r + Z2bus.r + Z0bus.r + 3 * groundImpedance,
        x: Z1bus.x + Z2bus.x + Z0bus.x + 3 * groundImpedance
      };

      const Vprefault = 1.0;  // p.u.
      const Isc_pu = 3 * Vprefault / Math.sqrt(Ztotal.r * Ztotal.r + Ztotal.x * Ztotal.x);
      const Isc_kA = Isc_pu * baseMVA / (Math.sqrt(3) * 110);  // 假设110kV

      results.push({
        bus,
        Isc_kA: Isc_kA.toFixed(2),
        Isc_pu: Isc_pu.toFixed(4),
        Z1: Z1bus,
        Z2: Z2bus,
        Z0: Z0bus
      });
    }

    return {
      success: true,
      type: 'single-phase',
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 生成短路容量报告
   *
   * @param {Object} scResults - 短路计算结果
   * @param {Object} options - 报告选项
   * @returns {Object} 报告数据
   */
  generateReport(scResults, options = {}) {
    const { format = 'table' } = options;

    console.log(`\n[ShortCircuit] 生成短路容量报告`);

    const report = {
      title: '短路电流计算报告',
      timestamp: new Date().toISOString(),
      type: scResults.type,
      data: []
    };

    for (const result of scResults.results) {
      const ssc = result.Isc_kA * Math.sqrt(3) * 110;  // MVA

      report.data.push({
        bus: result.bus,
        Isc_kA: result.Isc_kA,
        Ssc_MVA: ssc.toFixed(2),
        X_R_ratio: result.XR_ratio || 'N/A',
        status: this._checkStandard(parseFloat(result.Isc_kA))
      });
    }

    // 按短路电流大小排序
    report.data.sort((a, b) => parseFloat(b.Isc_kA) - parseFloat(a.Isc_kA));

    // 生成表格格式
    if (format === 'table') {
      report.table = this._formatTable(report.data);
    }

    return report;
  }

  /**
   * 检查短路电流是否超标
   *
   * @param {Object} scResults - 短路计算结果
   * @param {Object} limits - 限值配置
   * @returns {Object} 检查结果
   */
  checkViolations(scResults, limits = {}) {
    const {
      maxIsc_kA = 50,    // 最大短路电流限值 (kA)
      voltageLevels = {} // 按电压等级的限值 { 110: 31.5, 220: 50, 500: 63 }
    } = limits;

    console.log(`\n[ShortCircuit] 检查短路电流超标`);

    const violations = [];

    for (const result of scResults.results) {
      const Isc = parseFloat(result.Isc_kA);
      const limit = maxIsc_kA;

      if (Isc > limit) {
        violations.push({
          bus: result.bus,
          Isc_kA: Isc,
          limit: limit,
          exceed_percent: ((Isc - limit) / limit * 100).toFixed(1),
          severity: Isc > limit * 1.2 ? 'critical' : 'warning',
          recommendation: this._getRecommendation(Isc, limit)
        });
      }
    }

    console.log(`[ShortCircuit] 发现 ${violations.length} 处超标`);

    return {
      total: scResults.results.length,
      violations,
      violationCount: violations.length,
      criticalCount: violations.filter(v => v.severity === 'critical').length
    };
  }

  // ========== 内部方法 ==========

  /**
   * 从元件的 pins 中提取连接的节点
   * CloudPSS pins 结构: { "pinId": "nodeId", ... }
   * 例如: 线路 pins = { "0": "bus1", "1": "bus2" }
   *       发电机 pins = { "0": "bus5" }
   */
  _getConnectedNodes(comp) {
    const pins = comp.pins || {};
    const nodes = [];

    for (const [pinId, nodeId] of Object.entries(pins)) {
      if (nodeId && nodeId !== '') {
        nodes.push({ pinId, nodeId });
      }
    }

    return nodes;
  }

  /**
   * 构建电气节点到母线的映射
   * CloudPSS 使用电气节点ID（如 @S2M）连接元件
   * 需要先构建所有元件的节点映射，再找出每个电气节点连接的母线
   */
  _buildNodeToBusMap(components) {
    const nodeToBus = {};
    const busKeyToIndex = {};
    const buses = [];

    // 第一步：识别所有母线元件
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('bus') || def.includes('node')) {
        busKeyToIndex[key] = buses.length;
        buses.push(key);
      }
    }

    // 第二步：构建所有元件的节点映射（类似 topology-analysis）
    const nodeMap = {};  // nodeId -> [components]
    for (const [key, comp] of Object.entries(components)) {
      const pins = comp.pins || {};
      for (const [pinId, nodeId] of Object.entries(pins)) {
        if (nodeId && nodeId !== '') {
          if (!nodeMap[nodeId]) {
            nodeMap[nodeId] = [];
          }
          nodeMap[nodeId].push({ key, comp });
        }
      }
    }

    // 第三步：对于每个电气节点，找到连接的母线
    for (const [nodeId, comps] of Object.entries(nodeMap)) {
      // 在连接到该节点的所有元件中找母线
      for (const { key, comp } of comps) {
        const def = (comp.definition || '').toLowerCase();
        if (def.includes('bus') || def.includes('node')) {
          nodeToBus[nodeId] = {
            busKey: key,
            busIndex: busKeyToIndex[key],
            busLabel: comp.label || key
          };
          break;  // 找到一个母线即可
        }
      }
    }

    return { nodeToBus, busKeyToIndex, buses };
  }

  /**
   * 从 dump 文件解析元件数据
   * CloudPSS 官方 dump 格式: revision.implements.diagram.cells
   *
   * @param {Object} dumpData - dump 文件内容
   * @returns {Object} 元件字典 { key: comp }
   */
  _parseDumpFile(dumpData) {
    const components = {};

    // 检查是否为官方 dump 格式
    if (dumpData.revision?.implements?.diagram?.cells) {
      const cells = dumpData.revision.implements.diagram.cells;

      for (const [key, cell] of Object.entries(cells)) {
        if (cell.definition) {
          components[key] = {
            key,
            id: cell.id,
            label: cell.label || key,
            definition: cell.definition,
            args: cell.args || {},
            pins: cell.pins || {}
          };
        }
      }

      console.log(`[ShortCircuit] 从 dump 文件解析: ${Object.keys(components).length} 个元件`);
    } else {
      // 兼容其他格式
      console.log(`[ShortCircuit] ⚠️ 无法识别的 dump 文件格式`);
    }

    return components;
  }

  async _buildYbus(components) {
    let baseMVA = 100;

    // 构建电气节点到母线的映射
    const { nodeToBus, busKeyToIndex, buses } = this._buildNodeToBusMap(components);

    console.log(`[ShortCircuit] 找到 ${buses.length} 个母线节点`);

    const n = buses.length;
    const Ybus = Array(n).fill(null).map(() =>
      Array(n).fill(null).map(() => ({ g: 0, b: 0 }))
    );

    let lineCount = 0;
    let connectedLines = 0;

    // 添加支路导纳
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      const args = comp.args || {};

      if (def.includes('line') || def.includes('branch')) {
        lineCount++;
        // 使用 pins 获取连接的电气节点
        const nodes = this._getConnectedNodes(comp);

        if (nodes.length >= 2) {
          const fromNodeId = nodes[0].nodeId;
          const toNodeId = nodes[1].nodeId;

          // 通过电气节点找到对应的母线
          const fromBusInfo = nodeToBus[fromNodeId];
          const toBusInfo = nodeToBus[toNodeId];

          if (fromBusInfo && toBusInfo) {
            connectedLines++;
            const i = fromBusInfo.busIndex;
            const j = toBusInfo.busIndex;

            const R = args.R || args.R1 || 0.01;
            const X = args.X || args.X1 || 0.1;
            const B = args.B || args.B1 || 0;

            const Z2 = R * R + X * X;
            const y = { g: R / Z2, b: -X / Z2 };
            const ysh = { g: 0, b: B / 2 };

            // 非对角元素
            Ybus[i][j].g -= y.g;
            Ybus[i][j].b -= y.b;
            Ybus[j][i].g -= y.g;
            Ybus[j][i].b -= y.b;

            // 对角元素
            Ybus[i][i].g += y.g + ysh.g;
            Ybus[i][i].b += y.b + ysh.b;
            Ybus[j][j].g += y.g + ysh.g;
            Ybus[j][j].b += y.b + ysh.b;
          }
        }
      }
    }

    console.log(`[ShortCircuit] 线路: ${lineCount} 条, 成功连接: ${connectedLines} 条`);

    let genCount = 0;
    let connectedGens = 0;

    // 添加发电机次暂态电抗
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      const args = comp.args || {};

      if (def.includes('gen')) {
        genCount++;
        // 使用 pins 获取连接的电气节点
        const nodes = this._getConnectedNodes(comp);
        if (nodes.length >= 1) {
          const nodeId = nodes[0].nodeId;
          const busInfo = nodeToBus[nodeId];

          if (busInfo) {
            connectedGens++;
            const i = busInfo.busIndex;
            const Xd = args.Xd || args.Xd1 || 0.2;  // 次暂态电抗

            Ybus[i][i].b += 1 / Xd;
          }
        }
      }
    }

    console.log(`[ShortCircuit] 发电机: ${genCount} 台, 成功连接: ${connectedGens} 台`);

    // 返回连接状态信息
    const connectivityStatus = {
      lineCount,
      connectedLines,
      generatorCount: genCount,
      connectedGenerators: connectedGens,
      hasLineConnectivity: connectedLines > 0 || lineCount === 0
    };

    return { Ybus, buses, baseMVA, connectivityStatus };
  }

  _calculateBusShortCircuit(bus, busIdx, Ybus, baseMVA, components) {
    // 简化计算：假设Vprefault = 1.0 p.u.
    const Vprefault = 1.0;

    // 计算戴维南等效阻抗
    const Yii = Ybus[busIdx][busIdx];

    // 检查导纳是否有效（非零）
    const Ymag = Math.sqrt(Yii.g * Yii.g + Yii.b * Yii.b);
    if (Ymag < 1e-10) {
      // 导纳矩阵元素接近零，无法计算短路电流
      return {
        bus,
        Isc_kA: '0.00',
        Isc_pu: '0.0000',
        Ssc_MVA: '0.00',
        Zth_ohm: { r: 'N/A', x: 'N/A' },
        XR_ratio: 'N/A',
        baseKV: 110,
        baseMVA,
        valid: false,
        error: '节点孤立或导纳为零'
      };
    }

    const Zth = {
      r: Yii.g / (Yii.g * Yii.g + Yii.b * Yii.b),
      x: -Yii.b / (Yii.g * Yii.g + Yii.b * Yii.b)
    };

    const Zth_mag = Math.sqrt(Zth.r * Zth.r + Zth.x * Zth.x);

    // 防止除以零
    if (Zth_mag < 1e-10) {
      return {
        bus,
        Isc_kA: '∞',
        Isc_pu: '∞',
        Ssc_MVA: '∞',
        Zth_ohm: { r: '0.0000', x: '0.0000' },
        XR_ratio: 'N/A',
        baseKV: 110,
        baseMVA,
        valid: false,
        error: '阻抗接近零（理想电压源）'
      };
    }

    // 计算短路电流
    const Isc_pu = Vprefault / Zth_mag;

    // 假设基准电压（需要从母线参数获取）
    const baseKV = 110;  // kV
    const Ibase = baseMVA / (Math.sqrt(3) * baseKV);  // kA
    const Isc_kA = Isc_pu * Ibase;

    // 短路容量
    const Ssc = Math.sqrt(3) * baseKV * Isc_kA;  // MVA

    // X/R 比值（防止除以零）
    const XR_ratio = Zth.r > 1e-10 ? (Zth.x / Zth.r) : 999;

    return {
      bus,
      Isc_kA: Isc_kA.toFixed(2),
      Isc_pu: Isc_pu.toFixed(4),
      Ssc_MVA: Ssc.toFixed(2),
      Zth_ohm: { r: Zth.r.toFixed(4), x: Zth.x.toFixed(4) },
      XR_ratio: XR_ratio.toFixed(2),
      baseKV,
      baseMVA,
      valid: true
    };
  }

  async _buildSequenceImpedance(components) {
    // 简化实现：返回正序、负序、零序阻抗矩阵
    const buses = [];
    const busMap = {};

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('bus')) {
        busMap[key] = buses.length;
        buses.push(key);
      }
    }

    const n = buses.length;

    // 简化：使用相同矩阵结构
    const Z1 = Array(n).fill(null).map(() =>
      Array(n).fill(null).map(() => ({ r: 0.01, x: 0.1 }))
    );
    const Z2 = Z1.map(row => row.map(cell => ({ ...cell })));
    const Z0 = Array(n).fill(null).map(() =>
      Array(n).fill(null).map(() => ({ r: 0.1, x: 0.3 }))
    );

    return { Z1, Z2, Z0, buses, baseMVA: 100 };
  }

  _generateSummary(results) {
    // 过滤有效结果
    const validResults = results.filter(r => r.valid !== false);
    const Isc_values = validResults.map(r => parseFloat(r.Isc_kA)).filter(v => !isNaN(v) && isFinite(v));

    if (Isc_values.length === 0) {
      return {
        total: results.length,
        validCount: 0,
        invalidCount: results.length,
        maxIsc_kA: 'N/A',
        minIsc_kA: 'N/A',
        avgIsc_kA: 'N/A',
        maxBus: null,
        minBus: null,
        warning: '无有效短路电流计算结果'
      };
    }

    return {
      total: results.length,
      validCount: validResults.length,
      invalidCount: results.length - validResults.length,
      maxIsc_kA: Math.max(...Isc_values).toFixed(2),
      minIsc_kA: Math.min(...Isc_values).toFixed(2),
      avgIsc_kA: (Isc_values.reduce((a, b) => a + b, 0) / Isc_values.length).toFixed(2),
      maxBus: validResults.find(r => parseFloat(r.Isc_kA) === Math.max(...Isc_values))?.bus,
      minBus: validResults.find(r => parseFloat(r.Isc_kA) === Math.min(...Isc_values))?.bus
    };
  }

  _checkStandard(Isc_kA) {
    // 检查是否超过常见标准
    if (Isc_kA > 63) return '超高压限值';
    if (Isc_kA > 50) return '高限值';
    if (Isc_kA > 31.5) return '中压限值';
    return '正常';
  }

  _formatTable(data) {
    const header = '| 母线 | 短路电流(kA) | 短路容量(MVA) | X/R比 | 状态 |';
    const separator = '|------|--------------|---------------|-------|------|';
    const rows = data.map(r =>
      `| ${r.bus} | ${r.Isc_kA} | ${r.Ssc_MVA} | ${r.XR_ratio} | ${r.status} |`
    );

    return [header, separator, ...rows].join('\n');
  }

  _getRecommendation(Isc, limit) {
    const ratio = Isc / limit;

    if (ratio > 1.5) {
      return '建议采取限流措施：安装限流电抗器或更换大容量断路器';
    } else if (ratio > 1.2) {
      return '建议更换大容量断路器或采取网络解列措施';
    } else {
      return '建议在设备更新时选择更高开断能力的设备';
    }
  }
}

module.exports = { ShortCircuitSkill };