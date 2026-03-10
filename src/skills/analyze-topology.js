/**
 * Analyze Topology Skill - 电力系统拓扑分析技能
 *
 * 用于分析电力系统算例的拓扑结构，包括：
 * - 连接矩阵生成
 * - 连通性分析（电气岛/子网检测）
 * - 路径分析
 * - 度数统计
 * - 可视化数据生成
 *
 * 基于图论算法和 CloudPSS Python SDK 的网络分析功能
 */

const { execPython } = require('../api/python-bridge');

class AnalyzeTopologySkill {
  constructor(client) {
    this.client = client;
  }

  /**
   * 完整拓扑分析
   *
   * @param {string} rid - 项目 rid，格式为 'model/owner/key'
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 拓扑分析报告
   */
  async analyze(rid, options = {}) {
    const {
      includeMatrix = true,
      includeConnectivity = true,
      includePaths = false,
      includeVisualization = true,
      implementType = 'emtp'
    } = options;

    // 获取拓扑数据
    const topologyData = await this.client.getTopology(rid, implementType);

    const result = {
      rid,
      timestamp: new Date().toISOString(),
      type: 'topology_analysis',
      summary: {},
      matrix: null,
      connectivity: null,
      paths: null,
      visualization: null
    };

    // 提取组件和连接信息
    const components = this._extractComponents(topologyData);
    const connections = this._extractConnections(topologyData);

    // 连接矩阵分析
    if (includeMatrix) {
      result.matrix = await this._generateConnectionMatrix(components, connections);
    }

    // 连通性分析
    if (includeConnectivity) {
      result.connectivity = await this._analyzeConnectivity(components, connections);
      result.summary.islandCount = result.connectivity.islands.length;
      result.summary.largestIslandSize = result.connectivity.islands.reduce(
        (max, island) => Math.max(max, island.nodes.length), 0
      );
    }

    // 路径分析（如果指定了起始和终止节点）
    if (includePaths && options.sourceNode && options.targetNode) {
      result.paths = await this._findPath(
        components,
        connections,
        options.sourceNode,
        options.targetNode
      );
    }

    // 度数统计
    result.summary = {
      ...result.summary,
      nodeCount: components.length,
      connectionCount: connections.length,
      degreeStats: this._calculateDegreeStats(components, connections)
    };

    // 可视化数据
    if (includeVisualization) {
      result.visualization = this._generateVisualizationData(components, connections);
    }

    return result;
  }

  /**
   * 从拓扑数据中提取组件（节点）
   */
  _extractComponents(topologyData) {
    const components = [];
    const raw = topologyData?.raw || {};
    const comps = raw.components || {};

    // 提取所有组件
    for (const [key, comp] of Object.entries(comps)) {
      // 识别电气节点（母线、连接点等）
      const definition = comp.definition || '';
      const label = comp.label || '';
      const pins = comp.pins || {};

      // 判断是否为电气节点
      const isElectricalNode =
        definition.toLowerCase().includes('bus') ||
        label.toLowerCase().includes('bus') ||
        label.includes('母线') ||
        Object.keys(pins).length > 0;

      if (isElectricalNode) {
        components.push({
          id: key,
          label: label || key,
          type: this._classifyComponent(comp),
          pins: pins,
          definition
        });
      }
    }

    return components;
  }

  /**
   * 从拓扑数据中提取连接关系
   */
  _extractConnections(topologyData) {
    const connections = [];
    const raw = topologyData?.raw || {};
    const comps = raw.components || {};
    const mappings = raw.mappings || {};

    // 从 mapping 信息中提取连接
    // in mappings 表示输入连接，out mappings 表示输出连接
    const inMappings = mappings.in || {};
    const outMappings = mappings.out || {};

    // 构建 pin 到 component 的映射
    const pinToComponent = {};
    for (const [compKey, comp] of Object.entries(comps)) {
      const pins = comp.pins || {};
      for (const [pinId, nodeRef] of Object.entries(pins)) {
        if (!pinToComponent[nodeRef]) {
          pinToComponent[nodeRef] = [];
        }
        pinToComponent[nodeRef].push({
          component: compKey,
          pin: pinId
        });
      }
    }

    // 基于共享节点引用建立连接
    const processed = new Set();
    for (const [nodeRef, comps] of Object.entries(pinToComponent)) {
      if (comps.length > 1) {
        // 多个元件连接到同一节点
        for (let i = 0; i < comps.length; i++) {
          for (let j = i + 1; j < comps.length; j++) {
            const connKey = [comps[i].component, comps[j].component].sort().join('-');
            if (!processed.has(connKey)) {
              processed.add(connKey);
              connections.push({
                id: `conn_${nodeRef}`,
                source: comps[i].component,
                sourcePin: comps[i].pin,
                target: comps[j].component,
                targetPin: comps[j].pin,
                nodeRef
              });
            }
          }
        }
      }
    }

    return connections;
  }

