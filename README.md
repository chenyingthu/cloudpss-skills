# CloudPSS Skills

CloudPSS 电力系统云仿真平台技能库 - 基于 CloudPSS Python SDK 的 Node.js 封装

## 功能概览

| 技能模块 | 功能描述 |
|---------|---------|
| **算例管理** (Manage) | 项目列表、算例详情、计算/参数方案管理 |
| **算例创建** (Create) | 从模板创建算例、创建计算/参数方案 |
| **参数配置** (Configure) | 元件参数配置、发电机/负荷/变压器/线路配置 |
| **结果提取** (Extract) | 元件数据、拓扑数据、节点电压、线路功率提取 |
| **结果分析** (Analyze) | 潮流分析、安全性分析、电磁暂态分析 |
| **报告生成** (Report) | Markdown/HTML/JSON 格式报告生成 |
| **潮流分析** (PowerFlow) ⭐ | 潮流结果深度分析、越限检查、统计汇总 |
| **N-1扫描** (N1Analysis) ⭐ | N-1预想事故扫描、薄弱环节分析、严重程度评估 |
| **批量仿真** (BatchEnhanced) ⭐ | 多场景并行仿真、参数扫描、敏感性分析 |
| **算例管理增强** (ModelManagement) ⭐ | 完整CRUD、导入导出、版本对比、批量操作 |

> ⭐ 标记为新增高级认知技能

## 快速开始

### 1. 环境配置

```bash
# 复制环境配置示例文件
cp .env.example .env

# 编辑 .env 文件，填入你的 CloudPSS Token
# Token 获取方式：登录 cloudpss.net -> 用户中心 -> SDK Token
```

### 2. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 确保已安装 CloudPSS Python SDK
pip install cloudpss
```

### 3. 运行示例

```bash
# 测试连接并获取算例
CLOUDPSS_TOKEN=<your-token> node examples/test-connection.js

# 列出项目
CLOUDPSS_TOKEN=<your-token> node examples/list-projects.js

# 创建仿真算例
CLOUDPSS_TOKEN=<your-token> node examples/create-simulation.js

# 运行仿真并分析结果
CLOUDPSS_TOKEN=<your-token> node examples/analyze-results.js
```

## 高级认知技能

### 潮流分析技能 (PowerFlowAnalysisSkill)

深度潮流结果分析，提供越限检查和智能建议。

```javascript
const skills = new CloudPSSSkills();

// 运行潮流计算
const job = await skills.powerFlow.runPowerFlow('model/owner/key', 0, 0);

// 获取节点电压
const buses = await skills.powerFlow.getBusVoltages(job.jobId);
console.log(`电压范围: ${buses.summary.minVoltage} - ${buses.summary.maxVoltage} p.u.`);

// 获取支路功率
const branches = await skills.powerFlow.getBranchFlows(job.jobId);
console.log(`网损: ${branches.summary.totalPLoss} MW`);

// 检查越限
const violations = await skills.powerFlow.checkViolations(job.jobId, {
  voltage: { min: 0.95, max: 1.05 },
  lineLoading: { warning: 80, critical: 100 }
});

if (violations.hasViolations) {
  console.log(`电压越限: ${violations.voltageViolations.count} 处`);
  console.log(`线路过载: ${violations.lineOverloads.count} 处`);
}

// 生成报告
const report = await skills.powerFlow.generateReport(job.jobId);
console.log(report);
```

**主要方法：**
- `runPowerFlow(rid, jobIndex, configIndex)` - 运行潮流计算
- `getBusVoltages(jobId)` - 获取节点电压详情
- `getBranchFlows(jobId)` - 获取支路功率流
- `checkViolations(jobId, limits)` - 越限检查
- `generateReport(jobId)` - 生成分析报告

---

### N-1预想事故扫描技能 (N1ContingencyAnalysisSkill)

系统性N-1扫描，识别电网薄弱环节。

```javascript
// 运行完整N-1扫描
const scanResult = await skills.n1Analysis.runFullScan('model/owner/key', {
  scanElements: ['line', 'transformer', 'generator'],
  limits: { voltage: { min: 0.90, max: 1.10 } },
  parallel: true
});

