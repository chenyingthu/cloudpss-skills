# 本地文件策略分析

## 概述

本文档分析哪些 CloudPSS Skills 可以使用本地 dump 文件代替 API 调用，以减少对 CloudPSS API 的依赖。

## 技能分类

### ✅ 可以完全使用本地文件（无需API）

这些技能只需要静态拓扑数据，可以从 dump 文件获取：

| 技能 | 文件 | 主要功能 | 数据需求 |
|------|------|----------|----------|
| **拓扑分析** | `topology-analysis.js` | 网络拓扑结构分析 | 组件列表、pins连接 |
| **短路计算** | `short-circuit.js` | 三相/单相短路电流计算 | 组件参数、拓扑连接 |
| **稳定分析**（诊断部分） | `stability-analysis.js` | 潮流收敛性诊断 | 组件参数、拓扑连接 |
| **元件分析** | `analyze-component.js` | 元件参数统计 | 组件列表 |
| **模型概览** | `model-overview.js` | 模型统计信息 | 组件列表 |

### ⚠️ 需要混合模式（部分功能可本地化）

这些技能部分功能需要实时计算，部分可以使用本地数据：

| 技能 | 可本地化功能 | 需要API的功能 |
|------|-------------|--------------|
| **稳定性分析** | 潮流收敛性诊断 | 电压稳定裕度分析（需要潮流计算） |
| **N-1扫描** | 拓扑分析、元件识别 | 潮流计算、越限检查 |
| **高级分析** | 断面定义、参数配置 | EMT仿真、时序潮流 |
| **批量计算** | 场景配置 | 潮流计算、结果获取 |

### ❌ 必须依赖API（无法本地化）

这些技能需要实时仿真计算或模型修改：

| 技能 | 原因 |
|------|------|
| **潮流分析** | 需要运行潮流计算 |
| **EMT仿真** | 需要运行电磁暂态仿真 |
| **模型编辑** | 需要修改云端模型 |
| **模型创建** | 需要创建云端项目 |
| **可视化** | 需要实时数据生成图表 |

## 现有本地文件支持

### 已实现的方法

#### 1. `topology-analysis.js`
```javascript
// 从本地文件加载算例数据 (支持gzip压缩的YAML)
loadFromLocalFile(filePath) {
  // 支持 .gz, .json, .yaml 格式
}

// 从导出数据中提取拓扑信息
extractTopologyFromDump(data) {
  // 解析 dump 文件中的组件和连接
}
```

#### 2. `short-circuit.js`
```javascript
// 从 dump 文件解析元件数据
_parseDumpFile(dumpData) {
  // 支持官方 dump 格式: revision.implements.diagram.cells
}
```

### Dump 文件格式

CloudPSS 官方 dump 格式：
```json
{
  "revision": {
    "implements": {
      "diagram": {
        "cells": {
          "component_key": {
            "id": "...",
            "label": "...",
            "definition": "...",
            "args": {...},
            "pins": {"0": "node_id", "1": "node_id"}
          }
        }
      }
    }
  }
}
```

## 推荐实现方案

### 方案1: 统一本地文件加载器

创建 `src/utils/local-loader.js`:

```javascript
class LocalLoader {
  /**
   * 加载本地 dump 文件
   * @param {string} filePath - 文件路径 (.json, .yaml, .gz)
   * @returns {Object} 解析后的数据
   */
  load(filePath) {
    // 支持 JSON/YAML/gzip 格式
    // 统一转换为标准格式
  }

  /**
   * 从 dump 数据提取组件列表
   * @param {Object} dumpData - dump 文件内容
   * @returns {Object} 标准化的组件字典
   */
  extractComponents(dumpData) {
    // 支持 CloudPSS 官方格式
    // 支持其他常见格式
  }

  /**
   * 缓存已加载的数据
   */
  cache = new Map();
}
```

### 方案2: 技能级别的本地模式

为支持本地模式的技能添加 `localMode` 选项：

```javascript
class ShortCircuitSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.localData = options.localData; // 本地数据
    this.localMode = !!options.localData; // 本地模式标志
  }

  async calculateThreePhase(rid, config) {
    let components;
    if (this.localMode) {
      components = this.localData;
    } else {
      const topologyData = await this.client.getTopology(rid, 'powerFlow');
      components = topologyData.components;
    }
    // 后续计算相同...
  }
}
```

### 方案3: 缓存策略

实现智能缓存减少 API 调用：

```javascript
class CachedCloudPSSClient {
  constructor(client, cacheDir = './cache') {
    this.client = client;
    this.cacheDir = cacheDir;
  }

  async getTopology(rid, type) {
    const cacheKey = `${rid}_${type}`;
    const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

    // 检查缓存
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile));
    }

    // 调用 API
    const result = await this.client.getTopology(rid, type);

    // 写入缓存
    fs.writeFileSync(cacheFile, JSON.stringify(result));
    return result;
  }
}
```

## 使用示例

### 使用本地文件进行短路计算

```javascript
const { CloudPSSSkills } = require('cloudpss-skills');
const fs = require('fs');

// 加载本地 dump 文件
const dumpData = JSON.parse(fs.readFileSync('ieee39_dump.json', 'utf-8'));

// 创建使用本地数据的技能实例
const skills = new CloudPSSSkills({
  localData: dumpData  // 自动启用本地模式
});

// 执行短路计算（无需API调用）
const result = await skills.shortCircuit.calculateThreePhase(null, {
  buses: ['Bus-1', 'Bus-5']
});
```

### 使用缓存模式

```javascript
const skills = new CloudPSSSkills({
  cacheEnabled: true,
  cacheDir: './cloudpss_cache'
});

// 首次调用会请求API并缓存
const result1 = await skills.shortCircuit.calculateThreePhase(rid);

// 后续调用使用缓存
const result2 = await skills.shortCircuit.calculateThreePhase(rid);
```

## 实施优先级

1. **高优先级** - 实现缓存机制（收益最大）
2. **中优先级** - 统一本地文件加载器
3. **低优先级** - 各技能独立支持本地模式

## 测试建议

1. 创建标准测试 dump 文件
2. 编写本地模式单元测试
3. 对比本地计算与 API 计算结果