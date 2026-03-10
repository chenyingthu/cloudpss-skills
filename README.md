# CloudPSS Skills

CloudPSS 电力系统云仿真平台技能库 - 基于 CloudPSS Python SDK 的 Node.js 封装

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

## 功能模块

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

### 运行仿真

```javascript
// 运行潮流计算
const runner = await skills.client.runSimulation(rid, 0, 0);
console.log('任务 ID:', runner.job_id);

// 等待完成
await skills.client.waitForCompletion(runner.job_id);

// 获取结果
const result = await skills.client.getPowerFlowResults(runner.job_id);
console.log('节点电压:', result.buses);
console.log('支路功率:', result.branches);
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

## 开发调试

```bash
# 开启调试模式
export DEBUG=cloudpss:*
CLOUDPSS_TOKEN=<your-token> node examples/test-connection.js

# 测试 Python 桥接
CLOUDPSS_TOKEN=<your-token> python3 python/cloudpss_wrapper.py fetch_model model/CloudPSS/IEEE3
```

## 许可证

MIT
