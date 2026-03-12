/**
 * CloudPSS Skills 主入口
 *
 * @module cloudpss-skills
 */

const CloudPSSClient = require('./api/client');

// Skills - Original
const CreateSkill = require('./skills/create');
const ManageSkill = require('./skills/manage');
const ExtractSkill = require('./skills/extract');
const ConfigureSkill = require('./skills/configure');
const AnalyzeSkill = require('./skills/analyze');
const ReportSkill = require('./skills/report');
const N1ContingencySkill = require('./skills/analyze-n1');
const HarmonicAnalysisSkill = require('./skills/analyze-harmonic');
const BatchSimulationSkill = require('./skills/batch-simulation');
const ModelOverviewSkill = require('./skills/model-overview');
const ComponentAnalysisSkill = require('./skills/analyze-component');
const TopologyAnalysisSkill = require('./skills/topology-analysis');

// Skills - Enhanced
const PowerFlowAnalysisSkill = require('./skills/power-flow-analysis');
const N1ContingencyAnalysisSkill = require('./skills/n1-contingency-analysis');
const BatchSimulationEnhancedSkill = require('./skills/batch-simulation-enhanced');
const ModelManagementEnhancedSkill = require('./skills/model-management-enhanced');

// Skills - New (US-004, US-005, US-008, etc.)
const ModelEditorSkill = require('./skills/model-editor');

// Skills - New (US-014, US-015, US-017, US-025, US-026)
const AdvancedAnalysisSkill = require('./skills/advanced-analysis');

// Skills - New (US-020)
const VisualizationSkill = require('./skills/visualization');

// Skills - New (US-028, US-035)
const StabilityAnalysisSkill = require('./skills/stability-analysis');

// Skills - New (US-044, US-046, US-047, US-048)
const OperationSupportSkill = require('./skills/operation-support');

// Skills - New (US-007, US-009)
const { ModelCreationSkill } = require('./skills/model-creation');

// Skills - New (US-027)
const { ShortCircuitSkill } = require('./skills/short-circuit');

// Skills - New (US-031, US-033, US-034)
const { OptimizationSkill } = require('./skills/optimization');

// Skills - New (US-036, US-040, US-041, US-056)
const { AdvancedReportingSkill } = require('./skills/advanced-reporting');

// Skills - New (Hybrid API Mode)
const HybridAPIManager = require('./api/hybrid-manager');
const ModelValidationSkill = require('./skills/model-validation');
const LocalModelManagerSkill = require('./skills/local-model-manager');

// Utils
const { LocalLoader, localLoader } = require('./utils/local-loader');

/**
 * CloudPSS Skills 主类
 */
class CloudPSSSkills {
  constructor(options = {}) {
    this.client = new CloudPSSClient(options);
    this.options = options;

    // 初始化 HybridAPIManager（混合模式）
    this.hybridManager = new HybridAPIManager(this.client, options);

    // 初始化技能 - Original
    this.create = new CreateSkill(this.client);
    this.manage = new ManageSkill(this.client);
    this.extract = new ExtractSkill(this.client);
    this.configure = new ConfigureSkill(this.client);
    this.analyze = new AnalyzeSkill(this.client);
    this.report = new ReportSkill(this.client);
    this.n1scan = new N1ContingencySkill(this.client);
    this.harmonic = new HarmonicAnalysisSkill(this.client);
    this.batch = new BatchSimulationSkill(this.client);
    this.modelOverview = new ModelOverviewSkill(this.client);
    this.component = new ComponentAnalysisSkill(this.client);
    this.topologyAnalysis = new TopologyAnalysisSkill(this.client);

    // 初始化技能 - Enhanced
    this.powerFlow = new PowerFlowAnalysisSkill(this.client);
    this.n1Analysis = new N1ContingencyAnalysisSkill(this.client);
    this.batchEnhanced = new BatchSimulationEnhancedSkill(this.client);
    this.modelManagement = new ModelManagementEnhancedSkill(this.client);

    // 初始化技能 - New
    this.modelEditor = new ModelEditorSkill(this.client);
    this.advancedAnalysis = new AdvancedAnalysisSkill(this.client);
    this.visualization = new VisualizationSkill(this.client);
    this.stabilityAnalysis = new StabilityAnalysisSkill(this.client);
    this.operationSupport = new OperationSupportSkill(this.client);

    // 初始化技能 - New (Round 2)
    this.modelCreation = new ModelCreationSkill(this.client);
    this.shortCircuit = new ShortCircuitSkill(this.client);
    this.optimization = new OptimizationSkill(this.client);
    this.advancedReporting = new AdvancedReportingSkill(this.client);

    // 初始化技能 - Hybrid API Mode
    this.modelValidation = new ModelValidationSkill(this.client, options);
    this.localModelManager = new LocalModelManagerSkill(this.client, options);
  }

  /**
   * 获取客户端
   */
  getClient() {
    return this.client;
  }

  /**
   * 获取/设置 API 模式
   *
   * @param {string} [mode] - 模式 ('local' | 'api' | 'auto')，不传则返回当前模式
   * @returns {string|void} 当前模式（当不传参数时）
   */
  mode(mode) {
    if (mode === undefined) {
      return this.hybridManager.getMode();
    }
    this.hybridManager.setMode(mode);
  }

  /**
   * 设置 API 模式
   *
   * @param {string} mode - 模式 ('local' | 'api' | 'auto')
   */
  setMode(mode) {
    this.hybridManager.setMode(mode);
  }

  /**
   * 获取当前 API 模式
   *
   * @returns {string} 当前模式
   */
  getMode() {
    return this.hybridManager.getMode();
  }

  /**
   * 获取混合模式状态
   *
   * @returns {Object} 状态信息
   */
  getHybridStatus() {
    return this.hybridManager.getStatus();
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      await this.client.listProjects();
      return { success: true, message: 'CloudPSS API 连接成功' };
    } catch (error) {
      return {
        success: false,
        message: `CloudPSS API 连接失败：${error.message}`
      };
    }
  }
}

module.exports = {
  CloudPSSSkills,
  CloudPSSClient,
  // Hybrid API Mode
  HybridAPIManager,
  ModelValidationSkill,
  LocalModelManagerSkill,
  LocalLoader,
  localLoader,
  // Original Skills
  CreateSkill,
  ManageSkill,
  ExtractSkill,
  ConfigureSkill,
  AnalyzeSkill,
  ReportSkill,
  N1ContingencySkill,
  HarmonicAnalysisSkill,
  BatchSimulationSkill,
  ModelOverviewSkill,
  ComponentAnalysisSkill,
  TopologyAnalysisSkill,
  // Enhanced Skills
  PowerFlowAnalysisSkill,
  N1ContingencyAnalysisSkill,
  BatchSimulationEnhancedSkill,
  ModelManagementEnhancedSkill,
  // New Skills
  ModelEditorSkill,
  AdvancedAnalysisSkill,
  VisualizationSkill,
  StabilityAnalysisSkill,
  OperationSupportSkill,
  // New Skills (Round 2)
  ModelCreationSkill,
  ShortCircuitSkill,
  OptimizationSkill,
  AdvancedReportingSkill
};