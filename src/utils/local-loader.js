/**
 * Local Loader - 统一本地文件加载器
 *
 * 支持 .json/.yaml/.gz 格式，带内存缓存
 *
 * @module utils/local-loader
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 简单的 YAML 解析器（避免外部依赖）
// 仅支持基本格式，复杂 YAML 需要引入 js-yaml
function parseYAML(content) {
  // 检查是否有 js-yaml 可用
  try {
    const yaml = require('js-yaml');
    return yaml.load(content);
  } catch (e) {
    // 如果没有 js-yaml，使用简化的解析
    console.warn('[LocalLoader] js-yaml not available, using basic parser');
    return basicYamlParse(content);
  }
}

/**
 * 基础 YAML 解析器（仅支持简单键值对和嵌套）
 */
function basicYamlParse(content) {
  const lines = content.split('\n');
  const result = {};
  let current = result;
  const stack = [result];
  const indentStack = [-1];

  for (const line of lines) {
    // 跳过空行和注释
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // 计算缩进
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // 处理缩进变化
    while (indent <= indentStack[indentStack.length - 1]) {
      stack.pop();
      indentStack.pop();
    }
    current = stack[stack.length - 1];

    // 解析键值对
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      let value = trimmed.substring(colonIndex + 1).trim();

      if (value === '' || value.startsWith('|') || value.startsWith('>')) {
        // 嵌套对象或多行字符串
        current[key] = {};
        stack.push(current[key]);
        indentStack.push(indent);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // 内联数组
        try {
          current[key] = JSON.parse(value.replace(/'/g, '"'));
        } catch {
          current[key] = value;
        }
      } else if (value.startsWith('{') && value.endsWith('}')) {
        // 内联对象
        try {
          current[key] = JSON.parse(value.replace(/'/g, '"'));
        } catch {
          current[key] = value;
        }
      } else {
        // 简单值
        // 尝试解析为数字或布尔值
        if (value === 'true') current[key] = true;
        else if (value === 'false') current[key] = false;
        else if (value === 'null') current[key] = null;
        else if (/^-?\d+(\.\d+)?$/.test(value)) current[key] = parseFloat(value);
        else if (/^['"](.*)['"]$/.test(value)) current[key] = value.slice(1, -1);
        else current[key] = value;
      }
    }
  }

  return result;
}

/**
 * LocalLoader 类
 */
class LocalLoader {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxCacheSize = options.maxCacheSize || 100; // 最大缓存条目数
    this.cacheEnabled = options.cacheEnabled !== false;
  }

  /**
   * 加载本地文件
   *
   * @param {string} filePath - 文件路径
   * @returns {Object} 解析后的数据
   */
  load(filePath) {
    const absolutePath = path.resolve(filePath);

    // 检查缓存
    if (this.cacheEnabled && this.cache.has(absolutePath)) {
      console.log(`[LocalLoader] Cache hit: ${absolutePath}`);
      return this.cache.get(absolutePath);
    }

    // 检查文件存在
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`文件不存在: ${absolutePath}`);
    }

    console.log(`[LocalLoader] Loading: ${absolutePath}`);

    // 读取文件内容
    const content = fs.readFileSync(absolutePath);
    let data;

    // 根据扩展名解析
    if (filePath.endsWith('.gz')) {
      // gzip 压缩文件
      const decompressed = zlib.gunzipSync(content);
      const innerPath = filePath.replace(/\.gz$/, '');
      data = this._parseContent(decompressed, innerPath);
    } else {
      data = this._parseContent(content, filePath);
    }

    // 存入缓存
    if (this.cacheEnabled) {
      this._addToCache(absolutePath, data);
    }

    return data;
  }

  /**
   * 解析文件内容
   *
   * @param {Buffer} content - 文件内容
   * @param {string} filePath - 文件路径（用于判断格式）
   * @returns {Object} 解析后的数据
   */
  _parseContent(content, filePath) {
    const strContent = content.toString();

    // JSON 格式
    if (filePath.endsWith('.json') || strContent.trim().startsWith('{') || strContent.trim().startsWith('[')) {
      try {
        return JSON.parse(strContent);
      } catch (e) {
        console.warn(`[LocalLoader] JSON parse failed, trying YAML: ${e.message}`);
      }
    }

    // YAML 格式
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      return parseYAML(strContent);
    }

    // 尝试自动检测格式
    const trimmed = strContent.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(strContent);
      } catch {
        // 继续尝试 YAML
      }
    }

    // 默认作为 YAML 解析
    return parseYAML(strContent);
  }

  /**
   * 添加到缓存
   */
  _addToCache(key, value) {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxCacheSize) {
      // 删除最早的条目
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /**
   * 清除缓存
   *
   * @param {string} filePath - 可选，指定文件路径则只清除该文件缓存
   */
  clearCache(filePath) {
    if (filePath) {
      const absolutePath = path.resolve(filePath);
      this.cache.delete(absolutePath);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 从 dump 数据中提取标准化组件格式
   *
   * @param {Object} dumpData - dump 文件内容
   * @returns {Object} 标准化的组件字典
   */
  extractComponents(dumpData) {
    const components = {};

    // CloudPSS 官方 dump 格式: revision.implements.diagram.cells
    if (dumpData.revision?.implements?.diagram?.cells) {
      const cells = dumpData.revision.implements.diagram.cells;

      for (const [key, cell] of Object.entries(cells)) {
        if (cell.definition) {
          components[key] = {
            key,
            id: cell.id,
            label: cell.label || key,
            definition: cell.definition,
            args: cell.args || {},
            pins: cell.pins || {}
          };
        }
      }
    }
    // 兼容其他格式: data.components 或 data.all_components
    else if (dumpData.components) {
      for (const [key, comp] of Object.entries(dumpData.components)) {
        components[key] = this._normalizeComponent(key, comp);
      }
    } else if (dumpData.all_components) {
      for (const comp of dumpData.all_components) {
        const key = comp.key || comp.id;
        components[key] = this._normalizeComponent(key, comp);
      }
    }
    // topology-analysis 格式
    else if (dumpData.revision?.graphic) {
      const graphics = dumpData.revision.graphic;
      for (const [key, cell] of Object.entries(graphics)) {
        components[key] = this._normalizeComponent(key, cell);
      }
    }

    console.log(`[LocalLoader] Extracted ${Object.keys(components).length} components`);
    return components;
  }

  /**
   * 标准化组件格式
   */
  _normalizeComponent(key, comp) {
    return {
      key,
      id: comp.id || key,
      label: comp.label || key,
      definition: comp.definition || comp.impl || '',
      impl: comp.impl || comp.definition || '',
      args: comp.args || {},
      pins: comp.pins || {}
    };
  }

  /**
   * 获取 dump 数据中的计算方案信息
   *
   * @param {Object} dumpData - dump 文件内容
   * @returns {Array} 计算方案列表
   */
  extractJobs(dumpData) {
    // 尝试多种可能的路径
    const modelInfo = dumpData.model_info || dumpData;
    return modelInfo.jobs || dumpData.jobs || [];
  }

  /**
   * 获取 dump 数据中的基本信息
   *
   * @param {Object} dumpData - dump 文件内容
   * @returns {Object} 基本信息
   */
  extractMetadata(dumpData) {
    return {
      rid: dumpData.rid || dumpData.model_info?.rid || null,
      name: dumpData.name || dumpData.model_info?.name || null,
      owner: dumpData.owner || dumpData.model_info?.owner || null,
      description: dumpData.description || dumpData.model_info?.description || null,
      version: dumpData.version || dumpData.model_info?.version || null,
      createdAt: dumpData.created_at || dumpData.model_info?.created_at || null,
      updatedAt: dumpData.updated_at || dumpData.model_info?.updated_at || null
    };
  }

  /**
   * 检查文件是否存在
   *
   * @param {string} filePath - 文件路径
   * @returns {boolean} 文件是否存在
   */
  exists(filePath) {
    return fs.existsSync(path.resolve(filePath));
  }

  /**
   * 保存数据到文件
   *
   * @param {string} filePath - 文件路径
   * @param {Object} data - 要保存的数据
   * @param {Object} options - 保存选项
   */
  save(filePath, data, options = {}) {
    const { format = 'yaml', compress = true } = options;
    const absolutePath = path.resolve(filePath);

    // 确保目录存在
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let content;
    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
    } else {
      // YAML 格式
      try {
        const yaml = require('js-yaml');
        content = yaml.dump(data, { indent: 2, lineWidth: -1 });
      } catch {
        // 如果没有 js-yaml，使用 JSON
        content = JSON.stringify(data, null, 2);
      }
    }

    if (compress || filePath.endsWith('.gz')) {
      const gzPath = absolutePath.endsWith('.gz') ? absolutePath : `${absolutePath}.gz`;
      fs.writeFileSync(gzPath, zlib.gzipSync(content));
      console.log(`[LocalLoader] Saved (compressed): ${gzPath}`);
      return gzPath;
    }

    fs.writeFileSync(absolutePath, content);
    console.log(`[LocalLoader] Saved: ${absolutePath}`);
    return absolutePath;
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      enabled: this.cacheEnabled,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 导出单例和类
const localLoader = new LocalLoader();

module.exports = {
  LocalLoader,
  localLoader
};