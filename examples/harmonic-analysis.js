#!/usr/bin/env node

/**
 * 谐波分析技能示例
 *
 * 演示如何使用 HarmonicAnalysisSkill 进行：
 * 1. IEEE3 系统谐波分析
 * 2. THD 计算准确性验证
 * 3. GB/T 14549 合规性检查
 *
 * 使用方法:
 *   source .env.sh
 *   node examples/harmonic-analysis.js
 */

require('dotenv').config({ path: '.env' });

const { CloudPSSSkills } = require('../src/index.js');

async function main() {
  console.log('=== CloudPSS 谐波分析技能示例 ===\n');

  const skills = new CloudPSSSkills();

  // 测试连接
  console.log('1. 测试 API 连接...');
  const connection = await skills.testConnection();
  console.log(`   ${connection.message}\n`);

  if (!connection.success) {
    console.log('   无法连接到 CloudPSS API，请检查配置');
    return;
  }

  // =====================================================
  // 示例 1: 使用模拟数据进行 THD 计算
  // =====================================================
  console.log('2. THD 计算示例（模拟数据）...');

  // 生成模拟的 50Hz 基波 + 谐波信号
  const samplingRate = 10000; // 10 kHz 采样率
  const duration = 0.1; // 100ms
  const numSamples = Math.floor(samplingRate * duration);
  const time = [];
  const signal = [];

  const fundamentalFreq = 50; // 50 Hz 基波

  for (let i = 0; i < numSamples; i++) {
    const t = i / samplingRate;
    time.push(t);

    // 基波 (50Hz) - 幅值 1.0
    let value = Math.sin(2 * Math.PI * fundamentalFreq * t);

    // 3 次谐波 (150Hz) - 幅值 5%
    value += 0.05 * Math.sin(2 * Math.PI * 3 * fundamentalFreq * t);

    // 5 次谐波 (250Hz) - 幅值 3%
    value += 0.03 * Math.sin(2 * Math.PI * 5 * fundamentalFreq * t);

    // 7 次谐波 (350Hz) - 幅值 2%
    value += 0.02 * Math.sin(2 * Math.PI * 7 * fundamentalFreq * t);

    signal.push(value);
  }

  try {
    // 调用 THD 计算
    const thdResult = await skills.harmonic.calculateTHD({
      time,
      signal,
      samplingRate
    }, fundamentalFreq);

    console.log('\n   THD 计算结果:');
    console.log(`   ┌─────────────────────────────────────────┐`);
    console.log(`   │ 基波幅值：${thdResult.fundamental_magnitude.toFixed(6)}              │`);
    console.log(`   │ THD: ${thdResult.thd.toFixed(6)} (${thdResult.thd_pct.toFixed(4)}%)           │`);
    console.log(`   │ 采样率：${thdResult.sampling_rate.toFixed(1)} Hz                    │`);
    console.log(`   │ 谐波次数：${thdResult.num_harmonics}                        │`);
    console.log(`   └─────────────────────────────────────────┘`);

    // 显示主要谐波成分
    console.log('\n   主要谐波成分:');
    const harmonics = thdResult.harmonic_magnitudes || {};
    const fundamental = harmonics[1] || 1;

    for (let n = 2; n <= 10; n++) {
      const mag = harmonics[n] || 0;
      const pct = (mag / fundamental) * 100;
      if (pct > 0.1) {
        console.log(`   ${n}次谐波：${mag.toFixed(6)} (${pct.toFixed(2)}%)`);
      }
    }

    // =====================================================
    // 示例 2: GB/T 14549 合规性检查
    // =====================================================
    console.log('\n3. GB/T 14549 合规性检查...');

    const complianceResult = await skills.harmonic.checkCompliance(thdResult, {
      standard: 'GB/T 14549',
      voltageLevel: 10 // 10 kV 系统
    });

    console.log('\n   合规性检查结果:');
    console.log(`   ┌─────────────────────────────────────────┐`);
    console.log(`   │ 标准：${complianceResult.standard.padEnd(20)}│`);
    console.log(`   │ 电压等级：${complianceResult.voltage_level} kV                   │`);
    console.log(`   │ 整体合规：${complianceResult.overall_compliance ? '是' : '否'}                 │`);
    console.log(`   │ THD 合规：${complianceResult.thd_compliance?.compliant ? '是' : '否'}            │`);
    console.log(`   │ 越限数量：${complianceResult.violations_count}                        │`);
    console.log(`   └─────────────────────────────────────────┘`);

    if (complianceResult.thd_compliance) {
      console.log(`\n   THD 限值对比:`);
      console.log(`   - 实测值：${complianceResult.thd_compliance.measured.toFixed(4)}%`);
      console.log(`   - 限值：${complianceResult.thd_compliance.limit}%`);
      console.log(`   - 状态：${complianceResult.thd_compliance.compliant ? '合格' : '不合格'}`);
    }

    if (complianceResult.harmonic_violations && complianceResult.harmonic_violations.length > 0) {
      console.log('\n   谐波越限列表:');
      complianceResult.harmonic_violations.forEach(v => {
        console.log(`   - ${v.order}次${v.harmonic_type}谐波：${v.measured.toFixed(2)}% > ${v.limit}% (越限${v.violation.toFixed(2)}%)`);
      });
    }

    // =====================================================
    // 示例 3: 生成分析报告
    // =====================================================
    console.log('\n4. 生成谐波分析报告...');

    // 模拟 analyzeHarmonic 的结果结构
    const mockAnalysisResult = {
      fundamental_freq: fundamentalFreq,
      fundamental_magnitude: thdResult.fundamental_magnitude,
      thd: thdResult.thd,
      thd_pct: thdResult.thd_pct,
      harmonics: Object.entries(thdResult.harmonic_magnitudes || {}).map(([order, mag]) => ({
        order: parseInt(order),
        magnitude: mag,
        magnitude_pct: (mag / thdResult.fundamental_magnitude) * 100
      })),
      sampling_rate: thdResult.sampling_rate,
      num_samples: numSamples,
      duration_sec: duration
    };

    const report = skills.harmonic.generateReport(mockAnalysisResult, complianceResult, {
      format: 'markdown'
    });

    console.log('\n   报告预览 (Markdown 格式):');
    console.log('   ┌─────────────────────────────────────────────────────────');
    const preview = report.split('\n').slice(0, 20).join('\n   │ ');
    console.log(`   │ ${preview}`);
    console.log('   └─────────────────────────────────────────────────────────');

    // =====================================================
    // 示例 4: 阻抗扫描（演示）
    // =====================================================
    console.log('\n5. 阻抗扫描示例...');

    try {
      // 注意：阻抗扫描需要实际的仿真任务 ID
      // 这里仅演示 API 调用方式
      const impedanceResult = await skills.harmonic.impedanceScan('demo-job-id', {
        minFreq: 10,
        maxFreq: 2500,
        numPoints: 100
      });

      console.log('\n   阻抗扫描结果:');
      console.log(`   - 频率范围：${impedanceResult.frequency_range[0]} - ${impedanceResult.frequency_range[1]} Hz`);
      console.log(`   - 扫描点数：${impedanceResult.num_points}`);
      console.log(`   - 关键频率：${impedanceResult.critical_frequencies.length} 个`);

      if (impedanceResult.critical_frequencies.length > 0) {
        console.log('\n   关键频率列表 (50Hz 整数倍):');
        impedanceResult.critical_frequencies.slice(0, 10).forEach(cf => {
          console.log(`   - ${cf.frequency} Hz (${cf.harmonic_order}次谐波，${cf.type})`);
        });
      }
    } catch (error) {
      console.log(`   阻抗扫描需要实际仿真任务，演示模式跳过: ${error.message}`);
    }

    // =====================================================
    // 示例 5: 文本格式报告
    // =====================================================
    console.log('\n6. 文本格式报告...');

    const textReport = skills.harmonic.generateReport(mockAnalysisResult, complianceResult, {
      format: 'text'
    });

    console.log('\n' + textReport);

  } catch (error) {
    console.error(`\n✗ 操作失败：${error.message}`);
    console.error(`  堆栈：${error.stack}`);
  }

  // =====================================================
  // 完整工作流示例（使用真实仿真数据）
  // =====================================================
  console.log('\n=== 完整工作流示例 ===');
  console.log('以下代码演示如何使用真实仿真数据进行谐波分析:');
  console.log(`
  // 1. 运行 EMT 仿真
  const modelRid = 'model/your/renewable-energy-system';
  const runner = await skills.client.runSimulation(modelRid, 0, 0);
  const jobId = runner.job_id;

  // 2. 等待仿真完成
  await skills.client.waitForCompletion(jobId, 300);

  // 3. 分析电流谐波
  const currentAnalysis = await skills.harmonic.analyzeHarmonic(jobId, {
    channel: 'Ia',           // A 相电流
    fundamentalFreq: 50,     // 50Hz 系统
    maxHarmonic: 20          // 分析到 20 次谐波
  });

  // 4. 分析电压谐波
  const voltageAnalysis = await skills.harmonic.analyzeHarmonic(jobId, {
    channel: 'Ua',           // A 相电压
    fundamentalFreq: 50
  });

  // 5. 检查合规性
  const compliance = await skills.harmonic.checkCompliance(currentAnalysis, {
    voltageLevel: 0.38       // 0.38kV 低压系统
  });

  // 6. 生成报告
  const report = skills.harmonic.generateReport(
    currentAnalysis,
    compliance,
    { format: 'markdown' }
  );

  // 7. 保存报告
  const fs = require('fs');
  fs.writeFileSync('harmonic-report.md', report);
  console.log('报告已保存至 harmonic-report.md');
  `);

  console.log('\n=== 示例完成 ===');
}

main().catch(console.error);