console.log(`扫描场景: ${scanResult.summary.totalScenarios}`);
console.log(`严重故障: ${scanResult.summary.criticalCount}`);

// 按类型扫描
const lineScan = await skills.n1Analysis.scanLines('model/owner/key');
const xfmrScan = await skills.n1Analysis.scanTransformers('model/owner/key');

// 分析薄弱环节
const weaknesses = skills.n1Analysis.analyzeWeaknesses(scanResult);
console.log('薄弱元件:', weaknesses.vulnerableElements);
console.log('改进建议:', weaknesses.recommendations);
```

**主要方法：**
- `runFullScan(rid, options)` - 完整N-1扫描
- `scanLines(rid, options)` - 线路N-1扫描
- `scanTransformers(rid, options)` - 变压器N-1扫描
- `scanGenerators(rid, options)` - 发电机N-1扫描
- `analyzeWeaknesses(scanResult)` - 薄弱环节分析

---

### 批量仿真增强技能 (BatchSimulationEnhancedSkill)

多场景并行仿真与参数扫描分析。

```javascript
// 定义仿真场景
const scenarios = [
  { name: '高峰负荷', jobIndex: 0, configIndex: 0 },
  { name: '低谷负荷', jobIndex: 0, configIndex: 1 },
  { name: '检修方式', jobIndex: 1, configIndex: 0 }
];

// 批量运行
const batchResult = await skills.batchEnhanced.runPowerFlowBatch(
  'model/owner/key',
  scenarios,
  { maxParallel: 5, analyzeResults: true }
);

console.log(`成功率: ${batchResult.aggregated.successRate}%`);
console.log(`电压范围: ${batchResult.aggregated.voltageStats.min} - ${batchResult.aggregated.voltageStats.max} p.u.`);

// 参数扫描
const sweepResult = await skills.batchEnhanced.parameterSweep(
  'model/owner/key',
  'load_factor',
  [0.8, 0.9, 1.0, 1.1, 1.2]
);

console.log('敏感性系数:', sweepResult.sensitivity.sensitivityCoefficients);

// 负荷增长扫描
const loadScan = await skills.batchEnhanced.loadGrowthScan('model/owner/key', {
  startPercent: 80,
  endPercent: 120,
  step: 5
});

// 导出结果
const csv = skills.batchEnhanced.exportResults(batchResult, 'csv');
const report = skills.batchEnhanced.generateReport(batchResult);
```

**主要方法：**
- `runPowerFlowBatch(rid, scenarios, options)` - 批量潮流仿真
- `parameterSweep(rid, paramName, values, options)` - 参数扫描
- `loadGrowthScan(rid, options)` - 负荷增长扫描
- `generatorDispatchScan(rid, genId, levels, options)` - 发电机出力扫描
- `exportResults(result, format)` - 导出结果 (JSON/CSV)
- `generateReport(result)` - 生成报告

---

### 算例管理增强技能 (ModelManagementEnhancedSkill)

完整的算例生命周期管理。

```javascript
// 列出算例
const models = await skills.modelManagement.listModels({ pageSize: 100 });
console.log(`总计: ${models.stats.total} 个算例`);

// 搜索算例
const searchResult = await skills.modelManagement.searchModels({
  keyword: 'IEEE',
  jobType: 'powerFlow',
  owner: 'CloudPSS'
});

// 获取详情
const info = await skills.modelManagement.getModelInfo('model/owner/key', {
  includeComponents: true,
  includeTopology: true
});

// 创建参数方案
const config = await skills.modelManagement.createConfigEnhanced('model/owner/key', {
  name: '高峰方案',
  copyFrom: 0,  // 从第0个配置复制
  args: { load_factor: 1.2 }
});

// 导出算例
const exportResult = await skills.modelManagement.exportModel(
  'model/owner/key',
  '/path/to/backup.yaml.gz',
  { format: 'yaml', compress: 'gzip' }
);

