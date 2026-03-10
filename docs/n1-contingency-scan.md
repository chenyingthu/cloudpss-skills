# N-1 Contingency Scan Skill

N-1 安全分析技能，用于电力系统 N-1 扫描分析。

## 功能特性

- **自动遍历扫描**: 自动识别并扫描所有线路和变压器开断故障
- **越限检测**: 电压越限、线路过载自动识别
- **严重程度评估**: 三级严重程度分类 (normal/warning/critical)
- **并行执行**: 支持配置并行度，加速大规模扫描
- **报告生成**: 生成调度友好的详细分析报告

## API 使用

### 1. 完整 N-1 扫描

```javascript
const { CloudPSSSkills } = require('cloudpss-skills');

const skills = new CloudPSSSkills({
  token: process.env.CLOUDPSS_TOKEN,
  apiURL: 'https://cloudpss.net/'
});

// 执行完整 N-1 扫描
const results = await skills.n1scan.scan('model/owner/ieee-3-bus', {
  jobType: 'powerFlow',
  limits: {
    voltage: { min: 0.95, max: 1.05, critical_min: 0.90, critical_max: 1.10 },
    loading: { threshold: 100, critical_threshold: 120, default_rate: 100 }
  },
  maxConcurrency: 5
});

console.log(`扫描完成：${results.totalScenes} 个场景`);
console.log(`收敛率：${results.summary.convergenceRate}`);
console.log(`严重场景：${results.summary.severity.critical}`);
```

### 2. 仅扫描线路

```javascript
const lineResults = await skills.n1scan.scanLines('model/owner/ieee-3-bus', {
  jobType: 'powerFlow'
});

console.log(`线路扫描：${lineResults.totalScenes} 条`);
```

### 3. 仅扫描变压器

```javascript
const transformerResults = await skills.n1scan.scanTransformers('model/owner/ieee-3-bus', {
  jobType: 'powerFlow'
});

console.log(`变压器扫描：${transformerResults.totalScenes} 台`);
```

### 4. 扫描指定元件

```javascript
const elements = ['LINE-1', 'LINE-2', 'XFMR-1'];
const results = await skills.n1scan.scan('model/owner/ieee-3-bus', {
  elements,
  jobType: 'powerFlow'
});
```

### 5. 生成报告

```javascript
const report = skills.n1scan.generateReport(results);
console.log(report);

// 保存到文件
const fs = require('fs');
fs.writeFileSync('n1-report.txt', report);
```

## 输出数据结构

### 扫描结果

```javascript
{
  rid: 'model/owner/ieee-3-bus',
  timestamp: '2026-03-09T12:00:00.000Z',
  totalScenes: 10,
  summary: {
    total: 10,
    success: 9,
    failed: 1,
    convergenceErrors: 0,
    convergenceRate: '90.0%',
    severity: {
      critical: 2,
      warning: 3,
      normal: 5
    },
    criticalScenes: [...]
  },
  results: [
    {
      element_id: 'LINE-1',
      element_type: 'line',
      element_name: '线路 1',
      status: 'success',
      severity: 'critical',
      buses: [...],
      branches: [...],
      violations: {
        voltage: [
          {
            bus_id: 'BUS2',
            bus_name: '节点 2',
            voltage: 0.88,
            limit_min: 0.95,
            limit_max: 1.05,
            violation_type: 'low',
            severity: 'critical',
            deviation: 0.07
          }
        ],
        line_overload: [
          {
            branch_id: 'L3',
            branch_name: '线路 3',
            loading: 120.8,
            power_flow: 120.8,
            rate: 100,
            severity: 'critical',
            overload_amount: 20.8
          }
        ]
      }
    }
  ]
}
```

## Python 层 APIs

### run_contingency_scan

```python
def run_contingency_scan(rid: str, job_type: str = 'powerFlow',
                         elements: List[str] = None) -> List[Dict]
```

遍历指定元件列表，对每个元件执行开断仿真。

### check_voltage_violations

```python
def check_voltage_violations(buses: List[Dict], limits: Dict = None) -> List[Dict]
```

检查电压越限，返回越限列表。

### check_line_overloads

```python
def check_line_overloads(branches: List[Dict], limits: Dict = None) -> List[Dict]
```

检查线路过载，返回过载列表。

## 配置选项

### 电压限值 (limits.voltage)

| 参数 | 默认值 | 说明 |
|------|--------|------|
| min | 0.95 | 电压下限 (pu) |
| max | 1.05 | 电压上限 (pu) |
| critical_min | 0.90 | 严重低电压阈值 (pu) |
| critical_max | 1.10 | 严重高电压阈值 (pu) |
| bus_limits | {} | 特定节点的自定义限制 |

### 负载限值 (limits.loading)

| 参数 | 默认值 | 说明 |
|------|--------|------|
| threshold | 100 | 过载告警阈值 (%) |
| critical_threshold | 120 | 严重过载阈值 (%) |
| default_rate | 100 | 默认额定容量 (MW) |
| branch_limits | {} | 特定支路的自定义限制 |

## 运行测试

```bash
# 设置环境变量
export CLOUDPSS_TOKEN=your-token
export CLOUDPSS_API_URL=https://cloudpss.net/

# 运行测试
node tests/n1-contingency-scan.test.js
```

## 示例

查看 `examples/n1-scan-example.js` 获取完整使用示例。

## 文件结构

```
src/
├── skills/
│   └── analyze-n1.js          # N-1 扫描技能主文件
├── api/
│   └── python-bridge.js       # Python 桥接 (新增 APIs)
└── index.js                   # 主入口 (导出 n1scan)

python/
└── cloudpss_wrapper.py        # Python SDK (新增 N-1 函数)

tests/
└── n1-contingency-scan.test.js # 测试用例

examples/
└── n1-scan-example.js         # 使用示例
```

## 注意事项

1. **Token 配置**: 需要有效的 CloudPSS API Token
2. **项目 RID**: 使用正确的项目 RID 格式 `model/owner/key`
3. **并行度**: 根据 API 限流调整 `maxConcurrency`
4. **超时设置**: 大规模扫描可能需要较长时间，注意设置合适的超时
