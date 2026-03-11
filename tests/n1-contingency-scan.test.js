/**
 * N-1 Contingency Scan Skill Tests
 *
 * 测试用例：
 * 1. IEEE3 系统 N-1 扫描
 * 2. 验证越限识别准确性
 * 3. 验证报告生成格式
 */

const { CloudPSSSkills } = require('../src/index');

// 测试配置
const TEST_CONFIG = {
  token: process.env.CLOUDPSS_TOKEN || process.env.CLOUDPSS_API_KEY,
  apiURL: process.env.CLOUDPSS_API_URL || 'https://cloudpss.net/',
  // IEEE3 测试系统 RID（需要替换为实际的项目 RID）
  ieee3Rid: 'model/test/ieee-3-bus'
};

/**
 * 测试 1: IEEE3 系统 N-1 扫描
 */
async function testIEEE3N1Scan() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: IEEE3 系统 N-1 扫描');
  console.log('='.repeat(60));

  const skills = new CloudPSSSkills(TEST_CONFIG);

  try {
    // 执行完整 N-1 扫描
    const results = await skills.n1scan.scan(TEST_CONFIG.ieee3Rid, {
      jobType: 'powerFlow',
      limits: {
        voltage: { min: 0.95, max: 1.05, critical_min: 0.90, critical_max: 1.10 },
        loading: { threshold: 100, critical_threshold: 120, default_rate: 100 }
      },
      maxConcurrency: 3
    });

    console.log('\n扫描完成:');
    console.log(`  总场景数：${results.totalScenes}`);
    console.log(`  收敛率：${results.summary.convergenceRate}`);
    console.log(`  严重场景：${results.summary.severity.critical}`);
    console.log(`  警告场景：${results.summary.severity.warning}`);
    console.log(`  正常场景：${results.summary.severity.normal}`);

    // 验证结果结构
    const validStructure = validateResultStructure(results);
    if (!validStructure) {
      throw new Error('结果结构验证失败');
    }

    console.log('\n✓ 测试 1 通过：结果结构正确');
    return { success: true, results };

  } catch (error) {
    console.error(`\n✗ 测试 1 失败：${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试 2: 线路 N-1 扫描
 */
async function testLineN1Scan() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 线路 N-1 扫描');
  console.log('='.repeat(60));

  const skills = new CloudPSSSkills(TEST_CONFIG);

  try {
    const results = await skills.n1scan.scanLines(TEST_CONFIG.ieee3Rid, {
      jobType: 'powerFlow'
    });

    console.log(`\n线路扫描完成:`);
    console.log(`  扫描线路数：${results.totalScenes}`);

    // 验证所有扫描的元件都是线路
    const allLines = results.results.every(r =>
      r.element_type === 'line' || r.status !== 'success'
    );

    if (!allLines) {
      throw new Error('扫描结果中包含非线路元件');
    }

    console.log('✓ 测试 2 通过：仅扫描线路元件');
    return { success: true, results };

  } catch (error) {
    console.error(`✗ 测试 2 失败：${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试 3: 变压器 N-1 扫描
 */
async function testTransformerN1Scan() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: 变压器 N-1 扫描');
  console.log('='.repeat(60));

  const skills = new CloudPSSSkills(TEST_CONFIG);

  try {
    const results = await skills.n1scan.scanTransformers(TEST_CONFIG.ieee3Rid, {
      jobType: 'powerFlow'
    });

    console.log(`\n变压器扫描完成:`);
    console.log(`  扫描变压器数：${results.totalScenes}`);

    // 验证所有扫描的元件都是变压器
    const allTransformers = results.results.every(r =>
      r.element_type === 'transformer' || r.status !== 'success'
    );

    if (!allTransformers) {
      throw new Error('扫描结果中包含非变压器元件');
    }

    console.log('✓ 测试 3 通过：仅扫描变压器元件');
    return { success: true, results };

  } catch (error) {
    console.error(`✗ 测试 3 失败：${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试 4: 越限识别准确性验证
 */
async function testViolationDetection() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 4: 越限识别准确性验证');
  console.log('='.repeat(60));

  // 模拟测试数据
  const testBuses = [
    { Bus: 'BUS1', Vm: 1.0, Va: 0 },      // 正常
    { Bus: 'BUS2', Vm: 0.93, Va: -5 },    // 低电压 (warning)
    { Bus: 'BUS3', Vm: 0.88, Va: -10 },   // 低电压 (critical)
    { Bus: 'BUS4', Vm: 1.07, Va: 5 },     // 高电压 (warning)
    { Bus: 'BUS5', Vm: 1.12, Va: 10 }     // 高电压 (critical)
  ];

  const testBranches = [
    { id: 'L1', Pij: 50, Qij: 20, rate: 100 },    // 53.9% - 正常
    { id: 'L2', Pij: 90, Qij: 40, rate: 100 },    // 98.5% - 警告
    { id: 'L3', Pij: 110, Qij: 50, rate: 100 },   // 120.8% - 严重过载
    { id: 'L4', Pij: 80, Qij: 60, rate: 100 }     // 100% - 警告
  ];

  const skills = new CloudPSSSkills(TEST_CONFIG);

  try {
    // 测试电压越限检测
    const voltageViolations = await skills.n1scan.pyBridge.checkVoltageViolations(
      testBuses,
      { min: 0.95, max: 1.05, critical_min: 0.90, critical_max: 1.10 }
    );

    console.log('\n电压越限检测:');
    console.log(`  检测到的越限数：${voltageViolations.length}`);
    console.log(`  预期越限数：4 (BUS2, BUS3, BUS4, BUS5)`);

    // 验证检测结果
    const lowVoltage = voltageViolations.filter(v => v.violation_type === 'low');
    const highVoltage = voltageViolations.filter(v => v.violation_type === 'high');
    const critical = voltageViolations.filter(v => v.severity === 'critical');

    console.log(`  低电压：${lowVoltage.length} 个`);
    console.log(`  高电压：${highVoltage.length} 个`);
    console.log(`  严重越限：${critical.length} 个`);

    if (voltageViolations.length !== 4) {
      throw new Error(`电压越限检测数量错误：期望 4，实际 ${voltageViolations.length}`);
    }

    if (critical.length !== 2) {
      throw new Error(`严重越限检测数量错误：期望 2，实际 ${critical.length}`);
    }

    // 测试线路过载检测
    const lineOverloads = await skills.n1scan.pyBridge.checkLineOverloads(
      testBranches,
      { threshold: 100, critical_threshold: 120, default_rate: 100 }
    );

    console.log('\n线路过载检测:');
    console.log(`  检测到的过载数：${lineOverloads.length}`);
    console.log(`  预期过载数：3 (L2, L3, L4)`);

    const criticalOverload = lineOverloads.filter(l => l.severity === 'critical');

    console.log(`  严重过载：${criticalOverload.length} 个`);

    if (lineOverloads.length !== 3) {
      throw new Error(`线路过载检测数量错误：期望 3，实际 ${lineOverloads.length}`);
    }

    if (criticalOverload.length !== 1) {
      throw new Error(`严重过载检测数量错误：期望 1，实际 ${criticalOverload.length}`);
    }

    console.log('✓ 测试 4 通过：越限识别准确');
    return { success: true, voltageViolations, lineOverloads };

  } catch (error) {
    console.error(`✗ 测试 4 失败：${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 测试 5: 报告生成格式验证
 */
async function testReportGeneration() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 5: 报告生成格式验证');
  console.log('='.repeat(60));

  // 模拟扫描结果
  const mockResults = {
    rid: 'model/test/ieee-3-bus',
    timestamp: new Date().toISOString(),
    totalScenes: 5,
    summary: {
      total: 5,
      success: 4,
      failed: 1,
      convergenceErrors: 0,
      convergenceRate: '80.0%',
      severity: {
        critical: 2,
        warning: 1,
        normal: 2
      },
      criticalScenes: [
        {
          element_id: 'L1',
          element_name: '线路 1',
          element_type: 'line',
          voltage_violations: 2,
          line_overloads: 1
        }
      ]
    },
    results: [
      {
        element_id: 'L1',
        element_name: '线路 1',
        element_type: 'line',
        status: 'success',
        severity: 'critical',
        violations: {
          voltage: [{ bus_name: 'BUS2', voltage: 0.88, violation_type: 'low', severity: 'critical' }],
          line_overload: [{ branch_name: 'L3', loading: 120.8, severity: 'critical' }]
        }
      },
      {
        element_id: 'L2',
        element_name: '线路 2',
        element_type: 'line',
        status: 'success',
        severity: 'warning',
        violations: {
          voltage: [{ bus_name: 'BUS3', voltage: 0.94, violation_type: 'low', severity: 'warning' }],
          line_overload: []
        }
      },
      {
        element_id: 'L3',
        element_name: '线路 3',
        element_type: 'line',
        status: 'success',
        severity: 'normal',
        violations: { voltage: [], line_overload: [] }
      },
      {
        element_id: 'T1',
        element_name: '变压器 1',
        element_type: 'transformer',
        status: 'failed',
        severity: 'critical',
        error: 'Simulation timeout'
      },
      {
        element_id: 'T2',
        element_name: '变压器 2',
        element_type: 'transformer',
        status: 'success',
        severity: 'normal',
        violations: { voltage: [], line_overload: [] }
      }
    ]
  };

  const skills = new CloudPSSSkills(TEST_CONFIG);

  try {
    const report = skills.n1scan.generateReport(mockResults);

    // 验证报告格式
    const checks = [
      { name: '包含标题', test: report.includes('N-1 安全扫描报告') },
      { name: '包含项目信息', test: report.includes('model/test/ieee-3-bus') },
      { name: '包含扫描汇总', test: report.includes('扫描汇总') },
      { name: '包含严重程度分布', test: report.includes('严重程度分布') },
      { name: '包含详细结果', test: report.includes('详细扫描结果') },
      { name: '包含严重场景标记', test: report.includes('[CRIT]') },
      { name: '包含警告场景标记', test: report.includes('[WARN]') },
      { name: '包含正常场景标记', test: report.includes('[OK]') }
    ];

    let allPassed = true;
    for (const check of checks) {
      const status = check.test ? '✓' : '✗';
      console.log(`  ${status} ${check.name}`);
      if (!check.test) allPassed = false;
    }

    if (!allPassed) {
      throw new Error('报告格式验证失败');
    }

    // 打印报告示例（前 50 行）
    console.log('\n报告示例 (前 50 行):');
    console.log('-'.repeat(60));
    const lines = report.split('\n').slice(0, 50);
    console.log(lines.join('\n'));
    if (report.split('\n').length > 50) {
      console.log('... (报告继续)');
    }

    console.log('✓ 测试 5 通过：报告格式正确');
    return { success: true, report };

  } catch (error) {
    console.error(`✗ 测试 5 失败：${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 验证结果结构
 */
function validateResultStructure(results) {
  const required = ['rid', 'timestamp', 'totalScenes', 'summary', 'results'];
  for (const key of required) {
    if (!(key in results)) {
      console.error(`  缺少字段：${key}`);
      return false;
    }
  }

  const summaryRequired = ['total', 'success', 'failed', 'convergenceErrors', 'convergenceRate', 'severity'];
  for (const key of summaryRequired) {
    if (!(key in results.summary)) {
      console.error(`  summary 缺少字段：${key}`);
      return false;
    }
  }

  if (!Array.isArray(results.results)) {
    console.error('  results 不是数组');
    return false;
  }

  return true;
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('\n' + '#'.repeat(60));
  console.log('# N-1 Contingency Scan Skill - 测试套件');
  console.log('#'.repeat(60));

  const testResults = [];

  // 运行单元测试（不依赖实际 API）
  testResults.push(await testViolationDetection());
  testResults.push(await testReportGeneration());

  // 运行集成测试（需要实际 API 连接）
  if (TEST_CONFIG.token && TEST_CONFIG.token !== 'your-cloudpss-token-here') {
    testResults.push(await testIEEE3N1Scan());
    testResults.push(await testLineN1Scan());
    testResults.push(await testTransformerN1Scan());
  } else {
    console.log('\n⚠️  跳过集成测试：未配置 CloudPSS Token');
    console.log('   请设置 CLOUDPSS_TOKEN 环境变量后重试');
  }

  // 汇总结果
  console.log('\n' + '='.repeat(60));
  console.log('测试汇总');
  console.log('='.repeat(60));

  const passed = testResults.filter(r => r.success).length;
  const failed = testResults.filter(r => !r.success).length;

  console.log(`  通过：${passed}`);
  console.log(`  失败：${failed}`);
  console.log(`  总计：${testResults.length}`);

  if (failed > 0) {
    console.log('\n失败详情:');
    testResults.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.error}`);
    });
  }

  return { passed, failed, total: testResults.length };
}

// 如果直接运行此文件
if (require.main === module) {
  runAllTests()
    .then(result => {
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('测试执行失败:', err);
      process.exit(1);
    });
}

module.exports = {
  runAllTests,
  testIEEE3N1Scan,
  testLineN1Scan,
  testTransformerN1Scan,
  testViolationDetection,
  testReportGeneration
};
