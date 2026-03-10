# 基准测试场景定义

## 场景 1: 简单功能开发 - 添加 API 方法封装

### 任务描述
为 CloudPSS Skills 添加一个新的发电机参数配置方法 `configureGeneratorWithLimits()`

### 单 Agent 基线测试

```
执行模式：顺序执行
预期步骤:
1. Read: 查看现有 configureGenerator 实现
2. Read: 查看参数格式定义
3. Edit: 添加新方法
4. Bash: 运行测试验证
5. Edit: 修复问题 (如有)
6. Edit: 更新文档

预期指标:
- 时间：5-10 分钟
- 迭代次数：1-2 次
- 工具调用：6-8 次
```

### 多 Agent 测试

```
执行模式：并行分解
任务分解:
├─ Task A: Researcher - 分析现有 API 模式 (Read 并行)
├─ Task B: Engineer - 实现新方法
└─ Task C: Engineer - 编写测试用例

并行执行:
- T+0s: 同时启动 Task A 和 Task C 准备
- T+30s: Task A 完成，Task B 开始实现
- T+120s: Task B 完成，开始测试
- T+180s: 全部完成

预期指标:
- 时间：3-5 分钟
- 迭代次数：1 次
- 工具调用：8-10 次 (并行)
```

### 评估标准
| 指标 | 单 Agent 目标 | 多 Agent 目标 |
|------|--------------|--------------|
| 完成时间 | 5-10 min | 3-5 min |
| 代码质量 | 3.5/5 | 4.0/5 |
| 测试覆盖 | 80% | 85% |

---

## 场景 2: 模块重构 - 增强异常处理

### 任务描述
为结果提取模块 (Extract) 添加完善的异常处理和错误恢复机制

### 单 Agent 基线测试

```
执行模式：顺序执行
预期步骤:
1. Read: 分析现有 extract 模块结构
2. Read: 查看错误处理模式
3. Design: 设计异常处理架构
4. Edit: 修改 extractComponents
5. Edit: 修改 extractTopology
6. Edit: 修改 extractBusVoltages
7. Edit: 修改 extractLineFlows
8. Edit: 添加错误类型定义
9. Bash: 运行测试
10. Edit: 修复问题
11. Edit: 更新文档

预期指标:
- 时间：15-20 分钟
- 迭代次数：2-3 次
- 工具调用：12-15 次
```

### 多 Agent 测试

```
执行模式：并行分解 + 交叉验证
任务分解:
├─ Task A: Scientist - 设计异常处理架构
├─ Task B: Researcher - 分析现有错误模式
├─ Task C: Engineer - 实现基础错误类型
├─ Task D: Engineer - 重构 extract 方法 (并行)
│   ├─ D1: extractComponents
│   ├─ D2: extractTopology
│   └─ D3: extractBusVoltages/extractLineFlows
└─ Task E: Engineer - 编写测试用例

并行执行:
- T+0s: Task A + Task B 同步启动
- T+60s: Task C 基于 Task A/B 开始
- T+120s: Task D1/D2/D3 并行执行
- T+300s: Task E 完成
- T+360s: 交叉验证完成

预期指标:
- 时间：8-12 分钟
- 迭代次数：1-2 次
- 工具调用：15-20 次 (高度并行)
```

### 评估标准
| 指标 | 单 Agent 目标 | 多 Agent 目标 |
|------|--------------|--------------|
| 完成时间 | 15-20 min | 8-12 min |
| 代码质量 | 3.5/5 | 4.5/5 |
| 异常覆盖 | 70% | 90% |
| 架构评分 | 3.0/5 | 4.5/5 |

---

## 场景 3: 新功能开发 - 电力系统稳定性分析模块

### 任务描述
实现完整的电力系统稳定性分析模块，包括：
- 功角稳定性分析 (Rotor Angle Stability)
- 电压稳定性分析 (Voltage Stability)
- 频率稳定性分析 (Frequency Stability)

### 单 Agent 基线测试

```
执行模式：顺序执行
预期步骤:
1. Research: 了解稳定性分析理论
2. Design: 设计模块架构
3. Design: 定义接口
4. Implement: 功角稳定性分析
5. Implement: 电压稳定性分析
6. Implement: 频率稳定性分析
7. Test: 编写单元测试
8. Test: 集成测试
9. Fix: 修复问题
10. Document: 编写文档

预期指标:
- 时间：45-60 分钟
- 迭代次数：3-4 次
- 工具调用：25-35 次
```

### 多 Agent 测试

```
执行模式：多专家会诊 + 并行开发
任务分解:
├─ Task A: Scientist - 稳定性分析理论研究
├─ Task B: PI - 模块架构设计评审
├─ Task C: Researcher - 接口设计
├─ Task D: Engineer - 功角稳定性实现
├─ Task E: Engineer - 电压稳定性实现
├─ Task F: Engineer - 频率稳定性实现
├─ Task G: Engineer - 测试框架搭建
└─ Task H: Scientist - 结果验证方法

并行执行流程:
Phase 1 - 研究与设计 (T+0 ~ T+300s):
  ├─ Task A: 理论研究
  ├─ Task B: 架构评审
  └─ Task C: 接口设计

Phase 2 - 并行实现 (T+300 ~ T+900s):
  ├─ Task D: 功角分析实现
  ├─ Task E: 电压分析实现
  ├─ Task F: 频率分析实现
  └─ Task G: 测试框架

Phase 3 - 验证与集成 (T+900 ~ T+1200s):
  ├─ Task H: 验证方法
  └─ Integration: 集成测试

预期指标:
- 时间：25-35 分钟
- 迭代次数：2 次
- 工具调用：35-45 次 (大规模并行)
```

### 评估标准
| 指标 | 单 Agent 目标 | 多 Agent 目标 |
|------|--------------|--------------|
| 完成时间 | 45-60 min | 25-35 min |
| 代码质量 | 3.5/5 | 4.5/5 |
| 功能完整性 | 85% | 95% |
| 架构评分 | 3.5/5 | 4.5/5 |
| 测试覆盖 | 75% | 90% |

---

## 数据记录模板

### 实验记录表

```markdown
## 实验记录 #001

**日期**: YYYY-MM-DD
**场景**: 场景 X - 描述
**模式**: single-agent | multi-agent

### 时间线
| 时间 | 事件 | Agent | 详情 |
|------|------|-------|------|
| T+0s | 任务启动 | - | - |
| T+Xs | 关键事件 | - | - |
| T+Ys | 任务完成 | - | - |

### 工具使用统计
| 工具 | 调用次数 | 平均耗时 (ms) |
|------|----------|---------------|
| Read | 0 | - |
| Edit | 0 | - |
| Bash | 0 | - |
| TaskCreate | 0 | - |

### 质量评估
- 代码审查评分：X/5
- 测试通过率：XX%
- Bug 数量：X

### 备注
-
```

---

## 执行指南

### 单 Agent 模式执行
1. 明确任务范围和目标
2. 顺序执行每个步骤
3. 记录每个事件的时间戳
4. 完成后填写评估表

### 多 Agent 模式执行
1. 创建任务树 (TaskCreate)
2. 分配 Agent 角色
3. 并行执行独立任务
4. 交叉验证结果
5. 汇总生成报告

### 结果分析
1. 对比时间效率
2. 对比质量指标
3. 分析协作效果
4. 识别改进点
