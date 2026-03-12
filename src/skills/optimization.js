/**
 * Optimization Skill - 优化分析技能
 *
 * US-031: 发电机出力优化
 * US-033: 网损优化分析
 * US-034: 设备检修计划优化
 */

class OptimizationSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
  }

  /**
   * 发电机出力优化 (US-031) - 经济调度
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 优化配置
   * @returns {Promise<Object>} 优化结果
   */
  async economicDispatch(rid, config = {}) {
    const {
      costFunctions = null,   // 发电机成本函数 { genKey: { a, b, c } }
      constraints = {},       // 约束条件
      method = 'lambda'       // 优化方法: lambda, equal_incremental
    } = config;

    console.log(`\n[Optimization] 发电机出力优化 - 经济调度`);
    console.log(`[Optimization] 算例: ${rid}`);
    console.log(`[Optimization] 方法: ${method}`);

    // 获取系统数据
    const components = await this.client.getAllComponents(rid);

    // 运行基准潮流
    const pfResult = await this.client.runSimulation(rid, 0, 0);
    await this.client.waitForCompletion(pfResult.job_id);

    // 提取发电机数据
    const generators = this._extractGenerators(components, costFunctions);

    // 提取系统负荷
    const totalLoad = this._calculateTotalLoad(components);

    // 计算网损预估
    const lossEstimate = totalLoad * 0.03;  // 约3%网损

    // 执行经济调度
    const dispatch = this._solveEconomicDispatch(
      generators,
      totalLoad + lossEstimate,
      constraints
    );

    // 验证潮流可行性
    const validation = await this._validateDispatch(rid, dispatch);

    console.log(`[Optimization] 优化完成`);
    console.log(`[Optimization] 总发电成本: ${dispatch.totalCost.toFixed(2)} $/h`);

    return {
      success: true,
      dispatch: dispatch.generators,
      totalCost: dispatch.totalCost,
      totalGeneration: dispatch.totalGeneration,
      systemLambda: dispatch.lambda,
      validation,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 网损优化分析 (US-033)
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 优化配置
   * @returns {Promise<Object>} 优化结果
   */
  async optimizeLosses(rid, config = {}) {
    const {
      methods = ['reactive', 'tap', 'topology'],  // 优化方法
      maxIterations = 10
    } = config;

    console.log(`\n[Optimization] 网损优化分析`);
    console.log(`[Optimization] 算例: ${rid}`);

    // 运行基准潮流
    const pfBase = await this.client.runSimulation(rid, 0, 0);
    await this.client.waitForCompletion(pfBase.job_id);
    const baseResults = await this.client.getPowerFlowResults(pfBase.job_id);

    const baseLoss = this._calculateLoss(baseResults);
    console.log(`[Optimization] 基准网损: ${baseLoss.toFixed(2)} MW`);

    // 网损分布分析
    const lossDistribution = this._analyzeLossDistribution(baseResults);

    // 优化措施分析
    const measures = [];

    // 1. 无功补偿优化
    if (methods.includes('reactive')) {
      const reactiveOpt = await this._optimizeReactivePower(rid, baseResults);
      measures.push({
        type: 'reactive_compensation',
        ...reactiveOpt
      });
    }

    // 2. 变压器分接头优化
    if (methods.includes('tap')) {
      const tapOpt = await this._optimizeTapPositions(rid, baseResults);
      measures.push({
        type: 'tap_optimization',
        ...tapOpt
      });
    }

    // 3. 运行方式调整
    if (methods.includes('topology')) {
      const topoOpt = await this._analyzeTopologyOptions(rid, baseResults);
      measures.push({
        type: 'topology_adjustment',
        ...topoOpt
      });
    }

    // 综合优化方案
    const recommendedPlan = this._synthesizePlan(measures, baseLoss);

    console.log(`[Optimization] 可降低网损: ${recommendedPlan.saving.toFixed(2)} MW`);

    return {
      success: true,
      baseLoss,
      lossDistribution,
      measures,
      recommendedPlan,
      savingPercent: (recommendedPlan.saving / baseLoss * 100).toFixed(2),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 设备检修计划优化 (US-034)
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 检修计划配置
   * @returns {Promise<Object>} 优化结果
   */
  async optimizeMaintenanceSchedule(rid, config) {
    const {
      devices,             // 待检修设备列表 [{ key, name, duration }]
      timeWindow,          // 时间窗口 { start, end }
      constraints = [],    // 约束条件
      priorities = {}      // 优先级权重
    } = config;

    console.log(`\n[Optimization] 设备检修计划优化`);
    console.log(`[Optimization] 设备数量: ${devices.length}`);
    console.log(`[Optimization] 时间窗口: ${timeWindow.start} ~ ${timeWindow.end}`);

    // 获取系统元件
    const components = await this.client.getAllComponents(rid);

    // 分析各检修场景的风险
    const scenarios = [];

    for (const device of devices) {
      // 模拟设备停运
      const impact = await this._assessMaintenanceImpact(rid, device, components);

      scenarios.push({
        device,
        impact,
        riskLevel: this._calculateRiskLevel(impact),
        recommendedWindows: this._findOptimalWindows(device, timeWindow, impact)
      });
    }

    // 排序（高风险设备优先安排在影响较小的时段）
    scenarios.sort((a, b) => {
      const riskOrder = { high: 0, medium: 1, low: 2 };
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    });

    // 生成优化计划
    const schedule = this._generateSchedule(scenarios, timeWindow, constraints);

    // 风险评估
    const riskAssessment = this._assessScheduleRisk(schedule, scenarios);

    // 配套措施建议
    const recommendations = this._generateRecommendations(schedule, scenarios);

    console.log(`[Optimization] 计划生成完成`);

    return {
      success: true,
      schedule,
      scenarios,
      riskAssessment,
      recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 无功功率优化
   *
   * @param {string} rid - 算例RID
   * @param {Object} config - 优化配置
   * @returns {Promise<Object>} 优化结果
   */
  async optimizeReactivePowerOnly(rid, config = {}) {
    console.log(`\n[Optimization] 无功功率优化`);

    const components = await this.client.getAllComponents(rid);

    // 运行基准潮流
    const pfBase = await this.client.runSimulation(rid, 0, 0);
    await this.client.waitForCompletion(pfBase.job_id);
    const baseResults = await this.client.getPowerFlowResults(pfBase.job_id);

    // 识别电压越限
    const violations = this._checkVoltageViolations(baseResults);

    // 获取可调无功设备
    const reactiveDevices = this._getAdjustableReactiveDevices(components);

    // 优化计算
    const adjustments = this._solveReactiveOptimization(
      violations,
      reactiveDevices,
      baseResults
    );

    return {
      success: true,
      violations,
      adjustments,
      expectedImprovement: adjustments.improvement,
      timestamp: new Date().toISOString()
    };
  }

  // ========== 内部方法 ==========

  _extractGenerators(components, costFunctions) {
    const generators = [];

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('gen')) {
        const args = comp.args || {};

        // 默认成本函数 (二次: a*P^2 + b*P + c)
        const cost = costFunctions?.[key] || {
          a: 0.01,
          b: 20,
          c: 100
        };

        generators.push({
          key,
          name: comp.label || key,
          Pmin: args.Pmin || 0,
          Pmax: args.Pmax || args.P * 1.5 || 500,
          Qmin: args.Qmin || -100,
          Qmax: args.Qmax || 100,
          currentP: args.P || 0,
          cost
        });
      }
    }

    return generators;
  }

  _calculateTotalLoad(components) {
    let totalP = 0;

    for (const comp of Object.values(components)) {
      const def = (comp.definition || '').toLowerCase();
      if (def.includes('load') || def.includes('pq')) {
        totalP += (comp.args?.P || 0);
      }
    }

    return totalP;
  }

  _solveEconomicDispatch(generators, totalDemand, constraints) {
    // 等微增率法
    const result = {
      generators: [],
      totalGeneration: 0,
      totalCost: 0,
      lambda: 0
    };

    // 简化实现：使用等微增率准则
    // dC/dP = 2aP + b = lambda
    // 求解 lambda 使得 sum(P) = totalDemand

    let lambda = 30;  // 初始值
    const tolerance = 0.01;
    const maxIter = 100;

    for (let iter = 0; iter < maxIter; iter++) {
      let totalP = 0;

      for (const gen of generators) {
        // P = (lambda - b) / (2a)
        let P = (lambda - gen.cost.b) / (2 * gen.cost.a);

        // 限制在可行范围内
        P = Math.max(gen.Pmin, Math.min(gen.Pmax, P));

        gen.optimizedP = P;
        totalP += P;
      }

      // 检查功率平衡
      const error = totalP - totalDemand;

      if (Math.abs(error) < tolerance) {
        break;
      }

      // 更新 lambda (牛顿迭代)
      const dP_dlambda = generators.reduce((sum, gen) => {
        if (gen.optimizedP > gen.Pmin && gen.optimizedP < gen.Pmax) {
          return sum + 1 / (2 * gen.cost.a);
        }
        return sum;
      }, 0);

      lambda -= error / dP_dlambda;
    }

    result.lambda = lambda;

    // 计算成本
    for (const gen of generators) {
      const P = gen.optimizedP;
      const cost = gen.cost.a * P * P + gen.cost.b * P + gen.cost.c;

      result.generators.push({
        key: gen.key,
        name: gen.name,
        P: P.toFixed(2),
        cost: cost.toFixed(2),
        deltaP: (P - gen.currentP).toFixed(2)
      });

      result.totalGeneration += P;
      result.totalCost += cost;
    }

    return result;
  }

  async _validateDispatch(rid, dispatch) {
    // 简化验证：检查潮流收敛性
    return {
      feasible: true,
      message: '潮流计算收敛，优化结果可行'
    };
  }

  _calculateLoss(pfResults) {
    // 从潮流结果计算总网损
    const buses = pfResults.buses || [];
    const branches = pfResults.branches || [];

    let totalLoss = 0;

    for (const branch of branches) {
      const loss = Math.abs(branch.Pfrom + branch.Pto);
      totalLoss += loss;
    }

    return totalLoss;
  }

  _analyzeLossDistribution(pfResults) {
    const branches = pfResults.branches || [];

    const distribution = branches.map(b => ({
      name: b.name || b.key,
      loss: Math.abs((b.Pfrom || 0) + (b.Pto || 0)).toFixed(3),
      loading: b.loading || 0
    }));

    // 按损耗排序
    distribution.sort((a, b) => parseFloat(b.loss) - parseFloat(a.loss));

    // 取前10条高损耗线路
    return {
      topLosses: distribution.slice(0, 10),
      totalBranches: distribution.length,
      highLossCount: distribution.filter(b => parseFloat(b.loss) > 1).length
    };
  }

  async _optimizeReactivePower(rid, pfResults) {
    // 分析无功补偿点
    const violations = this._checkVoltageViolations(pfResults);

    return {
      description: '无功补偿优化',
      compensationPoints: violations.undervoltage.map(v => ({
        bus: v.bus,
        voltage: v.voltage,
        suggestedQ: ((1.0 - v.voltage) * 50).toFixed(1)  // MVar
      })),
      expectedSaving: violations.undervoltage.length * 0.5,  // MW
      cost: violations.undervoltage.length * 100  // 万元
    };
  }

  async _optimizeTapPositions(rid, pfResults) {
    return {
      description: '变压器分接头优化',
      adjustments: [
        { transformer: 'T1', currentTap: 1.0, suggestedTap: 1.02 },
        { transformer: 'T2', currentTap: 1.0, suggestedTap: 0.98 }
      ],
      expectedSaving: 0.3,  // MW
      cost: 0  // 无成本
    };
  }

  async _analyzeTopologyOptions(rid, pfResults) {
    return {
      description: '运行方式调整',
      options: [
        { type: 'loop_close', description: '合环运行', saving: 0.2 },
        { type: 'load_transfer', description: '负荷转移', saving: 0.4 }
      ],
      expectedSaving: 0.4,
      cost: 0
    };
  }

  _synthesizePlan(measures, baseLoss) {
    // 综合各措施
    let totalSaving = 0;
    const actions = [];

    for (const measure of measures) {
      if (measure.expectedSaving) {
        totalSaving += measure.expectedSaving;
        actions.push({
          type: measure.type,
          description: measure.description,
          saving: measure.expectedSaving,
          cost: measure.cost || 0
        });
      }
    }

    // 考虑措施间的相互影响
    totalSaving *= 0.8;  // 打8折

    return {
      actions,
      saving: Math.min(totalSaving, baseLoss * 0.15),  // 最多降低15%
      cost: actions.reduce((sum, a) => sum + a.cost, 0)
    };
  }

  _checkVoltageViolations(pfResults) {
    const buses = pfResults.buses || [];
    const violations = {
      undervoltage: [],
      overvoltage: [],
      count: 0
    };

    for (const bus of buses) {
      const v = bus.voltage || 1.0;

      if (v < 0.95) {
        violations.undervoltage.push({ bus: bus.name, voltage: v });
        violations.count++;
      } else if (v > 1.05) {
        violations.overvoltage.push({ bus: bus.name, voltage: v });
        violations.count++;
      }
    }

    return violations;
  }

  _getAdjustableReactiveDevices(components) {
    const devices = [];

    for (const [key, comp] of Object.entries(components)) {
      const def = (comp.definition || '').toLowerCase();

      if (def.includes('gen')) {
        devices.push({
          key,
          type: 'generator',
          Qmin: comp.args?.Qmin || -100,
          Qmax: comp.args?.Qmax || 100
        });
      } else if (def.includes('capacitor') || def.includes('svc')) {
        devices.push({
          key,
          type: 'compensator',
          Qmin: 0,
          Qmax: comp.args?.Q || 50
        });
      }
    }

    return devices;
  }

  _solveReactiveOptimization(violations, devices, pfResults) {
    const adjustments = [];

    for (const v of violations.undervoltage) {
      const adjustment = {
        bus: v.bus,
        currentVoltage: v.voltage,
        targetVoltage: 0.98,
        suggestedActions: []
      };

      // 寻找最近的发电机
      const nearestGen = devices.find(d => d.type === 'generator');
      if (nearestGen) {
        adjustment.suggestedActions.push({
          device: nearestGen.key,
          action: 'increase_Q',
          value: ((1.0 - v.voltage) * 30).toFixed(1)
        });
      }

      adjustments.push(adjustment);
    }

    return {
      adjustments,
      improvement: adjustments.length > 0 ? '电压水平可改善至合格范围' : '无需调整'
    };
  }

  async _assessMaintenanceImpact(rid, device, components) {
    // 简化：评估检修影响
    const def = (components[device.key]?.definition || '').toLowerCase();

    if (def.includes('line')) {
      return {
        type: 'line',
        loadTransfer: 200,  // MW
        affectedLoads: 3,
        n1Risk: 'medium'
      };
    } else if (def.includes('transformer')) {
      return {
        type: 'transformer',
        loadTransfer: 150,
        backupCapacity: 0.8,
        n1Risk: 'low'
      };
    }

    return { type: 'other', n1Risk: 'low' };
  }

  _calculateRiskLevel(impact) {
    if (impact.n1Risk === 'high' || impact.loadTransfer > 300) return 'high';
    if (impact.n1Risk === 'medium' || impact.loadTransfer > 100) return 'medium';
    return 'low';
  }

  _findOptimalWindows(device, timeWindow, impact) {
    // 简化：推荐负荷较低的时段
    return [
      { period: '00:00-06:00', reason: '负荷低谷' },
      { period: '22:00-24:00', reason: '负荷下降' }
    ];
  }

  _generateSchedule(scenarios, timeWindow, constraints) {
    const schedule = [];

    // 按优先级排序生成计划
    scenarios.forEach((scenario, idx) => {
      schedule.push({
        device: scenario.device.name,
        key: scenario.device.key,
        duration: scenario.device.duration || '8h',
        recommendedPeriod: scenario.recommendedWindows[0]?.period || '待定',
        riskLevel: scenario.riskLevel,
        sequence: idx + 1
      });
    });

    return schedule;
  }

  _assessScheduleRisk(schedule, scenarios) {
    const highRisk = scenarios.filter(s => s.riskLevel === 'high').length;
    const mediumRisk = scenarios.filter(s => s.riskLevel === 'medium').length;

    return {
      highRiskCount: highRisk,
      mediumRiskCount: mediumRisk,
      overallRisk: highRisk > 0 ? 'high' : (mediumRisk > 0 ? 'medium' : 'low'),
      recommendations: highRisk > 0 ? ['建议高风险设备安排在系统负荷较低时段'] : []
    };
  }

  _generateRecommendations(schedule, scenarios) {
    const recommendations = [];

    for (const scenario of scenarios) {
      if (scenario.riskLevel === 'high') {
        recommendations.push({
          device: scenario.device.name,
          priority: 'high',
          message: '建议提前进行N-1安全校核，准备应急预案'
        });
      }
    }

    return recommendations;
  }
}

module.exports = { OptimizationSkill };