#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Export CloudPSS Model Structure

导出 CloudPSS 仿真算例的完整结构，用于分析：
- 元件类型和数量
- 设备参数
- 拓扑连接关系
"""

import os
import sys
import json

# 添加父目录到路径，以便导入 cloudpss_wrapper
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from python.cloudpss_wrapper import set_token, fetch_model
import cloudpss


def comp_to_dict(comp):
    """将 Component 对象转换为字典"""
    try:
        return comp.toJSON()
    except Exception as e:
        print(f"Warning: Failed to convert component {comp}: {e}")
        return {'id': str(comp), 'error': str(e)}


def get_component_type(comp_dict):
    """
    根据 definition 字段分类元件类型

    CloudPSS 元件定义命名规范：
    - ElectricalLable: 电气节点标签
    - STEAM_*: 汽轮机/调速器
    - SYNCHRO/GENROU: 同步发电机
    - TRANSFORMER: 变压器
    - LINE: 输电线路
    - LOAD: 负荷
    - BUS: 母线/节点
    - FAULT: 故障
    - MEASUREMENT: 量测装置
    """
    definition = comp_dict.get('definition', '')
    comp_id = comp_dict.get('id', '')
    label = comp_dict.get('label', '')

    # 根据 definition 模式匹配分类
    if 'ElectricalLable' in definition:
        return 'label'
    elif 'STEAM_' in definition:
        return 'turbine_governor'
    elif 'SYNCHRO' in definition or 'GENROU' in definition:
        return 'generator'
    elif 'TRANSFORMER' in definition or 'XFMR' in definition:
        return 'transformer'
    elif 'LINE' in definition or 'Branch' in definition:
        return 'line'
    elif 'LOAD' in definition:
        return 'load'
    elif 'BUS' in definition or 'Bus' in definition:
        return 'bus'
    elif 'FAULT' in definition:
        return 'fault'
    elif 'MEASUREMENT' in definition or 'Meter' in definition:
        return 'measurement'
    elif 'RENC' in definition or 'Renewable' in definition:
        return 'renewable'
    elif 'SWITCH' in definition or 'Breaker' in definition or 'Disconnector' in definition:
        return 'switch'
    elif 'CAPACITOR' in definition or 'CAP' in definition:
        return 'capacitor'
    elif 'INDUCTOR' in definition or 'IND' in definition:
        return 'inductor'
    elif 'CONTROLLER' in definition or 'CTRL' in definition:
        return 'controller'
    else:
        # 根据 ID 或 label 进一步判断
        id_lower = comp_id.lower()
        label_lower = label.lower()

        if 'gen' in id_lower or 'generator' in label_lower:
            return 'generator'
        elif 'line' in id_lower or 'branch' in id_lower:
            return 'line'
        elif 'load' in id_lower:
            return 'load'
        elif 'bus' in id_lower:
            return 'bus'
        elif 'xfmr' in id_lower or 'transformer' in label_lower:
            return 'transformer'
        elif 'fault' in id_lower:
            return 'fault'
        else:
            return 'other'


def analyze_topology(topology_data):
    """
    分析拓扑结构

    返回：
    - 节点 - 支路关联矩阵
    - 连通性分析
    - 子岛检测
    """
    if not topology_data:
        return None

    nodes = set()
    branches = []

    # 提取节点和支路信息
    for comp_id, comp_data in topology_data.get('components', {}).items():
        nodes.add(comp_id)

    # 分析连接关系（从 pins 中提取）
    connections = []
    for comp_id, comp_data in topology_data.get('components', {}).items():
        pins = comp_data.get('pins', {})
        for pin_name, pin_value in pins.items():
            if isinstance(pin_value, dict) and 'elementID' in pin_value:
                connected_id = pin_value['elementID']
                connections.append({
                    'from': comp_id,
                    'to': connected_id,
                    'pin': pin_name
                })

    return {
        'node_count': len(nodes),
        'connection_count': len(connections),
        'connections': connections[:50]  # 限制数量避免输出过大
    }


def export_model_structure(rid, output_path):
    """
    导出模型完整结构

    Args:
        rid: 项目 rid
        output_path: 输出文件路径
    """
    print(f"正在获取模型：{rid}")

    # 获取模型基本信息
    model_info = fetch_model(rid)
    print(f"模型名称：{model_info.get('name')}")

    # 获取模型对象
    model = cloudpss.Model.fetch(rid)

    # 获取所有元件
    print("正在获取元件列表...")
    all_components = model.getAllComponents()
    print(f"发现 {len(all_components)} 个元件")

    # 转换元件为字典格式
    components_dict = {}
    components_by_type = {}

    for comp_id, comp in all_components.items():
        comp_dict = comp_to_dict(comp)
        components_dict[comp_id] = comp_dict

        # 按类型分类
        comp_type = get_component_type(comp_dict)
        if comp_type not in components_by_type:
            components_by_type[comp_type] = []
        components_by_type[comp_type].append(comp_dict)

    # 获取拓扑结构
    print("正在获取拓扑结构...")
    try:
        topology_data = model.fetchTopology('powerFlow')
        # ModelTopology 对象可能没有 toJSON 方法，直接访问其属性
        if hasattr(topology_data, 'toJSON'):
            topology_dict = topology_data.toJSON()
        elif hasattr(topology_data, '__dict__'):
            topology_dict = topology_data.__dict__
        else:
            topology_dict = str(topology_data)
    except AttributeError as e:
        # 如果 fetchTopology 不存在，尝试其他方式
        print(f"Warning: 获取拓扑失败：{e}，尝试使用 getAllComponents 结果")
        topology_dict = None
    except Exception as e:
        print(f"Warning: 获取拓扑异常：{e}")
        topology_dict = None

    # 分析拓扑
    topology_analysis = analyze_topology({'components': components_dict})

    # 生成统计信息
    stats = {
        'total_components': len(components_dict),
        'components_by_type': {
            k: len(v) for k, v in components_by_type.items()
        }
    }

    # 生成输出结构
    output = {
        'model_info': model_info,
        'exported_at': __import__('datetime').datetime.now().isoformat(),
        'statistics': stats,
        'components_by_type': {
            k: [
                {
                    'id': c.get('id'),
                    'label': c.get('label'),
                    'definition': c.get('definition'),
                    'args': c.get('args', {})
                }
                for c in v
            ]
            for k, v in components_by_type.items()
        },
        'all_components': components_dict,
        'topology': {
            'raw': topology_dict,
            'analysis': topology_analysis
        }
    }

    # 写入文件
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"导出完成！文件已保存到：{output_path}")
    print(f"元件总数：{stats['total_components']}")
    print("元件类型分布:")
    for comp_type, count in sorted(stats['components_by_type'].items()):
        print(f"  - {comp_type}: {count}")

    return output


def main():
    """主函数"""
    # 从环境变量或配置文件加载 Token
    token = os.environ.get('CLOUDPSS_TOKEN')
    if not token:
        # 尝试从 ~/.cloudpss_token 读取
        home_dir = os.path.expanduser('~')
        token_file = os.path.join(home_dir, '.cloudpss_token')
        if os.path.exists(token_file):
            with open(token_file, 'r') as f:
                token = f.read().strip()

    if not token:
        print("错误：未找到 CloudPSS Token")
        print("请设置环境变量 CLOUDPSS_TOKEN 或将 token 保存到 ~/.cloudpss_token")
        sys.exit(1)

    set_token(token)
    print("✓ Token 已设置")

    # 导出 IEEE3 算例
    ieee3_rid = 'model/CloudPSS/IEEE3'
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'experiment-data',
        'ieee3-full-structure.json'
    )

    print(f"\n开始导出 IEEE3 算例：{ieee3_rid}")
    print("=" * 60)

    try:
        result = export_model_structure(ieee3_rid, output_path)
        print("\n" + "=" * 60)
        print("导出成功!")
    except Exception as e:
        print(f"\n导出失败：{e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
