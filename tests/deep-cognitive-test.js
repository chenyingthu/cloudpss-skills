#!/usr/bin/env node
/**
 * 深度认知技能验证测试
 *
 * 模拟研究人员研究电力系统的过程：
 * 研究人员拿到一个 IEEE 39 节点标准测试系统，通过提问逐步了解系统
 *
 * 测试目标：
 * 1. 验证现有 skills 能回答哪些问题
 * 2. 发现 skills 的不足
 * 3. 制定 skills 补充计划
 */

const path = require('path');
const fs = require('fs');
const CloudPSSClient = require('../src/api/client');
const ModelOverviewSkill = require('../src/skills/model-overview');
const ComponentAnalysisSkill = require('../src/skills/analyze-component');
const TopologyAnalysisSkill = require('../src/skills/topology-analysis');
const ManageSkill = require('../src/skills/manage');

// 加载 CloudPSS Token
const tokenPath = path.join(__dirname, '../../.cloudpss_token');
if (fs.existsSync(tokenPath)) {
  const token = fs.readFileSync(tokenPath, 'utf-8').trim();
  process.env.CLOUDPSS_TOKEN = token;
}

// 研究问题清单（模拟研究人员视角）
const RESEARCH_QUESTIONS = [
  // ========== 第一阶段：系统概况 ==========
  {
    phase: '系统概况',
    questions: [
      {
        id: 'Q1.1',
        question: '这个系统叫什么名字？有描述吗？',
        skill: 'model-overview',
        method: 'getSummary'
      },
      {
        id: 'Q1.2',
        question: '系统有多少个节点？多少条线路？多少台发电机？',
        skill: 'component-analysis',
        method: 'classifyComponents'
      },
      {
        id: 'Q1.3',
        question: '系统有多少台变压器？分别是什么类型？',
        skill: 'component-analysis',
        method: 'classifyComponents'
      },
      {
        id: 'Q1.4',
        question: '系统中有哪些类型的元件？各有多少？',
        skill: 'component-analysis',
        method: 'classifyComponents'
      }
    ]
  },
  // ========== 第二阶段：发电机分析 ==========
  {
    phase: '发电机分析',
    questions: [
      {
        id: 'Q2.1',
        question: '所有发电机的名称/标签是什么？',
        skill: 'component-analysis',
        method: 'getComponentsByType'
      },
      {
        id: 'Q2.2',
        question: '哪台发电机容量最大？容量是多少？',
        skill: 'component-analysis',
        method: 'getComponentParameters'
      },
      {
        id: 'Q2.3',
        question: '每台发电机连接到哪个节点？',
        skill: 'topology-analysis',
        method: 'getGeneratorConnections'
      },
      {
        id: 'Q2.4',
        question: '发电机有没有配置励磁系统和PSS？',
        skill: 'component-analysis',
        method: 'getAssociatedComponents'
      }
    ]
  },
  // ========== 第三阶段：网络拓扑 ==========
  {
    phase: '网络拓扑',
    questions: [
      {
        id: 'Q3.1',
        question: '系统的电压等级有哪些？',
        skill: 'topology-analysis',
        method: 'getVoltageLevels'
      },
      {
        id: 'Q3.2',
        question: '哪些节点之间有线路连接？',
        skill: 'topology-analysis',
        method: 'getLineConnections'
      },
      {
        id: 'Q3.3',
        question: '每条线路的长度/阻抗是多少？',
        skill: 'component-analysis',
        method: 'getLineParameters'
      },
      {
        id: 'Q3.4',
        question: '变压器连接哪些节点？变比是多少？',
        skill: 'component-analysis',
        method: 'getTransformerParameters'
      },
      {
        id: 'Q3.5',
        question: '系统的拓扑结构是怎样的？（辐射状/环状）',
        skill: 'topology-analysis',
        method: 'analyzeTopologyStructure'
      }
    ]
  },
  // ========== 第四阶段：负荷分析 ==========
  {
    phase: '负荷分析',
    questions: [
      {
        id: 'Q4.1',
        question: '系统有多少个负荷？分别在哪些节点？',
        skill: 'component-analysis',
        method: 'getLoadLocations'
      },
      {
        id: 'Q4.2',
        question: '哪个节点的负荷最大？是多少？',
        skill: 'component-analysis',
        method: 'getLoadParameters'
      },
      {
        id: 'Q4.3',
        question: '系统的总负荷是多少？',
        skill: 'component-analysis',
        method: 'getTotalLoad'
      }
    ]
  },
  // ========== 第五阶段：计算配置 ==========
  {
    phase: '计算配置',
    questions: [
      {
        id: 'Q5.1',
        question: '系统支持哪些类型的仿真计算？',
        skill: 'model-overview',
        method: 'getJobsInfo'
      },
      {
        id: 'Q5.2',
        question: '有多少个参数方案？分别是什么？',
        skill: 'model-overview',
        method: 'analyzeConfigs'
      },
      {
        id: 'Q5.3',
        question: '潮流计算的收敛容差是多少？',
        skill: 'model-overview',
        method: 'getJobParameters'
      }
    ]
  }
];

