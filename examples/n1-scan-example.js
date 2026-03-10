/**
 * N-1 Contingency Scan Skill - 使用示例
 *
 * 本示例演示如何使用 N-1 扫描技能进行电力系统安全分析
 */

const { CloudPSSSkills } = require('../src/index');

// 配置
const config = {
  token: process.env.CLOUDPSS_TOKEN,
  apiURL: process.env.CLOUDPSS_API_URL || 'https://cloudpss.net/'
};

const skills = new CloudPSSSkills(config);

/**
 * 示例 1: 完整 N-1 扫描
 */
async function example1_FullScan() {
  console.log('\n=== 示例 1: 完整 N-1 扫描 ===\n');

  const rid = 'model/your-project/ieee-3-bus'; // 替换为实际项目 RID

  const results = await skills.n1scan.scan(rid, {
    jobType: 'powerFlow',
    limits: {
      voltage: { min: 0.95, max: 1.05, critical_min: 0.90, critical_max: 1.10 },
      loading: { threshold: 100, critical_threshold: 120, default_rate: 100 }
    },
    maxConcurrency: 5
  });

  console.log(`扫描完成:`);
  console.log(`  总场景：${results.totalScenes}`);
  console.log(`  收敛率：${results.summary.convergenceRate}`);
  console.log(`  严重场景：${results.summary.severity.critical}`);

  // 生成报告
  const report = skills.n1scan.generateReport(results);
  console.log('\n报告摘要:');
  console.log(report.split('\n').slice(0, 20).join('\n'));
}

/**
 * 示例 2: 仅扫描线路 N-1
 */
async function example2_LineScan() {
  console.log('\n=== 示例 2: 仅线路 N-1 扫描 ===\n');

  const rid = 'model/your-project/ieee-3-bus';

  const results = await skills.n1scan.scanLines(rid, {
    jobType: 'powerFlow'
  });

  console.log(`线路扫描完成:`);
  console.log(`  扫描线路数：${results.totalScenes}`);
  console.log(`  严重场景：${results.summary.severity.critical}`);
}

/**
 * 示例 3: 仅扫描变压器 N-1
 */
async function example3_TransformerScan() {
  console.log('\n=== 示例 3: 仅变压器 N-1 扫描 ===\n');

  const rid = 'model/your-project/ieee-3-bus';

  const results = await skills.n1scan.scanTransformers(rid, {
    jobType: 'powerFlow'
  });

  console.log(`变压器扫描完成:`);
  console.log(`  扫描变压器数：${results.totalScenes}`);
}

/**
 * 示例 4: 扫描指定元件
 */
async function example4_SpecificElements() {
  console.log('\n=== 示例 4: 扫描指定元件 ===\n');

  const rid = 'model/your-project/ieee-3-bus';

  // 指定要扫描的元件 ID 列表
  const elements = ['LINE-1', 'LINE-2', 'XFMR-1'];

  const results = await skills.n1scan.scan(rid, {
    elements,
    jobType: 'powerFlow'
  });

  console.log(`指定元件扫描完成:`);
  console.log(`  扫描元件数：${results.totalScenes}`);
}

/**
 * 示例 5: 自定义越限阈值
 */
async function example5_CustomLimits() {
  console.log('\n=== 示例 5: 自定义越限阈值 ===\n');

  const rid = 'model/your-project/ieee-3-bus';

  const results = await skills.n1scan.scan(rid, {
    jobType: 'powerFlow',
    limits: {
      voltage: {
        min: 0.93,      // 更宽松的低电压阈值
        max: 1.07,      // 更宽松的高电压阈值
        critical_min: 0.85,
        critical_max: 1.15
      },
      loading: {
        threshold: 90,      // 90% 就告警
        critical_threshold: 110,  // 110% 严重告警
        default_rate: 150   // 默认额定容量 150MW
      }
    }
  });

  console.log(`自定义阈值扫描完成:`);
  console.log(`  严重场景：${results.summary.severity.critical}`);
  console.log(`  警告场景：${results.summary.severity.warning}`);
}

/**
 * 示例 6: 导出详细结果用于进一步分析
 */
async function example6_ExportResults() {
  console.log('\n=== 示例 6: 导出详细结果 ===\n');

  const rid = 'model/your-project/ieee-3-bus';

  const results = await skills.n1scan.scan(rid, {
    jobType: 'powerFlow'
  });

  // 导出所有严重场景
  const criticalScenes = results.results.filter(r => r.severity === 'critical');
  console.log(`\n严重 N-1 场景详情:`);

  for (const scene of criticalScenes) {
    console.log(`\n--- ${scene.element_name} (${scene.element_id}) ---`);
    console.log(`类型：${scene.element_type}`);
    console.log(`状态：${scene.status}`);

    if (scene.violations) {
      if (scene.violations.voltage?.length > 0) {
        console.log('电压越限:');
        scene.violations.voltage.forEach(v => {
          console.log(`  - ${v.bus_name}: ${v.voltage.toFixed(3)} pu (${v.violation_type})`);
        });
      }

      if (scene.violations.line_overload?.length > 0) {
        console.log('线路过载:');
        scene.violations.line_overload.forEach(l => {
          console.log(`  - ${l.branch_name}: ${l.loading.toFixed(1)}%`);
        });
      }
    }
  }

  // 可以保存为 JSON 文件
  // const fs = require('fs');
  // fs.writeFileSync('n1-results.json', JSON.stringify(results, null, 2));
}

// 主函数
async function main() {
  console.log('CloudPSS N-1 Contingency Scan Skill - 使用示例');
  console.log('=============================================\n');

  // 注意：以下示例需要有效的 CloudPSS Token 和项目 RID
  // 取消注释以运行示例

  try {
    // await example1_FullScan();
    // await example2_LineScan();
    // await example3_TransformerScan();
    // await example4_SpecificElements();
    // await example5_CustomLimits();
    // await example6_ExportResults();

    console.log('提示：取消注释相应的示例函数以运行');
    console.log('请确保已设置 CLOUDPSS_TOKEN 环境变量');
    console.log('并将项目 RID 替换为实际的项目');

  } catch (error) {
    console.error('示例执行失败:', error.message);
  }
}

// 如果直接运行
if (require.main === module) {
  main();
}

module.exports = {
  example1_FullScan,
  example2_LineScan,
  example3_TransformerScan,
  example4_SpecificElements,
  example5_CustomLimits,
  example6_ExportResults
};
