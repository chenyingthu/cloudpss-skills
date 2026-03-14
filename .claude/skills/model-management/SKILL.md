---
name: cloudpss:model-management
description: CloudPSS 算例管理 - 算例 CRUD、版本管理、本地模型管理、模型验证
argument-hint: "<list | info <rid> | dump <rid> | validate <rid> | load <tag>>"
---

<Purpose>
提供 CloudPSS 算例全生命周期管理，包括算例查询、创建、复制、删除、版本管理，以及本地模型存储和模型验证功能。
</Purpose>

<Use_When>
- 用户请求列出、查询算例信息
- 创建、复制、删除算例
- 将算例 dump 到本地存储
- 从本地加载模型
- 验证模型有效性（拓扑检查、潮流收敛）
- 设置模型标签和别名
</Use_When>

<Do_Not_Use_When>
- 仅需要运行潮流计算（使用 cloudpss:powerflow 技能）
- 需要 EMT 电磁暂态仿真（使用 stability 技能）
- 需要 N-1 安全扫描（使用 cloudpss:n1-analysis 技能）
</Do_Not_Use_When>

<Execution_Flow>
1. 根据命令类型路由到对应操作
2. **listModels**: 调用 listProjects 获取算例列表
3. **getModelInfo**: 调用 fetchModel 获取详细信息
4. **dumpToLocal**: 验证模型 → 生成 tag → 保存到 local-models/
5. **loadFromLocal**: 读取本地模型文件 → 解压缩 → 返回模型数据
6. **validate**: 拓扑检查 → 潮流收敛检查 → 健康评分
7. **setTag/addAlias**: 更新本地元数据
</Execution_Flow>

<Capabilities>
- **算例查询**: listModels, getModelInfo
- **算例管理**: create, copy, delete
- **本地存储**: dumpToLocal, loadFromLocal
- **标签管理**: setTag, addAlias, listModels
- **模型验证**:
  - 拓扑检查（孤立节点、平衡节点、参数完整性）
  - 潮流收敛检查
  - EMT 动态检查（可选）
  - 健康评分计算
- **混合模式**: local-first, API-fallback
</Capabilities>

<Examples>
```
# 列出所有算例
/cloudpss:model-management list

# 获取算例信息
/cloudpss:model-management info model/holdme/IEEE39

# 验证模型
/cloudpss:model-management validate model/holdme/IEEE39

# 保存到本地
/cloudpss:model-management dump model/holdme/IEEE39 --tag=my-ieee39

# 从本地加载
/cloudpss:model-management load my-ieee39

# 设置别名
/cloudpss:model-management alias my-ieee39 ieee39-test
```
</Examples>

<Output_Format>
```json
{
  "action": "validate",
  "rid": "model/holdme/IEEE39",
  "result": {
    "overallStatus": "valid",
    "healthScore": 92,
    "issues": [],
    "recommendations": []
  }
}
```

```json
{
  "action": "dump",
  "rid": "model/holdme/IEEE39",
  "tag": "my-ieee39",
  "filePath": "local-models/models/my-ieee39/model.yaml.gz",
  "metadata": {
    "owner": "holdme",
    "key": "IEEE39",
    "dumpedAt": "2024-03-14T10:00:00Z"
  }
}
```
</Output_Format>

<Dependencies>
- src/skills/model-management-enhanced.js - 后端实现
- src/skills/model-validation.js - 模型验证
- src/skills/local-model-manager.js - 本地管理
- local-models/ - 本地存储目录
</Dependencies>
