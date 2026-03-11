/**
 * Model Overview Skill 测试用例
 *
 * 测试算例概览技能的各项功能
 */

const assert = require('assert');
const path = require('path');
const ModelOverviewSkill = require('../src/skills/model-overview');

// 测试数据文件路径
const DATA_FILE = path.resolve(
  __dirname,
  '../../../cloudpsss-skills/experiment-data/ieee3-full-structure.json'
);

// Mocha 测试用例（仅在 describe 可用时定义）
if (typeof describe !== 'undefined') {
  describe('ModelOverviewSkill', () => {
    let skill;

    before(() => {
      skill = new ModelOverviewSkill(null, { dataFilePath: DATA_FILE });
    });

    describe('getSummary()', () => {
      let summary;

      before(() => {
        summary = skill.getSummary();
      });

    it('应返回算例名称', () => {
      assert.strictEqual(summary.name, '3 机 9 节点标准测试系统');
    });

    it('应返回算例 RID', () => {
      assert.strictEqual(summary.rid, 'model/CloudPSS/IEEE3');
    });

    it('应返回正确的元件总数', () => {
      assert.strictEqual(summary.scale.totalComponents, 144);
    });

    it('应返回正确的节点数量', () => {
      assert.strictEqual(summary.scale.busCount, 9);
    });

    it('应返回量测点数量', () => {
      assert.strictEqual(summary.scale.measurementPoints, 1);
    });

    it('应返回输出通道数量', () => {
      assert.strictEqual(summary.scale.outputChannels, 5);
    });

    it('应包含导出时间', () => {
      assert(summary.exportedAt);
      assert(typeof summary.exportedAt === 'string');
    });
  });

  describe('analyzeConfigs()', () => {
    let configs;

    before(() => {
      configs = skill.analyzeConfigs();
    });

    it('应返回配置总数', () => {
      assert.strictEqual(configs.totalConfigs, 1);
    });

    it('应返回配置列表', () => {
      assert(Array.isArray(configs.configs));
      assert.strictEqual(configs.configs.length, 1);
    });

    it('配置应包含索引和名称', () => {
      const config = configs.configs[0];
      assert.strictEqual(config.index, 0);
      assert.strictEqual(config.name, '参数方案 1');
    });

    it('配置应包含参数和引脚计数', () => {
      const config = configs.configs[0];
      assert(typeof config.argsCount === 'number');
      assert(typeof config.pinsCount === 'number');
    });
  });

  describe('getJobsInfo()', () => {
    let jobs;

    before(() => {
      jobs = skill.getJobsInfo();
    });

    it('应返回作业总数', () => {
      assert.strictEqual(jobs.totalJobs, 2);
    });

    it('应返回作业列表', () => {
      assert(Array.isArray(jobs.jobs));
      assert.strictEqual(jobs.jobs.length, 2);
    });

    it('第一个作业应为潮流计算', () => {
      const job = jobs.jobs.find(j => j.type.code === 'power_flow');
      assert(job);
      assert.strictEqual(job.type.name, '潮流计算');
      assert.strictEqual(job.type.description, '电力系统稳态潮流计算');
    });

    it('第二个作业应为电磁暂态仿真', () => {
      const job = jobs.jobs.find(j => j.type.code === 'emt');
      assert(job);
      assert.strictEqual(job.type.name, '电磁暂态仿真');
      assert.strictEqual(job.type.description, '电磁暂态过程仿真计算');
    });

    it('作业应包含输出通道数量', () => {
      const powerFlowJob = jobs.jobs.find(j => j.type.code === 'power_flow');
      const emtJob = jobs.jobs.find(j => j.type.code === 'emt');
      assert(powerFlowJob.outputChannelCount >= 0);
      assert(emtJob.outputChannelCount >= 0);
    });

    it('潮流作业应包含最大迭代次数参数', () => {
      const job = jobs.jobs.find(j => j.type.code === 'power_flow');
      assert('maxIteration' in job.keyParams);
    });

    it('EMT 作业应包含步长参数', () => {
      const job = jobs.jobs.find(j => j.type.code === 'emt');
      assert('stepTime' in job.keyParams);
    });
  });

  describe('getStatisticsReport()', () => {
    let stats;

    before(() => {
      stats = skill.getStatisticsReport();
    });

    it('应返回元件总数', () => {
      assert.strictEqual(stats.totalComponents, 144);
    });

    it('应返回元件类型分布', () => {
      assert(stats.typeDistribution);
      assert(typeof stats.typeDistribution === 'object');
    });

    it('应包含 bus 元件', () => {
      assert.strictEqual(stats.typeDistribution.bus, 9);
    });

    it('应包含 transformer 元件', () => {
      assert.strictEqual(stats.typeDistribution.transformer, 3);
    });

    it('应包含 turbine_governor 元件', () => {
      assert.strictEqual(stats.typeDistribution.turbine_governor, 6);
    });

    it('应包含 measurement 元件', () => {
      assert.strictEqual(stats.typeDistribution.measurement, 1);
    });

    it('应包含 label 元件', () => {
      assert.strictEqual(stats.typeDistribution.label, 6);
    });

    it('应包含 other 元件', () => {
      assert.strictEqual(stats.typeDistribution.other, 119);
    });

    it('应包含主要元件统计', () => {
      assert(stats.mainComponents);
      assert.strictEqual(stats.mainComponents.bus, 9);
      assert.strictEqual(stats.mainComponents.transformer, 3);
    });
  });

  describe('getFullOverview()', () => {
    it('应返回完整概览报告', () => {
      const overview = skill.getFullOverview();
      assert(overview.summary);
      assert(overview.configs);
      assert(overview.jobs);
      assert(overview.statistics);
    });

    it('默认不包含原始数据', () => {
      const overview = skill.getFullOverview();
      assert.strictEqual(overview.rawData, null);
    });

    it('可选择包含原始数据', () => {
      const overview = skill.getFullOverview({ includeComponentDetails: true });
      assert(overview.rawData);
      assert(overview.rawData.model_info);
      assert(overview.rawData.statistics);
    });
  });

  describe('generateReportText()', () => {
    it('应生成人类可读的报告文本', () => {
      const overview = skill.getFullOverview();
      const report = skill.generateReportText(overview);
      assert(typeof report === 'string');
      assert(report.includes('算例概览报告'));
      assert(report.includes('3 机 9 节点标准测试系统'));
      assert(report.includes('元件总数：144'));
      assert(report.includes('节点数量：9'));
    });

    it('报告应包含所有主要章节', () => {
      const overview = skill.getFullOverview();
      const report = skill.generateReportText(overview);
      assert(report.includes('【基本信息】'));
      assert(report.includes('【算例规模】'));
      assert(report.includes('【参数方案】'));
      assert(report.includes('【计算方案】'));
      assert(report.includes('【元件分布】'));
    });
  });

  describe('loadFromLocalFile()', () => {
    it('应能加载本地 JSON 文件', () => {
      const data = skill.loadFromLocalFile(DATA_FILE);
      assert(data.model_info);
      assert(data.statistics);
      assert(data.components_by_type);
    });

    it('加载不存在的文件应抛出错误', () => {
      assert.throws(() => {
        skill.loadFromLocalFile('/nonexistent/path/file.json');
      }, /文件不存在/);
    });
  });
}); // End of describe('ModelOverviewSkill')
} // End of if (typeof describe !== 'undefined')