  /**
   * 分类组件类型
   */
  _classifyComponent(comp) {
    const definition = (comp.definition || '').toLowerCase();
    const label = (comp.label || '').toLowerCase();

    if (definition.includes('bus') || label.includes('bus') || label.includes('母线')) {
      return 'bus';
    }
    if (definition.includes('line') || label.includes('line') || label.includes('线路')) {
      return 'line';
    }
    if (definition.includes('transformer') || label.includes('transformer') || label.includes('变压器')) {
      return 'transformer';
    }
    if (definition.includes('generator') || label.includes('generator') || label.includes('发电机')) {
      return 'generator';
    }
    if (definition.includes('load') || label.includes('load') || label.includes('负荷')) {
      return 'load';
    }

    return 'other';
  }

  /**
   * 生成连接矩阵（节点 - 支路关联矩阵）
   */
  async _generateConnectionMatrix(components, connections) {
    const nodeIndex = new Map();
    components.forEach((comp, idx) => {
      nodeIndex.set(comp.id, idx);
    });

    const matrixSize = components.length;
    const adjacencyMatrix = Array(matrixSize).fill(null).map(() => Array(matrixSize).fill(0));

    // 填充邻接矩阵
    for (const conn of connections) {
      const sourceIdx = nodeIndex.get(conn.source);
      const targetIdx = nodeIndex.get(conn.target);
      if (sourceIdx !== undefined && targetIdx !== undefined) {
        adjacencyMatrix[sourceIdx][targetIdx] = 1;
        adjacencyMatrix[targetIdx][sourceIdx] = 1;
      }
    }

    return {
      type: 'adjacency',
      size: matrixSize,
      nodes: components.map(c => ({ id: c.id, label: c.label, type: c.type })),
      matrix: adjacencyMatrix,
      sparse: this._toSparseMatrix(adjacencyMatrix)
    };
  }

