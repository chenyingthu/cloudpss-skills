# 拓扑分析技能 (Topology Analysis Skill)

## 功能概述

拓扑分析技能用于分析电力系统算例的拓扑结构，提供以下功能：

- **连接矩阵**: 生成节点 - 支路关联矩阵（邻接矩阵）
- **连通性分析**: 检测电气岛/子网，计算网络密度
- **路径分析**: 计算两点之间的电气路径（BFS 最短路径）
- **度数统计**: 每个节点的连接支路数，识别关键节点
- **可视化数据**: 生成可用于 D3.js 等库可视化的数据

## 使用方法

### 1. 从文件分析拓扑

```javascript
const { CloudPSSSkills } = require('./src/index');

const skills = new CloudPSSSkills({
  token: process.env.CLOUDPSS_TOKEN
});

// 从 JSON 文件分析拓扑
const result = await skills.topology.analyzeFromFile('/path/to/model-structure.json', {
  includeMatrix: true,        // 包含连接矩阵
  includeConnectivity: true,  // 包含连通性分析
  includePaths: false,        // 包含路径分析（需要指定 sourceNode 和 targetNode）
  includeVisualization: true  // 包含可视化数据
});

console.log('节点数:', result.summary.nodeCount);
console.log('连接数:', result.summary.connectionCount);
console.log('电气岛数量:', result.summary.islandCount);
```

### 2. 从 CloudPSS API 分析拓扑

```javascript
// 从 CloudPSS 平台获取并分析拓扑
const result = await skills.topology.analyze('model/owner/key', {
  implementType: 'emtp',  // 拓扑实现类型：emtp, sfemt, powerFlow
  includeMatrix: true,
  includeConnectivity: true,
  includeVisualization: true
});
```

### 3. 导出分析结果

```javascript
// 导出分析结果为 JSON 文件
await skills.topology.export(
  '/path/to/model-structure.json',
  '/output/path/topology-analysis.json',
  { includeMatrix: true, includeConnectivity: true }
);
```

## 输出数据结构

```typescript
interface TopologyAnalysisResult {
  file: string;                    // 源文件路径（如果从文件分析）
  timestamp: string;               // 分析时间戳
  type: 'topology_analysis';

  summary: {
    nodeCount: number;             // 节点数量
    connectionCount: number;       // 连接数量
    islandCount: number;           // 电气岛数量
    largestIslandSize: number;     // 最大电气岛大小
    degreeStats: {
      maxDegree: number;           // 最大度数
      minDegree: number;           // 最小度数
      avgDegree: number;           // 平均度数
      totalDegree: number;         // 总度数
      criticalNodes: Array<{       // 关键节点列表
        id: string;
        label: string;
        type: string;
        degree: number;
      }>;
    }
  };

  matrix: {
    type: 'adjacency';
    size: number;
    nodes: Array<{ id: string; label: string; type: string }>;
    matrix: number[][];            // 邻接矩阵
    sparse: Array<{ row: number; col: number; value: number }>;
  };

  connectivity: {
    islandCount: number;
    islands: Array<{
      id: string;
      nodes: Array<{ id: string; label: string; type: string }>;
      size: number;
    }>;
    isFullyConnected: boolean;
    largestIslandSize: number;
    density: number;               // 网络密度
  };

  visualization: {
    nodes: Array<{
      id: string;
      label: string;
      type: string;
      value: number;               // 度数值
      color: string;               // 节点颜色（按类型）
    }>;
    links: Array<{
      source: string;
      target: string;
      value: number;
    }>;
    nodeTypes: string[];
    metadata: {
      nodeCount: number;
      linkCount: number;
    }
  };
}
```

## 组件分类

拓扑分析技能自动识别并分类以下类型的电力系统组件：

| 类型 | 识别关键词 | 颜色 |
|------|-----------|------|
| bus (母线) | bus, 母线 | #3b82f6 (蓝) |
| line (线路) | line, 线路 | #10b981 (绿) |
| transformer (变压器) | transformer, 变压器 | #f59e0b (橙) |
| generator (发电机) | generator, 发电机 | #ef4444 (红) |
| load (负荷) | load, 负荷 | #8b5cf6 (紫) |
| other (其他) | - | #6b7280 (灰) |

## 算法说明

### 连通性分析
使用深度优先搜索 (DFS) 算法识别连通分量（电气岛）：
1. 构建邻接表
2. 遍历所有未访问节点，每次 DFS 遍历一个连通分量
3. 计算网络密度：`连接数 / 最大可能连接数`

### 路径分析
使用广度优先搜索 (BFS) 算法查找最短路径：
1. 从源节点开始 BFS 遍历
2. 记录路径直到找到目标节点
3. 返回最短路径和长度

### 度数统计
- 度数：连接到该节点的支路数量
- 关键节点：度数 >= 最大度数 * 0.8 且 > 2 的节点
- 关键节点通常是电网中的枢纽变电站或重要母线

## 测试

运行测试用例：

```bash
npm test -- topology-analysis.test.js
```

## 示例输出

```
=== IEEE3 拓扑分析结果 ===

系统规模:
  节点数：75
  连接数：171
  电气岛数量：8
  最大岛大小：68
  网络密度：0.0616

度数统计:
  最大度数：15
  最小度数：0
  平均度数：4.56
  总度数：342

关键节点 (Top 5):
  1. STEAM_TUR_1-4 - 类型：other - 度数：15
  2. STEAM_TUR_1-2 - 类型：other - 度数：15
  3. STEAM_TUR_1-3 - 类型：other - 度数：15
  4. STEAM_GOV_1-4 - 类型：other - 度数：12
  5. newTransformer_3p2w-1 - 类型：transformer - 度数：12
```

## Python Bridge API

拓扑分析功能也通过 Python Bridge 提供：

```python
# 在 Python 中直接调用
from cloudpss_wrapper import analyze_topology_from_file

result = analyze_topology_from_file(
    '/path/to/model-structure.json',
    options={
        'include_matrix': True,
        'include_connectivity': True,
        'include_visualization': True
    }
)
```

## 依赖

- Node.js >= 14
- CloudPSS Python SDK
- NumPy (用于矩阵运算)

## 作者

AI-DPSLab (AI Digital Power System Lab)

## 许可证

MIT