// 批量导出
const batchExport = await skills.modelManagement.batchExport(
  ['model/owner/key1', 'model/owner/key2'],
  '/backup/directory'
);

// 对比算例
const diff = await skills.modelManagement.compareModels(
  'model/owner/key1',
  'model/owner/key2'
);
console.log('差异:', diff.summary);

// 生成管理报告
const report = skills.modelManagement.generateReport(models);
```

**主要方法：**
- `listModels(options)` - 列出算例
- `getModelInfo(rid, options)` - 获取详情
- `searchModels(criteria)` - 搜索算例
- `createConfigEnhanced(rid, data)` - 创建参数方案
- `createJobEnhanced(rid, data)` - 创建计算方案
- `exportModel(rid, filePath, options)` - 导出算例
- `importModel(filePath, options)` - 导入算例
- `batchExport(rids, outputDir)` - 批量导出
- `batchImport(inputDir)` - 批量导入
- `compareModels(rid1, rid2)` - 对比算例
- `deleteModel(rid, options)` - 删除算例

## 基础功能模块

### 算例管理 (Manage)
- `listProjects()` - 获取项目列表
- `getModel(rid)` - 获取算例详情
- `listJobs(rid)` - 列出计算方案
- `listConfigs(rid)` - 列出参数方案

### 算例创建 (Create)
- `simulation(options)` - 从模板创建算例
- `createJob(rid, type, name)` - 创建计算方案
- `createConfig(rid, name)` - 创建参数方案
- `save(rid)` - 保存算例

### 参数配置 (Configure)
- `getConfigs(rid)` - 获取参数方案
- `updateComponent(rid, componentKey, args)` - 更新元件参数
- `configureGenerator(rid, key, params)` - 配置发电机
- `configureLoad(rid, key, params)` - 配置负荷
- `configureTransformer(rid, key, params)` - 配置变压器
- `configureLine(rid, key, params)` - 配置线路

### 结果提取 (Extract)
- `extractComponents(jobId)` - 提取元件数据
- `extractTopology(jobId)` - 提取拓扑数据
- `extractBusVoltages(jobId)` - 提取节点电压
- `extractLineFlows(jobId)` - 提取线路功率
- `extractLogs(jobId)` - 提取仿真日志

### 结果分析 (Analyze)
- `analyzePowerFlow(jobId)` - 潮流分析
- `analyzeSecurity(jobId)` - 安全性分析
- `analyzeEMT(jobId)` - 电磁暂态分析

### 报告生成 (Report)
- `generate(options)` - 生成分析报告
- 支持 Markdown、HTML、JSON 格式

## API 配置

在 `.env` 文件中配置：

```bash
# CloudPSS Token（从 cloudpss.net 用户中心获取）
CLOUDPSS_TOKEN=your-token-here

# API URL（通常不需要修改）
CLOUDPSS_API_URL=https://cloudpss.net/
```

## 默认配置

### 越限阈值配置

```javascript
// 潮流分析和N-1扫描的默认越限阈值
const defaultLimits = {
  voltage: {
    min: 0.95,    // 电压下限 (p.u.)
    max: 1.05     // 电压上限 (p.u.)
  },
  lineLoading: {
    warning: 80,   // 线路负载预警阈值 (%)
    critical: 100  // 线路负载严重阈值 (%)
  }
};

// 自定义阈值
const customLimits = {
  voltage: { min: 0.90, max: 1.10 },
  lineLoading: { warning: 70, critical: 90 }
};

// 使用自定义阈值
const violations = await skills.powerFlow.checkViolations(jobId, customLimits);
```

## 使用示例

### 获取算例数据

```javascript
const { CloudPSSSkills } = require('./src/index.js');

const skills = new CloudPSSSkills();

// 获取算例
const model = await skills.manage.getModel('model/CloudPSS/IEEE3');
console.log('算例名称:', model.name);
console.log('计算方案:', model.jobs);
console.log('参数方案:', model.configs);
```

### 运行潮流分析完整流程

```javascript
const skills = new CloudPSSSkills();
const rid = 'model/CloudPSS/IEEE39';