  /**
   * 转换为稀疏矩阵表示
   */
  _toSparseMatrix(matrix) {
    const sparse = [];
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        if (matrix[i][j] !== 0) {
          sparse.push({ row: i, col: j, value: matrix[i][j] });
        }
      }
    }
    return sparse;
  }

  /**
   * 连通性分析 - 检测电气岛
   */
  async _analyzeConnectivity(components, connections) {
    const nodeIndex = new Map();
    components.forEach((comp, idx) => {
      nodeIndex.set(comp.id, idx);
    });

    // 构建邻接表
    const adjList = new Map();
    components.forEach(comp => {
      adjList.set(comp.id, []);
    });

    for (const conn of connections) {
      adjList.get(conn.source).push(conn.target);
      adjList.get(conn.target).push(conn.source);
    }

    // DFS 查找连通分量（电气岛）
    const visited = new Set();
    const islands = [];

    for (const comp of components) {
      if (!visited.has(comp.id)) {
        const island = this._dfs(comp.id, adjList, visited, components);
        islands.push({
          id: `island_${islands.length}`,
          nodes: island,
          size: island.length
        });
      }
    }

    // 计算连通性指标
    const connectivity = {
      islandCount: islands.length,
      islands,
      isFullyConnected: islands.length === 1,
      density: connections.length / (components.length * (components.length - 1) / 2)
    };

    return connectivity;
  }

  /**
   * DFS 遍历查找连通分量
   */
  _dfs(nodeId, adjList, visited, components) {
    const component = [];
    const stack = [nodeId];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!visited.has(current)) {
        visited.add(current);
        const comp = components.find(c => c.id === current);
        if (comp) {
          component.push({
            id: comp.id,
            label: comp.label,
            type: comp.type
          });
        }
        for (const neighbor of adjList.get(current)) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }

    return component;
  }

  /**
   * 查找两点之间的路径
   */
  async _findPath(components, connections, sourceId, targetId) {
    const nodeIndex = new Map();
    components.forEach((comp, idx) => {
      nodeIndex.set(comp.id, idx);
    });

    // 构建邻接表
    const adjList = new Map();
    components.forEach(comp => {
      adjList.set(comp.id, []);
    });

    for (const conn of connections) {
      adjList.get(conn.source).push({
        target: conn.target,
        connection: conn
      });
      adjList.get(conn.target).push({
        target: conn.source,
        connection: conn
      });
    }

    // BFS 查找最短路径
    const queue = [[sourceId]];
    const visited = new Set([sourceId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === targetId) {
        return {
          found: true,
          source: sourceId,
          target: targetId,
          path: path.map(id => {
            const comp = components.find(c => c.id === id);
            return { id: comp.id, label: comp.label, type: comp.type };
          }),
          length: path.length - 1
        };
      }

      for (const { target } of adjList.get(current)) {
        if (!visited.has(target)) {
          visited.add(target);
          queue.push([...path, target]);
        }
      }
    }

    return {
      found: false,
      source: sourceId,
      target: targetId,
      message: '无电气路径连接'
    };
  }

  /**
   * 计算度数统计
   */
  _calculateDegreeStats(components, connections) {
    const degreeMap = new Map();
    components.forEach(comp => {
      degreeMap.set(comp.id, 0);
    });

    for (const conn of connections) {
      degreeMap.set(conn.source, (degreeMap.get(conn.source) || 0) + 1);
      degreeMap.set(conn.target, (degreeMap.get(conn.target) || 0) + 1);
    }

    const degrees = Array.from(degreeMap.values());
    const maxDegree = Math.max(...degrees, 0);
    const minDegree = Math.min(...degrees, 0);
    const avgDegree = degrees.reduce((a, b) => a + b, 0) / (degrees.length || 1);

    // 找出关键节点（高度数节点）
    const criticalNodes = [];
    for (const [nodeId, degree] of degreeMap.entries()) {
      if (degree >= maxDegree * 0.8 && degree > 2) {
        const comp = components.find(c => c.id === nodeId);
        if (comp) {
          criticalNodes.push({
            id: comp.id,
            label: comp.label,
            type: comp.type,
            degree
          });
        }
      }
    }

    return {
      maxDegree: maxDegree,
      minDegree: minDegree,
      avgDegree: parseFloat(avgDegree.toFixed(2)),
      totalDegree: degrees.reduce((a, b) => a + b, 0),
      criticalNodes: criticalNodes.sort((a, b) => b.degree - a.degree).slice(0, 5)
    };
  }

  /**
   * 生成可视化数据（用于 D3.js 等）
   */
  _generateVisualizationData(components, connections) {
    // 节点类型到颜色的映射
    const typeColors = {
      bus: '#3b82f6',      // blue
      line: '#10b981',     // green
      transformer: '#f59e0b', // amber
      generator: '#ef4444',   // red
      load: '#8b5cf6',     // purple
      other: '#6b7280'     // gray
    };

    // 节点大小基于度数
    const degreeMap = new Map();
    connections.forEach(conn => {
      degreeMap.set(conn.source, (degreeMap.get(conn.source) || 0) + 1);
      degreeMap.set(conn.target, (degreeMap.get(conn.target) || 0) + 1);
    });

    const nodes = components.map(comp => ({
      id: comp.id,
      label: comp.label,
      type: comp.type,
      value: degreeMap.get(comp.id) || 0,
      color: typeColors[comp.type] || typeColors.other
    }));

    const links = connections.map(conn => ({
      source: conn.source,
      target: conn.target,
      value: 1
    }));

    return {
      nodes,
      links,
      nodeTypes: Object.keys(typeColors),
      metadata: {
        nodeCount: nodes.length,
        linkCount: links.length
      }
    };
  }

  /**
   * 导出拓扑数据为 JSON 文件
   *
   * @param {string} rid - 项目 rid
   * @param {string} outputPath - 输出文件路径
   * @param {Object} options - 导出选项
   * @returns {Promise<Object>} 导出结果
   */
  async export(rid, outputPath, options = {}) {
    const analysis = await this.analyze(rid, options);

    const fs = require('fs');
    const path = require('path');

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));

    return {
      success: true,
      path: outputPath,
      nodeCount: analysis.summary.nodeCount,
      connectionCount: analysis.summary.connectionCount
    };
  }

  /**
   * 从本地 JSON 文件分析拓扑
   *
   * @param {string} filePath - JSON 文件路径
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 拓扑分析报告
   */
  async analyzeFromFile(filePath, options = {}) {
    const fs = require('fs');

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在：${filePath}`);
    }

    const topologyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // 从文件中读取的数据结构是 { model_info, topology: { raw, analysis }, ... }
    // 需要传递给 _extractComponents 的是 topologyData.topology 或者 topologyData
    const topologyRoot = topologyData.topology || topologyData;

    const result = {
      file: filePath,
      timestamp: new Date().toISOString(),
      type: 'topology_analysis',
      summary: {},
      matrix: null,
      connectivity: null,
      paths: null,
      visualization: null
    };

    // 提取组件和连接信息
    const components = this._extractComponents(topologyRoot);
    const connections = this._extractConnections(topologyRoot);

    // 连接矩阵分析
    if (options.includeMatrix !== false) {
      result.matrix = await this._generateConnectionMatrix(components, connections);
    }

    // 连通性分析
    if (options.includeConnectivity !== false) {
      result.connectivity = await this._analyzeConnectivity(components, connections);
      result.summary.islandCount = result.connectivity.islands.length;
      result.summary.largestIslandSize = result.connectivity.islands.reduce(
        (max, island) => Math.max(max, island.nodes.length), 0
      );
    }

    // 度数统计
    result.summary = {
      ...result.summary,
      nodeCount: components.length,
      connectionCount: connections.length,
      degreeStats: this._calculateDegreeStats(components, connections)
    };

    // 可视化数据
    if (options.includeVisualization !== false) {
      result.visualization = this._generateVisualizationData(components, connections);
    }

    return result;
  }
}

module.exports = AnalyzeTopologySkill;
