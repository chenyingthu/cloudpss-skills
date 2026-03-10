/**
 * 官方 Model.dump() 格式兼容性测试
 *
 * 测试目标：验证认知技能在 CloudPSS 官方 Model.dump() 导出格式上的兼容性
 */

const ModelOverviewSkill = require('../src/skills/model-overview');
const ComponentAnalysisSkill = require('../src/skills/analyze-component');
const fs = require('fs');
const path = require('path');

// 测试文件路径
const DUMP_FILE = '/tmp/ieee3-export.json';
const CUSTOM_FILE = './experiment-data/ieee3-full-structure.json';

function runTests() {
  const errors = [];

  // 检查测试文件是否存在
  if (!fs.existsSync(DUMP_FILE)) {
    throw new Error(`测试文件不存在：${DUMP_FILE}\n请先运行：python python/cloudpss_wrapper.py dump_model model/CloudPSS/IEEE3 ${DUMP_FILE}`);
  }

  console.log('官方 Model.dump() 格式兼容性测试');
  console.log('='.repeat(50));

  // ModelOverviewSkill 测试
  console.log('\\n[ModelOverviewSkill 测试]');

  const overview = new ModelOverviewSkill(null);

  try {
    const data = overview.loadFromLocalFile(DUMP_FILE);
    console.log('✓ 加载官方 dump 格式文件');

    if (!data.model_info || !data.all_components) {
      errors.push('loadFromLocalFile 未正确转换官方格式');
    }
    if (data.model_info.rid !== 'model/CloudPSS/IEEE3') {
      errors.push(`RID 错误：${data.model_info.rid}`);
    }
  } catch (e) {
    errors.push(`loadFromLocalFile 失败：${e.message}`);
  }

  try {
    const summary = overview.getSummary();
    console.log('✓ getSummary() 返回正确的摘要信息');

    if (!summary.scale || summary.scale.busCount <= 0) {
      errors.push('getSummary 返回的规模信息错误');
    }
  } catch (e) {
    errors.push(`getSummary 失败：${e.message}`);
  }

  try {
    const configs = overview.analyzeConfigs();
    console.log('✓ analyzeConfigs() 返回正确的配置信息');

    if (configs.totalConfigs < 1) {
      errors.push('配置数量错误');
    }
  } catch (e) {
    errors.push(`analyzeConfigs 失败：${e.message}`);
  }

  try {
    const jobs = overview.getJobsInfo();
    console.log('✓ getJobsInfo() 返回正确的计算方案信息');

    const jobTypes = jobs.jobs.map(j => j.type.code);
    if (!jobTypes.includes('power_flow')) {
      errors.push('未识别到潮流计算作业');
    }
  } catch (e) {
    errors.push(`getJobsInfo 失败：${e.message}`);
  }

  try {
    const stats = overview.getStatisticsReport();
    console.log('✓ getStatisticsReport() 返回元件统计');

    if (stats.totalComponents <= 0) {
      errors.push('元件总数错误');
    }
  } catch (e) {
    errors.push(`getStatisticsReport 失败：${e.message}`);
  }

  // ComponentAnalysisSkill 测试
  console.log('\\n[ComponentAnalysisSkill 测试]');

  const componentAnalysis = new ComponentAnalysisSkill(null);

  try {
    const data = componentAnalysis.loadFromLocalFile(DUMP_FILE);
    console.log('✓ 加载官方 dump 格式文件');

    if (!data.all_components || data.all_components.length <= 0) {
      errors.push('元件数据为空');
    }
  } catch (e) {
    errors.push(`loadFromLocalFile 失败：${e.message}`);
  }

  try {
    const data = componentAnalysis.loadFromLocalFile(DUMP_FILE);
    const classified = componentAnalysis.classifyComponents(data.all_components);
    console.log('✓ classifyComponents() 正确分类元件');

    if (!classified.generator || classified.generator.length !== 3) {
      errors.push(`发电机数量错误：期望 3，实际 ${classified.generator?.length || 0}`);
    }
    if (!classified.bus || classified.bus.length !== 9) {
      errors.push(`母线数量错误：期望 9，实际 ${classified.bus?.length || 0}`);
    }
    if (!classified.line || classified.line.length !== 6) {
      errors.push(`线路数量错误：期望 6，实际 ${classified.line?.length || 0}`);
    }
  } catch (e) {
    errors.push(`classifyComponents 失败：${e.message}`);
  }

  // 元件类型识别测试
  console.log('✓ 元件类型识别测试');
  const testCases = [
    { definition: 'model/CloudPSS/SyncGeneratorRouter', expected: 'generator' },
    { definition: 'model/CloudPSS/TransmissionLine', expected: 'line' },
    { definition: 'model/CloudPSS/_newBus_3p', expected: 'bus' },
    { definition: 'model/CloudPSS/_newTransformer_3p2w', expected: 'transformer' },
    { definition: 'model/CloudPSS/ElectricalLable', expected: 'label' },
    { definition: 'model/CloudPSS/GND', expected: 'ground' },
    { definition: null, expected: 'unknown' }
  ];

  for (const tc of testCases) {
    const type = componentAnalysis._getComponentType(tc.definition);
    if (type !== tc.expected) {
      errors.push(`类型识别错误：${tc.definition} 期望 ${tc.expected}, 实际 ${type}`);
    }
  }

  // 边界情况测试
  console.log('✓ 边界情况测试');

  try {
    overview.loadFromLocalFile('/nonexistent/path.json');
    errors.push('应该抛出文件不存在错误');
  } catch (e) {
    if (!e.message.includes('文件不存在')) {
      errors.push(`错误类型不对：${e.message}`);
    }
  }

  // 打印结果
  console.log('\\n' + '='.repeat(50));
  if (errors.length === 0) {
    console.log('✅ 所有测试通过！');
    return 0;
  } else {
    console.log(`❌ 测试失败 (${errors.length} 个错误):`);
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
    return 1;
  }
}

// 运行测试
const exitCode = runTests();
process.exit(exitCode);