class DeepCognitiveTest {
  constructor(client, modelRid) {
    this.client = client;
    this.modelRid = modelRid;
    this.tempFile = `/tmp/${modelRid.replace(/\//g, '_')}.yaml.gz`;
    this.results = {
      answered: [],
      unanswerable: [],
      errors: []
    };
    this.modelData = null;
  }

  async setup() {
    console.log('📥 导出算例文件...');
    await this.client.dumpModel(this.modelRid, this.tempFile);
    console.log(`   ✅ 已导出到: ${this.tempFile}\n`);

    // 加载数据
    const overviewSkill = new ModelOverviewSkill(this.client);
    this.modelData = overviewSkill.loadFromLocalFile(this.tempFile);
  }

  async runTest() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║          深度认知技能验证测试 - IEEE 39 节点系统              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    for (const phase of RESEARCH_QUESTIONS) {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`📂 ${phase.phase}`);
      console.log(`${'═'.repeat(70)}`);

      for (const q of phase.questions) {
        await this.testQuestion(q);
      }
    }

    this.printSummary();
  }

  async testQuestion(q) {
    console.log(`\n❓ [${q.id}] ${q.question}`);
    console.log(`   预期技能: ${q.skill}.${q.method}`);

    try {
      const result = await this.tryAnswer(q);

      if (result.answered) {
        console.log(`   ✅ 可回答`);
        console.log(`   📝 答案: ${result.answer}`);
        this.results.answered.push({ ...q, result });
      } else {
        console.log(`   ⚠️ 无法完整回答: ${result.reason}`);
        this.results.unanswerable.push({ ...q, result });
      }
    } catch (error) {
      console.log(`   ❌ 错误: ${error.message}`);
      this.results.errors.push({ ...q, error: error.message });
    }
  }

  async tryAnswer(q) {
    // 根据问题尝试用现有 skills 回答
    switch (q.id) {
      case 'Q1.1':
        return this.answerBasicInfo();
      case 'Q1.2':
        return this.answerComponentCounts();
      case 'Q1.3':
        return this.answerTransformerInfo();
      case 'Q1.4':
        return this.answerAllComponentTypes();
      case 'Q2.1':
        return this.answerGeneratorNames();
      case 'Q2.2':
        return this.answerGeneratorCapacity();
      case 'Q2.3':
        return this.answerGeneratorConnections();
      case 'Q2.4':
        return this.answerExciterPSS();
      case 'Q3.1':
        return this.answerVoltageLevels();
      case 'Q3.2':
        return this.answerLineConnections();
      case 'Q3.3':
        return this.answerLineParameters();
      case 'Q3.4':
        return this.answerTransformerParameters();
      case 'Q3.5':
        return this.answerTopologyStructure();
      case 'Q4.1':
        return this.answerLoadLocations();
      case 'Q4.2':
        return this.answerMaxLoad();
      case 'Q4.3':
        return this.answerTotalLoad();
      case 'Q5.1':
        return this.answerSimulationTypes();
      case 'Q5.2':
        return this.answerConfigSchemes();
      case 'Q5.3':
        return this.answerConvergenceTolerance();
      default:
        return { answered: false, reason: '未实现的问题处理' };
    }
  }

  // ========== 具体回答方法 ==========

  answerBasicInfo() {
    const overviewSkill = new ModelOverviewSkill(this.client);
    const summary = overviewSkill.getSummary(this.modelData);

    if (summary.name || summary.description) {
      return {
        answered: true,
        answer: `名称: ${summary.name || '未知'}, 描述: ${(summary.description || '无').substring(0, 50)}...`
      };
    }
    return { answered: false, reason: 'model-overview.getSummary 未返回基本信息' };
  }

  answerComponentCounts() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const classified = componentSkill.classifyComponents(this.modelData.all_components || []);

    const buses = classified.bus?.length || 0;
    const lines = classified.line?.length || 0;
    const generators = classified.generator?.length || 0;

    if (buses > 0 || lines > 0 || generators > 0) {
      return {
        answered: true,
        answer: `节点: ${buses} 个, 线路: ${lines} 条, 发电机: ${generators} 台`
      };
    }
    return { answered: false, reason: '元件分类结果为空' };
  }

  answerTransformerInfo() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const classified = componentSkill.classifyComponents(this.modelData.all_components || []);

    const transformers = classified.transformer || [];
    if (transformers.length > 0) {
      return {
        answered: true,
        answer: `共 ${transformers.length} 台变压器`
      };
    }
    return { answered: false, reason: '未找到变压器信息' };
  }

  answerAllComponentTypes() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const classified = componentSkill.classifyComponents(this.modelData.all_components || []);

    const types = Object.entries(classified)
      .filter(([_, comps]) => comps && comps.length > 0)
      .sort((a, b) => b[1].length - a[1].length);

    if (types.length > 0) {
      const summary = types.map(([type, comps]) => `${type}: ${comps.length}`).join(', ');
      return { answered: true, answer: summary };
    }
    return { answered: false, reason: '元件分类失败' };
  }

  answerGeneratorNames() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const classified = componentSkill.classifyComponents(this.modelData.all_components || []);

    const generators = classified.generator || [];
    if (generators.length > 0) {
      const names = generators.map(g => g.label || g.id || '未命名').slice(0, 5);
      return {
        answered: true,
        answer: `共 ${generators.length} 台发电机，前5台: ${names.join(', ')}`
      };
    }
    return { answered: false, reason: '未找到发电机' };
  }

  answerGeneratorCapacity() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const ranking = componentSkill.getGeneratorCapacityRanking(this.modelData);

    if (ranking.found && ranking.maxCapacity) {
      return {
        answered: true,
        answer: `最大容量发电机: ${ranking.maxCapacity.label}, 容量: ${ranking.maxCapacity.capacity} MVA`
      };
    }
    return {
      answered: false,
      reason: '缺少获取发电机容量参数的方法 (component-analysis.getComponentParameters)'
    };
  }

  answerGeneratorConnections() {
    const topologySkill = new TopologyAnalysisSkill(this.client);
    const connections = topologySkill.getGeneratorConnections(this.modelData);

    if (connections.found && connections.generators.length > 0) {
      const sample = connections.generators[0];
      const connInfo = sample.connections && sample.connections[0] ?
        `连接到节点 ${sample.connections[0].nodeId}` : '';
      return {
        answered: true,
        answer: `共${connections.count}台发电机。示例: ${sample.label} ${connInfo}`
      };
    }
    return {
      answered: false,
      reason: '未找到发电机连接信息'
    };
  }

  answerExciterPSS() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const classified = componentSkill.classifyComponents(this.modelData.all_components || []);

    const exciters = classified.exciter || [];
    const pss = classified.pss || [];

    return {
      answered: exciters.length > 0 || pss.length > 0,
      answer: `励磁系统: ${exciters.length} 个, PSS: ${pss.length} 个`
    };
  }

  answerVoltageLevels() {
    const topologySkill = new TopologyAnalysisSkill(this.client);
    const voltageLevels = topologySkill.getVoltageLevels(this.modelData);

    if (voltageLevels.found && voltageLevels.voltageLevels.length > 0) {
      return {
        answered: true,
        answer: `电压等级: ${voltageLevels.summary}`
      };
    }
    return {
      answered: false,
      reason: '未找到电压等级信息'
    };
  }

  answerLineConnections() {
    const topologySkill = new TopologyAnalysisSkill(this.client);
    const lineConns = topologySkill.getLineConnections(this.modelData);

    if (lineConns.found && lineConns.lines.length > 0) {
      const sample = lineConns.lines[0];
      return {
        answered: true,
        answer: `共${lineConns.count}条线路。示例: ${sample.label} 连接节点 ${sample.fromNode} -> ${sample.toNode}`
      };
    }
    return {
      answered: false,
      reason: '未找到线路连接信息'
    };
  }

  answerLineParameters() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const lineParams = componentSkill.getLineParameters(this.modelData);

    if (lineParams.found && lineParams.components.length > 0) {
      const sample = lineParams.components[0];
      const p = sample.parameters;
      return {
        answered: true,
        answer: `线路示例: ${sample.label}, R=${p.resistance || 'N/A'}, X=${p.reactance || 'N/A'}, 长度=${p.length || 'N/A'}`
      };
    }
    return {
      answered: false,
      reason: '缺少获取线路详细参数的方法 (component-analysis.getLineParameters)'
    };
  }

  answerTransformerParameters() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const classified = componentSkill.classifyComponents(this.modelData.all_components || []);

    const transformers = classified.transformer || [];
    if (transformers.length > 0) {
      const sample = transformers[0];
      const args = sample.args || {};
      return {
        answered: true,
        answer: `变压器参数示例: ${sample.label || sample.id}, 变比相关信息: ${args.k || args.ratio || '需要进一步解析'}`
      };
    }
    return { answered: false, reason: '未找到变压器' };
  }

  answerTopologyStructure() {
    const topologySkill = new TopologyAnalysisSkill(this.client);
    const topology = topologySkill.analyzeTopologyStructure(this.modelData);

    if (topology.found) {
      return {
        answered: true,
        answer: `${topology.topologyType}。${topology.description}`
      };
    }
    return {
      answered: false,
      reason: '无法分析拓扑结构'
    };
  }

  answerLoadLocations() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const classified = componentSkill.classifyComponents(this.modelData.all_components || []);

    const loads = classified.load || [];
    if (loads.length > 0) {
      const locations = loads.slice(0, 5).map(l => l.label || l.id);
      return {
        answered: true,
        answer: `共 ${loads.length} 个负荷，部分位置: ${locations.join(', ')}`
      };
    }
    return { answered: false, reason: '未找到负荷' };
  }

  answerMaxLoad() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const totalLoad = componentSkill.getTotalLoad(this.modelData);

    if (totalLoad.found && totalLoad.maxLoad) {
      return {
        answered: true,
        answer: `最大负荷: ${totalLoad.maxLoad.label}, P=${totalLoad.maxLoad.P} MW`
      };
    }
    return {
      answered: false,
      reason: '缺少获取负荷详细参数的方法 (component-analysis.getLoadParameters)'
    };
  }

  answerTotalLoad() {
    const componentSkill = new ComponentAnalysisSkill(this.client);
    const totalLoad = componentSkill.getTotalLoad(this.modelData);

    if (totalLoad.found) {
      return {
        answered: true,
        answer: `总负荷: P=${totalLoad.totalP} MW, Q=${totalLoad.totalQ} MVar`
      };
    }
    return { answered: false, reason: '无法计算总负荷' };
  }

  answerSimulationTypes() {
    const overviewSkill = new ModelOverviewSkill(this.client);
    const jobsInfo = overviewSkill.getJobsInfo(this.modelData);

    if (jobsInfo.totalJobs > 0) {
      const types = jobsInfo.jobs.map(j => `${j.name}(${j.type?.name || '未知'})`);
      return {
        answered: true,
        answer: `支持 ${jobsInfo.totalJobs} 种计算: ${types.join(', ')}`
      };
    }
    return { answered: false, reason: '未找到计算方案' };
  }

  answerConfigSchemes() {
    const overviewSkill = new ModelOverviewSkill(this.client);
    const configsInfo = overviewSkill.analyzeConfigs(this.modelData);

    if (configsInfo.totalConfigs > 0) {
      const names = configsInfo.configs.map(c => c.name);
      return {
        answered: true,
        answer: `共 ${configsInfo.totalConfigs} 个参数方案: ${names.join(', ')}`
      };
    }
    return { answered: false, reason: '未找到参数方案' };
  }

  answerConvergenceTolerance() {
    const topologySkill = new TopologyAnalysisSkill(this.client);
    const jobParams = topologySkill.getJobParameters(this.modelData, 0);

    if (jobParams.found && jobParams.parameters) {
      const params = jobParams.parameters;
      if (params.type === 'powerFlow' || params.type === '潮流计算') {
        return {
          answered: true,
          answer: `计算方案: ${params.name}, 收敛容差: ${params.convergenceTolerance}, 最大迭代: ${params.maxIterations}`
        };
      }
      return {
        answered: true,
        answer: `计算方案: ${params.name}, 类型: ${params.type}`
      };
    }
    return {
      answered: false,
      reason: '缺少获取计算方案详细参数的方法 (model-overview.getJobParameters)'
    };
  }

  printSummary() {
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      测试结果汇总                              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    console.log(`\n📊 统计:`);
    console.log(`   ✅ 可回答: ${this.results.answered.length} 个问题`);
    console.log(`   ⚠️ 无法回答: ${this.results.unanswerable.length} 个问题`);
    console.log(`   ❌ 错误: ${this.results.errors.length} 个问题`);

    console.log(`\n📋 无法回答的问题 (需要补充的技能):`);
    const missingSkills = new Map();

    for (const item of this.results.unanswerable) {
      const key = `${item.skill}.${item.method}`;
      if (!missingSkills.has(key)) {
        missingSkills.set(key, []);
      }
      missingSkills.get(key).push(item.id);
    }

    for (const [skill, questions] of missingSkills) {
      console.log(`   - ${skill}: 需要回答问题 ${questions.join(', ')}`);
    }

    console.log(`\n🔧 Skills 补充计划:`);
    console.log(`   1. component-analysis.getComponentParameters - 获取元件详细参数`);
    console.log(`   2. topology-analysis.getGeneratorConnections - 获取发电机连接关系`);
    console.log(`   3. topology-analysis.getVoltageLevels - 获取系统电压等级`);
    console.log(`   4. topology-analysis.getLineConnections - 获取线路连接关系`);
    console.log(`   5. topology-analysis.analyzeTopologyStructure - 分析拓扑结构`);
    console.log(`   6. model-overview.getJobParameters - 获取计算方案详细参数`);
  }

  cleanup() {
    if (fs.existsSync(this.tempFile)) {
      fs.unlinkSync(this.tempFile);
    }
  }
}

async function main() {
  const client = new CloudPSSClient();

  // 使用 IEEE 39 节点系统进行测试
  const test = new DeepCognitiveTest(client, 'model/holdme/IEEE39');

  try {
    await test.setup();
    await test.runTest();
  } finally {
    test.cleanup();
  }
}

main().catch(console.error);