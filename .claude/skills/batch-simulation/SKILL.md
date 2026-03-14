---
name: cloudpss:batch-simulation
description: CloudPSS 批量仿真 - 多场景并行执行、参数扫描、年度方式计算
argument-hint: "<rid | --scenarios=list | --sweep=param | --annual | --load-growth>"
---

<Purpose>
执行批量潮流仿真和参数扫描，支持多场景对比、参数敏感性分析、年度方式批量计算，提升仿真效率。
</Purpose>

<Use_When>
- 用户请求批量仿真、多场景对比
- 需要参数扫描、敏感性分析
- 年度方式批量计算（丰大、丰小、枯大、枯小）
- 负荷增长扫描、发电机出力扫描
- 生成批量仿真分析报告
</Use_When>

<Do_Not_Use_When>
- 仅需要单次潮流计算（使用 cloudpss:powerflow 技能）
- 需要 EMT 电磁暂态仿真（使用 stability 技能）
- 需要 N-1 安全扫描（使用 cloudpss:n1-analysis 技能）
</Do_Not_Use_When>

<Execution_Flow>
1. 验证 rid 格式（model/owner/key）
2. 根据请求类型构建场景列表
3. 批量执行潮流计算（串行，CloudPSS API 限制）
4. 获取每个场景的电压、支路、越限结果
5. 汇总分析（电压统计、网损统计、严重场景排序）
6. 敏感性分析（参数扫描时）
7. 生成报告
</Execution_Flow>

<Capabilities>
- **多场景批量计算**: 支持任意数量场景
- **参数扫描**: 自动遍历参数值
- **负荷增长扫描**: 80%-120% 负荷水平扫描
- **发电机出力扫描**: 指定发电机出力范围
- **年度方式计算**: 典型日、季节、节假日方式
- **汇总统计**: min/max/avg/std
- **敏感性分析**: 计算敏感性系数
- **严重场景排序**: 按越限严重程度评分
</Capabilities>

<Examples>
```
# 批量计算预定义场景
/cloudpss:batch-simulation model/holdme/IEEE39 --scenarios=scene1,scene2,scene3

# 负荷增长扫描
/cloudpss:batch-simulation model/holdme/IEEE39 --load-growth --start=80 --end=120 --step=5

# 参数扫描
/cloudpss:batch-simulation model/holdme/IEEE39 --sweep=load_factor --values=0.8,0.9,1.0,1.1,1.2

# 年度方式计算
/cloudpss:batch-simulation model/holdme/IEEE39 --annual --type=typical

# 发电机出力扫描
/cloudpss:batch-simulation model/holdme/IEEE39 --gen-sweep=Gen1 --levels=100,150,200,250
```
</Examples>

<Output_Format>
```json
{
  "rid": "model/holdme/IEEE39",
  "totalScenarios": 10,
  "totalExecutionTime": 150000,
  "results": [
    {
      "name": "场景 1",
      "status": "success",
      "executionTime": 15000,
      "summary": {
        "voltage": { "min": 0.96, "max": 1.04, "avg": 0.99 },
        "power": { "totalPLoss": 5.2 },
        "violations": { "hasViolations": false }
      }
    }
  ],
  "aggregated": {
    "successCount": 9,
    "failedCount": 1,
    "successRate": 90.0,
    "voltageStats": { "min": 0.94, "max": 1.06, "avg": 0.99 },
    "lossStats": { "min": 4.8, "max": 6.2, "avg": 5.4 },
    "severityRanking": [...]
  }
}
```
</Output_Format>

<Dependencies>
- src/skills/batch-simulation-enhanced.js - 后端实现
- src/skills/power-flow-analysis.js - 潮流计算依赖
- src/client.js - CloudPSS API 客户端
</Dependencies>