// 1. 运行潮流计算
const job = await skills.powerFlow.runPowerFlow(rid, 0, 0);
console.log('任务ID:', job.jobId);

// 2. 获取结果
const buses = await skills.powerFlow.getBusVoltages(job.jobId);
const branches = await skills.powerFlow.getBranchFlows(job.jobId);

// 3. 越限检查
const violations = await skills.powerFlow.checkViolations(job.jobId);

// 4. 生成报告
const report = await skills.powerFlow.generateReport(job.jobId);
console.log(report);
```

### 运行N-1扫描

```javascript
const skills = new CloudPSSSkills();
const rid = 'model/CloudPSS/IEEE39';

// 完整扫描
const scan = await skills.n1Analysis.runFullScan(rid, {
  scanElements: ['line', 'transformer'],
  limits: { voltage: { min: 0.90, max: 1.10 } }
});

// 分析结果
if (scan.summary.criticalCount > 0) {
  console.log(`发现 ${scan.summary.criticalCount} 个严重N-1故障`);

  // 分析薄弱环节
  const weaknesses = skills.n1Analysis.analyzeWeaknesses(scan);
  console.log('建议:', weaknesses.recommendations);
}
```

### 批量仿真场景分析

```javascript
const skills = new CloudPSSSkills();
const rid = 'model/CloudPSS/IEEE39';

// 定义多场景
const scenarios = [
  { name: '基础场景', jobIndex: 0, configIndex: 0 },
  { name: 'N-1场景', jobIndex: 1, configIndex: 0 }
];

// 批量执行
const batch = await skills.batchEnhanced.runPowerFlowBatch(rid, scenarios);

// 分析结果
console.log(`成功率: ${batch.aggregated.successRate}%`);
console.log(`电压范围: ${batch.aggregated.voltageStats.min} - ${batch.aggregated.voltageStats.max} p.u.`);

// 导出CSV
const csv = skills.batchEnhanced.exportResults(batch, 'csv');
fs.writeFileSync('results.csv', csv);
```

### 更新元件参数

```javascript
// 配置发电机参数
await skills.configure.configureGenerator(rid, 'Generator-1', {
  p: 100,  // 有功出力 MW
  v: 1.05, // 电压 pu
  q: 50    // 无功出力 MVar
});
```

### 生成分析报告

```javascript
const report = await skills.report.generate({
  jobId: 'job-123',
  type: 'power_flow',
  format: 'markdown'
});

