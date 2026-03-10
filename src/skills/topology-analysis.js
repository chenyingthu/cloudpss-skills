/**
 * Topology Analysis Skill - 拓扑分析技能
 *
 * 用于分析电力系统的网络拓扑结构和元件连接关系
 *
 * 基于 CloudPSS SDK 拓扑 API:
 * - topology.components: 字典，key为canvas路径
 * - 每个component包含: label, definition, args, pins
 * - pins格式: {pin_id: node_id} 表示引脚连接到电气节点
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const yaml = require('js-yaml');

class TopologyAnalysisSkill {
  constructor(client, options = {}) {
    this.client = client;
    this.options = options;
    this.dataFilePath = options.dataFilePath;
  }

  /**
   * 从本地文件加载算例数据 (支持gzip压缩的YAML)
   */
  loadFromLocalFile(filePath) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`文件不存在：${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath);

    // 检测是否为gzip压缩
    if (filePath.endsWith('.gz')) {
      const decompressed = zlib.gunzipSync(content);
      const yamlContent = decompressed.toString();
      return yaml.load(yamlContent);
    }

    // JSON或YAML
    const strContent = content.toString();
    if (strContent.trim().startsWith('{')) {
      return JSON.parse(strContent);
    }
    return yaml.load(strContent);
  }

  /**
   * 从导出数据中提取拓扑信息
   *
   * @param {Object} data - 算例导出数据
   * @returns {Object} 拓扑信息
   */
  extractTopologyFromDump(data) {
    // 支持两种数据格式：
    // 1. dump格式: data.components 是数组
    // 2. model_info格式: data.all_components 是数组
    let components = data.components || data.all_components || [];

    // 如果components为空，尝试从其他位置获取
    if (!components || components.length === 0) {
      // 检查是否有 revision.graphic 等其他结构
      if (data.revision && data.revision.graphic) {
        components = data.revision.graphic;
      }
    }

    // 构建电气节点映射
    const nodeMap = {}; // node_id -> [components]
    const componentList = [];

    for (const comp of components) {
      const pins = comp.pins || {};
      const compInfo = {
        key: comp.key || comp.id,
        label: comp.label,
        definition: comp.definition || comp.impl,
        impl: comp.impl,
        args: comp.args || {},
        pins: pins
      };
      componentList.push(compInfo);

      // 建立节点映射
      for (const [pinId, nodeId] of Object.entries(pins)) {
        if (nodeId && nodeId !== '') {
          if (!nodeMap[nodeId]) {
            nodeMap[nodeId] = [];
          }
          nodeMap[nodeId].push({
            ...compInfo,
            pinId
          });
        }
      }
    }

    return {
      components: componentList,
      nodeMap,
      nodeCount: Object.keys(nodeMap).length
    };
  }

  /**
   * 获取发电机连接节点信息
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 发电机连接信息
   */
  getGeneratorConnections(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath);
    }

    const topology = this.extractTopologyFromDump(data);
    const generators = [];

    for (const comp of topology.components) {
      // 识别发电机
      const label = (comp.label || '').toLowerCase();
      const definition = (comp.definition || comp.impl || '').toLowerCase();

      if (label.includes('syncgen') ||
          definition.includes('syncgen') ||
          definition.includes('generator') ||
          label.includes('gen-') ||
          label.includes('generator')) {

        // 提取连接的电气节点
        const connections = [];
        const pins = comp.pins || {};

        for (const [pinId, nodeId] of Object.entries(pins)) {
          if (nodeId && nodeId !== '') {
            // 查找连接到同一节点的其他元件
            const connectedComponents = (topology.nodeMap[nodeId] || [])
              .filter(c => c.key !== comp.key && c.label !== comp.label)
              .map(c => c.label);

            connections.push({
              pinId,
              nodeId,
              connectedTo: connectedComponents.slice(0, 5) // 限制数量
            });
          }
        }

        // 提取发电机参数
        const args = comp.args || {};
        generators.push({
          key: comp.key,
          label: comp.label,
          definition: comp.definition || comp.impl,
          capacity: args.Smva || args.capacity || args.Pm || null,
          connections,
          mainBus: connections.length > 0 ? connections[0].nodeId : null
        });
      }
    }

    // 按容量排序
    generators.sort((a, b) => (b.capacity || 0) - (a.capacity || 0));

    return {
      found: generators.length > 0,
      count: generators.length,
      generators
    };
  }

  /**
   * 获取系统电压等级
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 电压等级信息
   */
  getVoltageLevels(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath);
    }

    const topology = this.extractTopologyFromDump(data);
    const voltageLevels = {};

    for (const comp of topology.components) {
      // 识别母线/节点
      const label = comp.label || '';
      const definition = comp.definition || comp.impl || '';
      const args = comp.args || {};

      // Bus识别
      if (definition.includes('bus') ||
          label.toLowerCase().includes('bus') ||
          label.includes('母线')) {

        const vBase = args.VBase || args.Vbase || args.voltage || null;

        if (vBase) {
          const level = `${vBase}kV`;
          if (!voltageLevels[level]) {
            voltageLevels[level] = {
              voltageKV: parseFloat(vBase),
              buses: [],
              componentCount: 0
            };
          }
          voltageLevels[level].buses.push({
            key: comp.key,
            label: comp.label,
            name: args.Name || args.name || label
          });
          voltageLevels[level].componentCount++;
        }
      }

      // 变压器也可提供电压等级信息
      if (definition.includes('transformer') || label.toLowerCase().includes('transformer')) {
        const v1 = args.V1 || args.Vprimary || args.V1pu;
        const v2 = args.V2 || args.Vsecondary || args.V2pu;

        if (v1) {
          const level = `${v1}kV`;
          if (!voltageLevels[level]) {
            voltageLevels[level] = {
              voltageKV: parseFloat(v1),
              buses: [],
              componentCount: 0
            };
          }
          voltageLevels[level].componentCount++;
        }
        if (v2 && v2 !== v1) {
          const level = `${v2}kV`;
          if (!voltageLevels[level]) {
            voltageLevels[level] = {
              voltageKV: parseFloat(v2),
              buses: [],
              componentCount: 0
            };
          }
          voltageLevels[level].componentCount++;
        }
      }
    }

    // 转换为数组并排序
    const levelArray = Object.values(voltageLevels).sort((a, b) => b.voltageKV - a.voltageKV);

    return {
      found: levelArray.length > 0,
      count: levelArray.length,
      voltageLevels: levelArray,
      summary: levelArray.map(l => `${l.voltageKV}kV(${l.componentCount})`).join(', ')
    };
  }

  /**
   * 获取线路连接关系
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 线路连接信息
   */
  getLineConnections(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath);
    }

    const topology = this.extractTopologyFromDump(data);
    const lines = [];

    for (const comp of topology.components) {
      const label = comp.label || '';
      const definition = comp.definition || comp.impl || '';
      const args = comp.args || {};
      const pins = comp.pins || {};

      // 线路识别
      if (definition.includes('line') ||
          label.toLowerCase().includes('line') ||
          definition.includes('transmission')) {

        // 获取两端节点
        const pinList = Object.entries(pins);
        const fromNode = pinList.length > 0 ? pinList[0][1] : null;
        const toNode = pinList.length > 1 ? pinList[1][1] : null;

        // 查找连接的母线名称
        let fromBus = null;
        let toBus = null;

        if (fromNode && topology.nodeMap[fromNode]) {
          const busComp = topology.nodeMap[fromNode].find(c =>
            (c.definition || '').includes('bus') ||
            (c.label || '').toLowerCase().includes('bus')
          );
          if (busComp) fromBus = busComp.label;
        }

        if (toNode && topology.nodeMap[toNode]) {
          const busComp = topology.nodeMap[toNode].find(c =>
            (c.definition || '').includes('bus') ||
            (c.label || '').toLowerCase().includes('bus')
          );
          if (busComp) toBus = busComp.label;
        }

        lines.push({
          key: comp.key,
          label: comp.label,
          fromNode,
          toNode,
          fromBus,
          toBus,
          length: args.Length || args.length || null,
          resistance: args.R1 || args.R || args.R1pu || null,
          reactance: args.X1 || args.X || args.X1pu || null,
          voltageBase: args.Vbase || args.VBase || null
        });
      }
    }

    return {
      found: lines.length > 0,
      count: lines.length,
      lines,
      summary: `共${lines.length}条线路`
    };
  }

  /**
   * 分析拓扑结构类型
   *
   * @param {Object} data - 算例数据（可选）
   * @returns {Object} 拓扑结构分析结果
   */
  analyzeTopologyStructure(data = null) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath);
    }

    const topology = this.extractTopologyFromDump(data);

    // 构建邻接表
    const adjacency = {};
    const nodeSet = new Set();

    // 收集所有节点
    for (const comp of topology.components) {
      const pins = comp.pins || {};
      for (const nodeId of Object.values(pins)) {
        if (nodeId && nodeId !== '') {
          nodeSet.add(nodeId);
        }
      }
    }

    // 初始化邻接表
    for (const node of nodeSet) {
      adjacency[node] = new Set();
    }

    // 建立连接关系（通过共享元件的引脚）
    for (const comp of topology.components) {
      const pins = Object.entries(comp.pins || {});
      const definition = (comp.definition || comp.impl || '').toLowerCase();
      const label = (comp.label || '').toLowerCase();

      // 只考虑线路、变压器等连接元件
      const isConnectionElement =
        definition.includes('line') ||
        definition.includes('transformer') ||
        label.includes('line') ||
        label.includes('transformer');

      if (isConnectionElement && pins.length >= 2) {
        const node1 = pins[0][1];
        const node2 = pins[1][1];

        if (node1 && node2 && node1 !== node2) {
          adjacency[node1].add(node2);
          adjacency[node2].add(node1);
        }
      }
    }

    // 检测环路
    const visited = new Set();
    let hasLoop = false;
    let loopCount = 0;

    function dfs(node, parent, path) {
      visited.add(node);

      for (const neighbor of adjacency[node]) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, node, [...path, node])) {
            return true;
          }
        } else if (neighbor !== parent) {
          // 发现环
          hasLoop = true;
          loopCount++;
          return true;
        }
      }
      return false;
    }

    // 从每个未访问节点开始DFS
    for (const node of nodeSet) {
      if (!visited.has(node)) {
        dfs(node, null, []);
      }
    }

    // 计算网络参数
    let totalDegree = 0;
    let maxDegree = 0;
    let leafNodes = 0;
    let hubNodes = 0;

    for (const [node, neighbors] of Object.entries(adjacency)) {
      const degree = neighbors.size;
      totalDegree += degree;
      maxDegree = Math.max(maxDegree, degree);

      if (degree === 1) leafNodes++;
      if (degree >= 3) hubNodes++;
    }

    const avgDegree = nodeSet.size > 0 ? totalDegree / nodeSet.size : 0;

    // 判断拓扑类型
    let topologyType = '未知';
    let description = '';

    if (hasLoop) {
      if (loopCount > nodeSet.size * 0.3) {
        topologyType = '环状网络';
        description = `网络包含多个环路(${loopCount}+)，具有较强的冗余性和可靠性`;
      } else {
        topologyType = '环状/网状混合';
        description = `网络包含环路，兼具可靠性和经济性`;
      }
    } else {
      if (leafNodes > nodeSet.size * 0.5) {
        topologyType = '辐射状网络';
        description = '网络呈辐射状结构，简单经济但可靠性较低';
      } else {
        topologyType = '链式/树状网络';
        description = '网络呈树状或链式结构';
      }
    }

    return {
      found: nodeSet.size > 0,
      topologyType,
      hasLoop,
      loopCount,
      statistics: {
        nodeCount: nodeSet.size,
        avgDegree: avgDegree.toFixed(2),
        maxDegree,
        leafNodes,
        hubNodes
      },
      description,
      recommendation: hasLoop ?
        '环状结构具有较高的供电可靠性，建议关注N-1校验' :
        '辐射状结构经济性好，建议考虑备用电源配置'
    };
  }

  /**
   * 获取计算方案详细参数
   *
   * @param {Object} data - 算例数据（可选）
   * @param {number} jobIndex - 计算方案索引
   * @returns {Object} 计算方案参数
   */
  getJobParameters(data = null, jobIndex = 0) {
    if (!data) {
      data = this.loadFromLocalFile(this.dataFilePath);
    }

    // 支持多种数据格式
    const modelInfo = data.model_info || data;
    const jobs = modelInfo.jobs || [];

    if (jobIndex >= jobs.length) {
      return {
        found: false,
        error: `Job index ${jobIndex} out of range (total: ${jobs.length})`
      };
    }

    const job = jobs[jobIndex];
    const args = job.args || {};

    // 提取关键参数
    const jobType = this._identifyJobType(job);

    const keyParams = {
      name: job.name,
      type: jobType,
      rid: job.rid
    };

    // 根据作业类型提取特定参数
    if (jobType === 'powerFlow' || jobType === '潮流计算') {
      Object.assign(keyParams, {
        convergenceTolerance: args.tolerance || args.convergence || args.Tolerance || 'N/A',
        maxIterations: args.maxIterations || args.MaxIterations || args.max_iter || 'N/A',
        method: args.method || args.Method || 'N/A',
        baseMVA: args.Sbase || args.baseMVA || 'N/A',
        baseKV: args.Vbase || args.baseKV || 'N/A'
      });
    } else if (jobType === 'emt' || jobType === '电磁暂态') {
      Object.assign(keyParams, {
        simulationTime: args.Tend || args.simTime || args.t_end || 'N/A',
        timeStep: args.dt || args.timeStep || args.TimeStep || 'N/A',
        startTime: args.Tstart || args.startTime || 'N/A'
      });
    }

    // 提取输出通道信息
    const outputChannels = [];
    if (args.output_channels) {
      outputChannels.push(...args.output_channels.map(ch => ({
        type: 'output',
        name: ch.name || ch
      })));
    }
    if (args.XY_Output_channels) {
      outputChannels.push(...args.XY_Output_channels.map(ch => ({
        type: 'XY_output',
        name: ch.name || ch
      })));
    }

    keyParams.outputChannels = outputChannels;
    keyParams.outputChannelCount = outputChannels.length;

    return {
      found: true,
      jobIndex,
      parameters: keyParams,
      rawArgs: args
    };
  }

  /**
   * 识别作业类型
   */
  _identifyJobType(job) {
    const rid = (job.rid || '').toLowerCase();
    const name = (job.name || '').toLowerCase();

    if (rid.includes('powerflow') || name.includes('潮流')) return 'powerFlow';
    if (rid.includes('emtp') || rid.includes('emt') || name.includes('电磁暂态')) return 'emt';
    if (rid.includes('sfemt') || name.includes('序域')) return 'sfemt';
    if (rid.includes('ies')) return 'ies';
    if (rid.includes('dslab')) return 'dslab';

    return 'unknown';
  }
}

module.exports = TopologyAnalysisSkill;