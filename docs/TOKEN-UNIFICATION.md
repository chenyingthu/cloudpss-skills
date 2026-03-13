# Token 环境变量统一说明

## 问题背景

在之前的代码中存在两个 Token 环境变量混用的情况：
- `CLOUDPSS_TOKEN` - Python SDK 使用的 Token 变量
- `CLOUDPSS_API_KEY` - 早期 REST API 遗留的变量

这导致用户在配置时需要同时设置两个变量，或者在不同文档中看到不同的变量名，造成混淆。

## 统一方案

### 核心变更

1. **统一使用 `CLOUDPSS_TOKEN` 作为唯一的环境变量名**
2. `CLOUDPSS_API_KEY` 保留作为向后兼容的 fallback（只读，不主动使用）
3. 所有文档、示例、测试统一使用 `CLOUDPSS_TOKEN`

### 修改的文件

| 文件 | 变更内容 |
|------|---------|
| `src/api/client.js` | 移除 `apiKey` 属性，统一使用 `token` |
| `src/api/python-bridge.js` | 移除 `apiKey` 属性，统一使用 `token` |
| `.env.example` | 将 `CLOUDPSS_API_KEY` 改为 `CLOUDPSS_TOKEN` |
| `examples/batch-simulation.js` | 移除 `apiKey` 配置 |
| `tests/batch-simulation.test.js` | 移除 `apiKey` 配置 |
| `tests/fusion/fusion-test-detailed-report.js` | 移除重复的 `CLOUDPSS_API_KEY` 设置 |

### 配置方式

#### 推荐方式：~/.cloudpss_env（全局配置）

```bash
# 编辑环境配置文件
nano ~/.cloudpss_env

# 添加以下内容
export CLOUDPSS_TOKEN="your-token-here"
export CLOUDPSS_API_URL="https://cloudpss.net/"
```

然后加载环境变量：
```bash
source ~/.cloudpss_env
```

#### 项目方式：.env（项目级配置）

```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件，设置 CLOUDPSS_TOKEN
nano .env
```

#### 命令行方式

```bash
CLOUDPSS_TOKEN=your-token node examples/test-connection.js
```

### 向后兼容性

代码仍然会读取 `CLOUDPSS_API_KEY` 作为 fallback：

```javascript
// 优先级：CLOUDPSS_TOKEN > CLOUDPSS_API_KEY
this.token = process.env.CLOUDPSS_TOKEN || process.env.CLOUDPSS_API_KEY;
```

如果用户只设置了 `CLOUDPSS_API_KEY`，代码仍然可以正常工作。

### 迁移指南

#### 从旧版本升级

如果你之前使用的是 `CLOUDPSS_API_KEY`，建议迁移到 `CLOUDPSS_TOKEN`：

```bash
# 旧配置（仍然可用，但不推荐）
export CLOUDPSS_API_KEY="your-token"

# 新配置（推荐）
export CLOUDPSS_TOKEN="your-token"
```

#### 检查配置

运行测试脚本验证配置：

```bash
node examples/test-connection.js
```

如果看到 "连接成功"，说明配置正确。

## 版本历史

### v1.2.0 (2026-03-13)
- ✅ 统一使用 `CLOUDPSS_TOKEN` 作为唯一 Token 环境变量
- ✅ 保留 `CLOUDPSS_API_KEY` 作为向后兼容 fallback
- ✅ 更新所有文档和示例使用统一变量名

### v1.1.0 (2026-03-12)
- 修复 N-1 扫描功能
- 使用 getAllComponents() 替代废弃的 fetchTopology()

### v1.0.0
- 初始版本发布
