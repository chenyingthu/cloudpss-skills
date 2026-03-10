/**
 * CloudPSS Skills 主入口
 *
 * @module cloudpss-skills
 */

const CloudPSSClient = require('./api/client');

// Skills
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

/**
 * CloudPSS Skills 主类
 */
class CloudPSSSkills {
  constructor(options = {}) {
    this.client = new CloudPSSClient(options);
    this.options = options;

    // 初始化技能
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
  }

  /**
   * 获取客户端
   */
  getClient() {
    return this.client;
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
  TopologyAnalysisSkill
};
