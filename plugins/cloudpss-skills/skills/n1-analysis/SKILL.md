---
name: cloudpss:n1-analysis
description: CloudPSS N-1 安全扫描 - 预想故障分析、电压越限和线路过载检查
argument-hint: "<rid | --full | --element=line|transformer|generator>"
---

<Purpose>
执行 N-1 预想故障扫描分析，逐个开断系统元件（线路、变压器、发电机）进行潮流计算，识别电压越限和线路过载，评估系统安全性。
</Purpose>

<Use_When>
- 用户请求 N-1 扫描、N-1 安全分析、预想故障分析
- 需要检查系统安全性、识别薄弱环节
- 调度运行方式分析、安全评估
- 生成 N-1 分析报告
</Use_When>

<Do_Not_Use_When>
- 仅需要单次潮流计算（使用 cloudpss:powerflow 技能）
- 需要 EMT 电磁暂态仿真（使用 stability 技能）
- 需要批量多场景对比（使用 cloudpss:batch-simulation 技能）
</Do_Not_Use_When>

<Execution_Flow>
1. 验证 rid 格式（model/owner/key）
2. 运行基准潮流计算（base case）
3. 获取系统拓扑和元件列表
4. 识别可扫描元件（线路、变压器、发电机）
5. 逐个开断元件并执行潮流计算
6. 检查每个 N-1 工况的越限情况
7. 严重程度评估和排序
8. 生成分析报告
</Execution_Flow>

<Capabilities>
- **基准潮流**: 运行正常方式潮流计算
- **元件识别**: 自动识别线路、变压器、发电机
- **N-1 扫描**: 逐个开断元件进行仿真
- **越限检查**:
  - 电压越限（低电压、过电压）
  - 线路过载（警告、严重）
- **严重程度评分**: 综合评估 N-1 工况影响
- **报告生成**: 调度友好的分析报告
</Capabilities>

<Examples>
```
# 执行完整 N-1 扫描
/cloudpss:n1-analysis model/holdme/IEEE39

# 仅扫描线路
/cloudpss:n1-analysis model/holdme/IEEE39 --element=line

# 扫描线路和变压器
/cloudpss:n1-analysis model/holdme/IEEE39 --element=line,transformer

# 跳过基准工况
/cloudpss:n1-analysis model/holdme/IEEE39 --skip-base-case
```
</Examples>

<Output_Format>
```json
{
  "rid": "model/holdme/IEEE39",
  "timestamp": "2024-03-14T10:00:00Z",
  "baseCase": { "jobId": "xxx", "status": "success", "violations": {...} },
  "contingencies": [
    {
      "element": "线路 1-2",
      "type": "line",
      "status": "success",
      "violations": {
        "hasViolations": true,
        "voltageViolations": [{ "bus": "Bus3", "type": "undervoltage", "value": 0.92 }],
        "lineOverloads": [{ "branch": "Line2-3", "loading": 0.95 }]
      },
      "severityScore": 15
    }
  ],
  "summary": {
    "totalElements": 10,
    "successfulScans": 9,
    "failedScans": 1,
    "criticalContingencies": 2,
    "topCritical": [...]
  }
}
```
</Output_Format>

<Dependencies>
- src/skills/n1-contingency-analysis.js - 后端实现
- src/skills/power-flow-analysis.js - 潮流计算依赖
- src/client.js - CloudPSS API 客户端
</Dependencies>
