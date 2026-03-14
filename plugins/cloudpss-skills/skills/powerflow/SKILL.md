---
name: powerflow
description: CloudPSS 潮流计算与分析 - 执行潮流仿真并获取节点电压、支路功率结果
argument-hint: "<rid | rid + jobIndex + configIndex>"
---

<Purpose>
执行 CloudPSS 潮流计算并分析结果，支持获取节点电压、支路功率、发电机出力、负荷结果和越限检查。
</Purpose>

<Use_When>
- 用户请求运行潮流计算、潮流仿真
- 需要获取节点电压、支路功率数据
- 检查电压越限、线路过载情况
- 生成潮流分析报告
</Use_When>

<Do_Not_Use_When>
- 需要 EMT 电磁暂态仿真（使用 stability 技能）
- 需要 N-1 安全扫描（使用 n1-analysis 技能）
- 本地模型已满足需求（优先使用本地模式）
</Do_Not_Use_When>

<Execution_Flow>
1. 验证 rid 格式（model/owner/key）
2. 调用 runPowerFlow(rid, jobIndex, configIndex) 执行仿真
3. 等待仿真完成（waitForCompletion）
4. 根据用户需求获取结果：
   - getBusVoltages(jobId) - 节点电压
   - getBranchFlows(jobId) - 支路功率
   - getGeneratorOutputs(jobId) - 发电机出力
   - getLoadResults(jobId) - 负荷结果
   - checkViolations(jobId, limits) - 越限检查
5. 输出结构化结果
</Execution_Flow>

<Examples>
```
# 执行潮流计算
/powerflow model/holdme/IEEE39

# 指定计算方案
/powerflow model/holdme/IEEE39 0 1

# 获取电压结果后检查越限
/powerflow model/holdme/IEEE39 --check-violations
```
</Examples>

<Output_Format>
```json
{
  "jobId": "job_xxx",
  "status": "completed",
  "voltages": { "buses": [...], "summary": {...} },
  "branchFlows": { "branches": [...], "summary": {...} },
  "violations": { "hasViolations": false, ... }
}
```
</Output_Format>

<Dependencies>
- src/skills/power-flow-analysis.js - 后端实现
- src/client.js - CloudPSS API 客户端
</Dependencies>
