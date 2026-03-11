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

    // 获取系统元件
    const components = await this.client.getAllComponents(rid);

    // 构建节点导纳矩阵
    const { Ybus, buses: busList, baseMVA } = await this._buildYbus(components);

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

    const components = await this.client.getAllComponents(rid);

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

  async _buildYbus(components) {
    const buses = [];
    const busMap = {};
    let baseMVA = 100;

    // 提取母线
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('bus') || def.includes('node')) {
        busMap[key] = buses.length;
        buses.push(key);
      }
      if (comp.args?.baseMVA) {
        baseMVA = comp.args.baseMVA;
      }
    }

    const n = buses.length;
    const Ybus = Array(n).fill(null).map(() =>
      Array(n).fill(null).map(() => ({ g: 0, b: 0 }))
    );

    // 添加支路导纳
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      const args = comp.args || {};

      if (def.includes('line') || def.includes('branch')) {
        const from = comp.ports?.from;
        const to = comp.ports?.to;

        if (from && to && busMap[from] !== undefined && busMap[to] !== undefined) {
          const i = busMap[from];
          const j = busMap[to];

          const R = args.R || 0.01;
          const X = args.X || 0.1;
          const B = args.B || 0;

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

    // 添加发电机次暂态电抗
    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('gen')) {
        const bus = comp.ports?.bus;
        if (bus && busMap[bus] !== undefined) {
          const i = busMap[bus];
          const Xd = comp.args?.Xd || 0.2;  // 次暂态电抗

          Ybus[i][i].b += 1 / Xd;
        }
      }
    }

    return { Ybus, buses, baseMVA };
  }

  _calculateBusShortCircuit(bus, busIdx, Ybus, baseMVA, components) {
    // 简化计算：假设Vprefault = 1.0 p.u.
    const Vprefault = 1.0;

    // 计算戴维南等效阻抗
    const Yii = Ybus[busIdx][busIdx];
    const Zth = {
      r: Yii.g / (Yii.g * Yii.g + Yii.b * Yii.b),
      x: -Yii.b / (Yii.g * Yii.g + Yii.b * Yii.b)
    };

    const Zth_mag = Math.sqrt(Zth.r * Zth.r + Zth.x * Zth.x);

    // 计算短路电流
    const Isc_pu = Vprefault / Zth_mag;

    // 假设基准电压（需要从母线参数获取）
    const baseKV = 110;  // kV
    const Ibase = baseMVA / (Math.sqrt(3) * baseKV);  // kA
    const Isc_kA = Isc_pu * Ibase;

    // 短路容量
    const Ssc = Math.sqrt(3) * baseKV * Isc_kA;  // MVA

    // X/R 比值
    const XR_ratio = Zth.x / Zth.r;

    return {
      bus,
      Isc_kA: Isc_kA.toFixed(2),
      Isc_pu: Isc_pu.toFixed(4),
      Ssc_MVA: Ssc.toFixed(2),
      Zth_ohm: { r: Zth.r.toFixed(4), x: Zth.x.toFixed(4) },
      XR_ratio: XR_ratio.toFixed(2),
      baseKV,
      baseMVA
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
    const Isc_values = results.map(r => parseFloat(r.Isc_kA));

    return {
      total: results.length,
      maxIsc_kA: Math.max(...Isc_values).toFixed(2),
      minIsc_kA: Math.min(...Isc_values).toFixed(2),
      avgIsc_kA: (Isc_values.reduce((a, b) => a + b, 0) / Isc_values.length).toFixed(2),
      maxBus: results.find(r => parseFloat(r.Isc_kA) === Math.max(...Isc_values))?.bus,
      minBus: results.find(r => parseFloat(r.Isc_kA) === Math.min(...Isc_values))?.bus
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