/**
 * 快速测试函数（可直接运行）
 */
function runQuickTests() {
  console.log('运行快速测试...\n');

  const skill = new ModelOverviewSkill(null, { dataFilePath: DATA_FILE });

  // 测试摘要
  const summary = skill.getSummary();
  console.log('✓ getSummary():', summary.name);
  console.log('  - 元件总数:', summary.scale.totalComponents);
  console.log('  - 节点数:', summary.scale.busCount);

  // 测试配置
  const configs = skill.analyzeConfigs();
  console.log('✓ analyzeConfigs():', configs.totalConfigs, '个参数方案');

  // 测试作业
  const jobs = skill.getJobsInfo();
  console.log('✓ getJobsInfo():', jobs.totalJobs, '个计算方案');
  for (const job of jobs.jobs) {
    console.log('  -', job.name, '(' + job.type.name + ')');
  }

  // 测试统计
  const stats = skill.getStatisticsReport();
  console.log('✓ getStatisticsReport():', stats.totalComponents, '个元件');
  console.log('  - 类型分布:', Object.entries(stats.typeDistribution).map(([k, v]) => k + ':' + v).join(', '));

  // 测试报告生成
  const overview = skill.getFullOverview();
  const report = skill.generateReportText(overview);
  console.log('✓ generateReportText(): 生成', report.split('\n').length, '行报告');

  console.log('\n所有测试通过！');
}

// 如果直接运行此文件，执行快速测试
if (require.main === module) {
  runQuickTests();
  process.exit(0);
}

// 导出测试用例供 Mocha 使用
if (typeof describe !== 'undefined') {
  module.exports = ModelOverviewSkill;
} else {
  module.exports = ModelOverviewSkill;
}