console.log(report.content);
```

## 架构说明

```
┌─────────────────────────────────────────────────────┐
│ Node.js 层                                          │
│  - src/index.js (主入口)                            │
│  - src/api/client.js (API 客户端)                   │
│  - src/skills/*.js (技能模块)                       │
├─────────────────────────────────────────────────────┤
│ Python Bridge (src/api/python-bridge.js)            │
│  - 子进程调用 Python wrapper                        │
│  - JSON 数据交换                                    │
├─────────────────────────────────────────────────────┤
│ Python Wrapper (python/cloudpss_wrapper.py)         │
│  - cloudpss SDK 封装                                │
│  - 命令行接口                                       │
├─────────────────────────────────────────────────────┤
│ CloudPSS Python SDK                                 │
│  - Model.fetch(rid)                                 │
│  - model.run(job, config)                           │
│  - result.getBuses() / getBranches() / getPlots()   │
└─────────────────────────────────────────────────────┘
```

## 算例 RID 格式

CloudPSS 使用 RID (Resource Identifier) 标识算例：

```
model/owner/key
```

例如：
- `model/CloudPSS/IEEE3` - 3 机 9 节点测试系统
- `model/CloudPSS/NewEngland` - New England 10 机 39 节点系统

## 计算方案类型

- `powerFlow` - 潮流计算
- `emtp` - 电磁暂态仿真
- `sfemt` - 移频电磁暂态
- `iesLoadPrediction` - 综合能源系统负荷预测
- `iesPowerFlow` - 综合能源系统潮流
- `iesEnergyStoragePlan` - 综合能源系统储能规划

## 测试

### 单元测试 (无需API)

```bash
# 运行所有单元测试
node tests/unit-new-skills.test.js

# 测试覆盖：
# - PowerFlowAnalysisSkill: 初始化、默认配置、数据解析、建议生成
# - N1ContingencyAnalysisSkill: 初始化、元件识别、严重程度计算
# - BatchSimulationEnhancedSkill: 结果汇总、敏感性分析、报告生成
```

### 端到端测试 (需要API Token)

```bash
# 设置Token
export CLOUDPSS_TOKEN=your-token-here
# 或创建 .cloudpss_token 文件
echo "your-token" > ../../.cloudpss_token

# 运行E2E测试
node tests/e2e-new-skills.test.js

# 测试覆盖：
# - 实际潮流计算执行
# - 真实N-1扫描
# - API集成验证
```

### 测试结果示例

```
╔════════════════════════════════════════════════════════════════╗
║       Unit Test: PowerFlow, N-1, Batch Skills (Mocked)        ║
╚════════════════════════════════════════════════════════════════╝

📦 PowerFlowAnalysisSkill
   ✅ PowerFlow: Skill initialization (1ms)
   ✅ PowerFlow: Default limits (0ms)
   ✅ PowerFlow: Bus table parsing (0ms)
   ✅ PowerFlow: Branch table parsing (0ms)
   ✅ PowerFlow: Recommendations generation (0ms)

📦 N1ContingencyAnalysisSkill
   ✅ N-1: Skill initialization (0ms)
   ✅ N-1: Element identification (0ms)
   ✅ N-1: Limit merging (0ms)
   ✅ N-1: Severity score calculation (0ms)
   ✅ N-1: Summary generation (0ms)
   ✅ N-1: Weakness analysis (0ms)

📦 BatchSimulationEnhancedSkill
   ✅ Batch: Skill initialization (0ms)
   ✅ Batch: Result aggregation (0ms)
   ✅ Batch: Sensitivity analysis (0ms)
   ✅ Batch: Severity score calculation (0ms)
   ✅ Batch: Report generation (0ms)
   ✅ Batch: CSV export (0ms)

═════════════════════════════════════════════════════════════════
测试结果汇总
═════════════════════════════════════════════════════════════════
✅ 通过: 17
❌ 失败: 0
📊 总计: 17
```

## 开发调试

```bash
# 开启调试模式
export DEBUG=cloudpss:*
CLOUDPSS_TOKEN=<your-token> node examples/test-connection.js

# 测试 Python 桥接
CLOUDPSS_TOKEN=<your-token> python3 python/cloudpss_wrapper.py fetch_model model/CloudPSS/IEEE3
```

## 项目结构

```
cloudpss-skills/
├── src/
│   ├── index.js                    # 主入口
│   ├── api/
│   │   ├── client.js              # API客户端
│   │   └── python-bridge.js       # Python桥接
│   └── skills/
│       ├── create.js              # 算例创建
│       ├── manage.js              # 基础管理
│       ├── extract.js             # 结果提取
│       ├── configure.js           # 参数配置
│       ├── analyze.js             # 结果分析
│       ├── report.js              # 报告生成
│       ├── analyze-n1.js          # N-1扫描(基础)
│       ├── analyze-harmonic.js    # 谐波分析
│       ├── batch-simulation.js    # 批量仿真(基础)
│       ├── model-overview.js      # 算例概览
│       ├── analyze-component.js   # 元件分析
│       ├── topology-analysis.js   # 拓扑分析
│       ├── power-flow-analysis.js # 潮流分析 ⭐
│       ├── n1-contingency-analysis.js # N-1扫描增强 ⭐
│       ├── batch-simulation-enhanced.js # 批量仿真增强 ⭐
│       └── model-management-enhanced.js # 算例管理增强 ⭐
├── tests/
│   ├── unit-new-skills.test.js    # 单元测试
│   └── e2e-new-skills.test.js     # 端到端测试
├── examples/                       # 使用示例
├── python/
│   └── cloudpss_wrapper.py        # Python SDK封装
└── README.md
```

## 许可证

MIT
