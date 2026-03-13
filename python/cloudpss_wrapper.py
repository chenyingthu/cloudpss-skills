#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CloudPSS Python SDK Wrapper

提供 CloudPSS Python SDK 的封装，供 Node.js 层通过子进程调用
"""

import os
import sys
import json
import numpy as np
import cloudpss
from typing import Dict, List, Any, Optional

# Import FFTAnalyzer from the analyzer module
try:
    from cloudpss_wrapper.analyzer.fft import FFTAnalyzer
except ImportError:
    # Fallback for direct module import
    import numpy as np
    from scipy import fft
    from scipy.signal import get_window
    FFTAnalyzer = None


def set_token(token: str):
    """设置 CloudPSS API Token"""
    cloudpss.setToken(token)


def set_api_url(url: str):
    """设置 CloudPSS API URL"""
    os.environ['CLOUDPSS_API_URL'] = url


def fetch_model(rid: str) -> Dict[str, Any]:
    """
    获取算例项目

    Args:
        rid: 项目 rid，格式为 'model/owner/key'

    Returns:
        项目信息字典
    """
    model = cloudpss.Model.fetch(rid)
    return {
        'rid': model.rid,
        'name': model.name,
        'description': model.description,
        'configs': model.configs,
        'jobs': model.jobs,
        'revision': str(model.revision) if model.revision else None
    }


def dump_model(rid: str, file_path: str, format: str = "yaml", compress: str = "gzip") -> Dict[str, Any]:
    """
    下载/导出算例文件

    Args:
        rid: 项目 rid，格式为 'model/owner/key'
        file_path: 保存文件的路径
        format: 文件格式，支持 'yaml', 'json' 等
        compress: 压缩方式，支持 'gzip' 或 None

    Returns:
        导出结果字典
    """
    try:
        model = cloudpss.Model.fetch(rid)
        cloudpss.Model.dump(model, file_path, format=format, compress=compress)
        return {
            'success': True,
            'file_path': file_path,
            'format': format,
            'compress': compress,
            'rid': rid
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def load_model(file_path: str, format: str = "yaml", compress: str = "gzip") -> Dict[str, Any]:
    """
    从文件加载算例到 CloudPSS

    Args:
        file_path: 算例文件路径
        format: 文件格式
        compress: 压缩方式

    Returns:
        加载结果字典
    """
    try:
        # CloudPSS SDK 使用 Model.load 从文件创建新项目
        model = cloudpss.Model.load(file_path, format=format, compress=compress)
        return {
            'success': True,
            'rid': model.rid,
            'name': model.name,
            'file_path': file_path
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def list_user_projects(name: str = None, page_size: int = 100, owner: str = None) -> List[Dict[str, Any]]:
    """
    获取用户有权限的项目列表

    Args:
        name: 查询名称，模糊查询（可选）
        page_size: 分页大小，默认 100
        owner: 所有者筛选，默认当前用户；设为 "*" 可获取所有公开项目

    Returns:
        项目列表，包含 rid, name, description, tags, updatedAt 等字段
    """
    # 使用官方 Model.fetchMany API 获取项目列表
    # 参考: cloudpss/model/model.py Model.fetchMany()
    models = cloudpss.Model.fetchMany(name=name, pageSize=page_size, owner=owner)
    return list(models)


def create_config(rid: str, name: str) -> Dict[str, Any]:
    """
    创建参数方案

    Args:
        rid: 项目 rid
        name: 参数方案名称

    Returns:
        创建的参数方案
    """
    model = cloudpss.Model.fetch(rid)
    config = model.createConfig(name)
    model.addConfig(config)
    model.save()
    return config


def create_job(rid: str, job_type: str, name: str) -> Dict[str, Any]:
    """
    创建计算方案

    Args:
        rid: 项目 rid
        job_type: 计算方案类型 (emtp, sfemt, powerFlow, etc.)
        name: 计算方案名称

    Returns:
        创建的计算方案
    """
    model = cloudpss.Model.fetch(rid)
    job = model.createJob(job_type, name)
    model.addJob(job)
    model.save()
    return job


def run_simulation(rid: str, job_index: int = 0, config_index: int = 0) -> Dict[str, Any]:
    """
    运行仿真任务

    Args:
        rid: 项目 rid
        job_index: 计算方案索引
        config_index: 参数方案索引

    Returns:
        仿真任务信息
    """
    model = cloudpss.Model.fetch(rid)
    job = model.jobs[job_index]
    config = model.configs[config_index]

    runner = model.run(job, config)

    # runner 本身就是 job 对象
    return {
        'job_id': runner.id if hasattr(runner, 'id') else runner.job_id,
        'status': runner.job_status if hasattr(runner, 'job_status') else runner.status,
        'rid': rid
    }


def wait_for_completion(job_id: str, timeout: int = 300) -> bool:
    """
    等待仿真任务完成

    Args:
        job_id: 任务 ID
        timeout: 超时时间（秒）

    Returns:
        是否成功完成
    """
    import time

    job = cloudpss.Job.fetch(job_id)
    start_time = time.time()

    while not job.status():
        if time.time() - start_time > timeout:
            return False
        time.sleep(1)

    return job.status() == 1


def _parse_table_result(table_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    解析 CloudPSS table 格式的结果

    Args:
        table_data: table 格式的数据，包含 columns 数组
                   每个 column 有 name 和 data 数组

    Returns:
        对象数组，每个对象是一行数据
    """
    if not table_data or 'columns' not in table_data:
        return []

    columns = table_data['columns']
    if not columns:
        return []

    # 获取行数（假设所有列的数据长度相同）
    num_rows = len(columns[0].get('data', []))

    result = []
    for i in range(num_rows):
        row = {}
        for col in columns:
            col_name = col['name']
            # 清理列名中的 HTML 标签，如 <i>V</i><sub>m</sub> -> Vm
            import re
            # 先处理下标：<i>V</i><sub>m</sub> -> Vm
            col_name = re.sub(r'<i>([^<]+)</i>', r'\1', col_name)
            col_name = re.sub(r'<sub>([^<]+)</sub>', r'\1', col_name)
            # 移除剩余的 HTML 标签
            col_name = re.sub(r'<[^>]+>', '', col_name)
            # 移除斜杠和单位，如 "Vm / pu" -> "Vm"
            col_name = col_name.split('/')[0].strip()
            # 移除空格
            col_name = col_name.replace(' ', '')

            row[col_name] = col['data'][i] if i < len(col['data']) else None

        result.append(row)

    return result


def get_power_flow_results(job_id: str) -> Dict[str, Any]:
    """
    获取潮流计算结果

    Args:
        job_id: 任务 ID

    Returns:
        潮流结果（buses 和 branches）
    """
    import time

    # 1. 等待任务完成
    job = cloudpss.Job.fetch(job_id)
    max_wait = 60  # 最大等待 60 秒
    wait_interval = 1  # 每秒检查一次
    elapsed = 0

    while not job.status() and elapsed < max_wait:
        time.sleep(wait_interval)
        job = cloudpss.Job.fetch(job_id)  # 重新获取以刷新状态
        elapsed += wait_interval

    if not job.status():
        return {'buses': [], 'branches': [], 'error': 'Task timeout after waiting'}

    # 2. 任务完成后重新获取结果对象
    result = job.result
    if not result:
        return {'buses': [], 'branches': [], 'error': 'No result available'}

    # 3. 尝试不同的结果访问方式
    if hasattr(result, 'getBuses') and hasattr(result, 'getBranches'):
        buses_raw = result.getBuses()
        branches_raw = result.getBranches()

        # 解析 table 格式 - getBuses() 返回数组，第一个元素是 table 对象
        buses = []
        if isinstance(buses_raw, list) and len(buses_raw) > 0:
            table_data = buses_raw[0].get('data') if isinstance(buses_raw[0], dict) else None
            buses = _parse_table_result(table_data) if table_data else buses_raw

        branches = []
        if isinstance(branches_raw, list) and len(branches_raw) > 0:
            table_data = branches_raw[0].get('data') if isinstance(branches_raw[0], dict) else None
            branches = _parse_table_result(table_data) if table_data else branches_raw

        return {
            'buses': buses,
            'branches': branches
        }
    elif hasattr(result, 'buses') and hasattr(result, 'branches'):
        return {
            'buses': result.buses,
            'branches': result.branches
        }
    else:
        return {'buses': [], 'branches': [], 'raw': str(result)}


def get_emt_results(job_id: str, plot_index: int = 0) -> Dict[str, Any]:
    """
    获取电磁暂态仿真结果

    Args:
        job_id: 任务 ID
        plot_index: 输出分组索引

    Returns:
        电磁暂态结果（plots 数据）
    """
    job = cloudpss.Job.fetch(job_id)
    result = job.view(cloudpss.EMTView)

    plots = result.getPlots()
    channels = result.getPlotChannelNames(plot_index)

    channel_data = {}
    for channel_name in channels:
        channel_data[channel_name] = result.getPlotChannelData(plot_index, channel_name)

    return {
        'plots': plots,
        'channels': channels,
        'channel_data': channel_data
    }


def get_simulation_logs(job_id: str) -> List[str]:
    """
    获取仿真日志

    Args:
        job_id: 任务 ID

    Returns:
        日志列表
    """
    job = cloudpss.Job.fetch(job_id)
    return job.result.getLogs()


def abort_simulation(job_id: str) -> bool:
    """
    中断仿真任务

    Args:
        job_id: 任务 ID

    Returns:
        是否成功中断
    """
    try:
        job = cloudpss.Job.fetch(job_id)
        job.abort(timeout=3)
        return True
    except Exception:
        return False


def update_component(rid: str, component_key: str, label: Optional[str] = None,
                     args: Optional[Dict] = None, pins: Optional[Dict] = None) -> bool:
    """
    更新元件参数

    Args:
        rid: 项目 rid
        component_key: 元件 key
        label: 元件标签
        args: 元件参数
        pins: 元件引脚数据

    Returns:
        是否成功更新
    """
    model = cloudpss.Model.fetch(rid)
    return model.updateComponent(component_key, label=label, args=args, pins=pins)


def add_component(rid: str, definition: str, label: str, args: Dict,
                  pins: Dict, canvas: str = None,
                  position: Dict = None, size: Dict = None) -> Dict[str, Any]:
    """
    添加元件

    Args:
        rid: 项目 rid
        definition: 元件定义 rid
        label: 元件标签
        args: 元件参数
        pins: 元件引脚数据
        canvas: 所在图纸
        position: 位置信息
        size: 大小信息

    Returns:
        创建的元件信息
    """
    model = cloudpss.Model.fetch(rid)
    component = model.addComponent(
        definition=definition,
        label=label,
        args=args,
        pins=pins,
        canvas=canvas,
        position=position,
        size=size
    )
    return {
        'id': component.id,
        'label': component.label,
        'definition': component.definition
    }


def get_all_components(rid: str) -> Dict[str, Any]:
    """
    获取所有元件

    Args:
        rid: 项目 rid

    Returns:
        所有元件信息
    """
    model = cloudpss.Model.fetch(rid)
    components = model.getAllComponents()

    # 序列化元件数据
    result = {}
    for key, comp in components.items():
        result[key] = {
            'id': comp.id if hasattr(comp, 'id') else str(comp),
            'label': comp.label if hasattr(comp, 'label') else '',
            'definition': comp.definition if hasattr(comp, 'definition') else '',
            'args': dict(comp.args) if hasattr(comp, 'args') and comp.args else {},
            'pins': dict(comp.pins) if hasattr(comp, 'pins') and comp.pins else {}
        }
    return result


def get_topology(rid: str, implement_type: str = 'emtp',
                 config: Dict = None, max_depth: int = None) -> Dict[str, Any]:
    """
    获取拓扑数据

    Args:
        rid: 项目 rid
        implement_type: 拓扑实现类型
        config: 拓扑实现配置
        max_depth: 最大递归深度

    Returns:
        拓扑数据
    """
    model = cloudpss.Model.fetch(rid)
    # SDK expects config to have 'args' key if provided
    topology = model.fetchTopology(
        implementType=implement_type,
        config=config if config else None,
        maximumDepth=max_depth
    )
    return {
        'components': topology.components,
        'mappings': topology.mappings
    }


def save_model(rid: str, new_key: str = None) -> bool:
    """
    保存项目

    Args:
        rid: 项目 rid
        new_key: 新项目名称（可选，用于另存为）

    Returns:
        是否成功保存
    """
    model = cloudpss.Model.fetch(rid)
    model.save(key=new_key)
    return True


# =====================================================
# Component Analysis APIs - 元件分析 API
# =====================================================

# 元件类型映射表
COMPONENT_TYPE_MAP = {
    # Generator and related components
    'generator': ['SyncGenerator', 'GENROU', 'GENSAL', 'GENUNI', 'GEN', 'SYNCHRO'],
    'turbine_governor': ['STEAM_TUR', 'STEAM_GOV', 'HYGOV', 'GAST', 'TGOV', 'TURBINE', 'STEAM'],
    'exciter': ['EXST', 'EXTR', 'EXAC', 'ESAC', 'EX'],
    'pss': ['PSS', 'STAB'],
    # Network components
    'line': ['TransmissionLine', 'LINE', 'Branch', 'BRANCH'],
    'transformer': ['Transformer', 'XFMR', 'TR2', 'TR3'],
    'load': ['ExpLoad', 'LOAD', 'Load', 'ELCLOAD', 'RLCLOAD'],
    'bus': ['Bus', 'BUS', 'BUSALT'],
    'fault': ['Fault', 'FAULT'],
    'switch': ['SWITCH', 'Breaker', 'DISC', 'CB'],
    'renewable': ['RENC', 'SOLAR', 'WIND', 'WT', 'PV'],
    'capacitor': ['CAPACITOR', 'CAP', 'SHUNT'],
    'inductor': ['INDUCTOR', 'IND', 'REACTOR'],
    # Measurement and control
    'measurement': ['VoltageMeter', 'CurrentMeter', 'METER', 'MEASUREMENT', 'SENSOR', 'PMU', 'Channel'],
    'controller': ['Controller', 'CTRL', 'PI', 'PID', 'LIMITER', 'Gain', 'Sum', 'LoopNode', 'Constant', 'StepGen'],
    # Labels and ground
    'label': ['ElectricalLable', 'LABEL'],
    'ground': ['GND', 'GROUND'],
    # CloudPSS specific naming patterns (with underscore prefix)
    'bus_cloudpss': ['_newBus'],
    'transformer_cloudpss': ['_newTransformer'],
    'load_cloudpss': ['_newExpLoad'],
    'fault_cloudpss': ['_newFaultResistor'],
    'line_cloudpss': ['_newLine'],
    'measurement_cloudpss': ['_NewVoltageMeter', '_newChannel'],
    'controller_cloudpss': ['_newConstant', '_newGain', '_newLoopNode', '_newStepGen', '_newSum'],
    'turbine_cloudpss': ['_STEAM_TUR'],
    'governor_cloudpss': ['_STEAM_GOV'],
    'exciter_cloudpss': ['_EXST'],
    'pss_cloudpss': ['_PSS'],
    'other': []
}


def _get_component_type(definition: Optional[str]) -> str:
    """
    根据 definition 获取元件类型

    Args:
        definition: 元件定义字符串

    Returns:
        元件类型（category）
    """
    if not definition:
        return 'unknown'

    # 提取 definition 的最后一段（类名）
    parts = definition.split('/')
    class_name = parts[-1]

    # 遍历类型映射，查找匹配
    for comp_type, patterns in COMPONENT_TYPE_MAP.items():
        for pattern in patterns:
            if class_name == pattern or class_name.startswith(pattern):
                return comp_type

    return 'unknown'


def classify_component(definition: Optional[str], args: Optional[Dict] = None) -> Dict[str, Any]:
    """
    分类单个元件
    """
    comp_type = _get_component_type(definition)
    return {
        'type': comp_type,
        'definition': definition,
        'category': comp_type,
        'class_name': definition.split('/')[-1] if definition else None
    }


def classify_components(components: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """
    批量分类元件
    """
    classified = {}

    for key, comp in components.items():
        comp_type = _get_component_type(comp.get('definition'))
        if comp_type not in classified:
            classified[comp_type] = []
        classified[comp_type].append(comp)

    return classified


def analyze_components(rid: str, detailed: bool = False) -> Dict[str, Any]:
    """
    分析模型中的所有元件

    Args:
        rid: 项目 rid
        detailed: 是否返回详细分析

    Returns:
        元件分析报告
    """
    model = cloudpss.Model.fetch(rid)
    components = model.getAllComponents()

    # 序列化并分类元件
    serialized = {}
    for key, comp in components.items():
        serialized[key] = {
            'id': comp.id if hasattr(comp, 'id') else str(comp),
            'label': comp.label if hasattr(comp, 'label') else '',
            'definition': comp.definition if hasattr(comp, 'definition') else '',
            'args': dict(comp.args) if hasattr(comp, 'args') and comp.args else {},
            'pins': dict(comp.pins) if hasattr(comp, 'pins') and comp.pins else {},
            'type': _get_component_type(comp.definition if hasattr(comp, 'definition') else None)
        }

    # 分类
    classified = classify_components(serialized)

    # 统计信息
    statistics = {
        'total': len(serialized),
        'by_type': {},
        'by_category': {}
    }

    for category, comps in classified.items():
        statistics['by_category'][category] = len(comps)

    # 按原始 type 统计
    type_count = {}
    for comp in serialized.values():
        t = comp['definition'] or 'unknown'
        type_count[t] = type_count.get(t, 0) + 1
    statistics['by_type'] = type_count

    # 生成摘要
    summary = {
        'total_components': len(serialized),
        'categories': []
    }

    for category, comps in sorted(classified.items(), key=lambda x: len(x[1]), reverse=True):
        summary['categories'].append({
            'name': category,
            'count': len(comps),
            'percentage': round((len(comps) / len(serialized)) * 100, 2) if serialized else 0
        })

    result = {
        'rid': rid,
        'timestamp': __import__('datetime').datetime.now().isoformat(),
        'statistics': statistics,
        'classified': classified if detailed else {k: len(v) for k, v in classified.items()},
        'summary': summary
    }

    if detailed:
        result['details'] = {
            category: {
                'count': len(comps),
                'components': [
                    {
                        'id': c['id'],
                        'label': c['label'],
                        'definition': c['definition'],
                        'parameter_count': len(c['args']) if c['args'] else 0
                    }
                    for c in comps
                ]
            }
            for category, comps in classified.items()
        }

    return result


def get_component_by_id(rid: str, component_id: str) -> Optional[Dict[str, Any]]:
    """
    根据 ID 查询元件
    """
    model = cloudpss.Model.fetch(rid)
    components = model.getAllComponents()

    for key, comp in components.items():
        if key == component_id or (hasattr(comp, 'id') and comp.id == component_id):
            return {
                'id': comp.id if hasattr(comp, 'id') else str(comp),
                'label': comp.label if hasattr(comp, 'label') else '',
                'definition': comp.definition if hasattr(comp, 'definition') else '',
                'args': dict(comp.args) if hasattr(comp, 'args') and comp.args else {},
                'pins': dict(comp.pins) if hasattr(comp, 'pins') and comp.pins else {},
                'type': _get_component_type(comp.definition if hasattr(comp, 'definition') else None)
            }
    return None


def get_component_parameters(rid: str, component_id: str) -> Optional[Dict[str, Any]]:
    """
    获取元件参数
    """
    component = get_component_by_id(rid, component_id)
    if not component:
        return None

    return {
        'id': component['id'],
        'label': component['label'],
        'definition': component['definition'],
        'type': component['type'],
        'parameters': component['args'],
        'parameter_count': len(component['args']) if component['args'] else 0
    }


def get_components_by_type(rid: str, component_type: str) -> List[Dict[str, Any]]:
    """
    根据类型获取元件
    """
    model = cloudpss.Model.fetch(rid)
    components = model.getAllComponents()

    result = []
    for key, comp in components.items():
        comp_type = _get_component_type(comp.definition if hasattr(comp, 'definition') else None)
        if comp_type == component_type:
            result.append({
                'id': comp.id if hasattr(comp, 'id') else str(comp),
                'label': comp.label if hasattr(comp, 'label') else '',
                'definition': comp.definition if hasattr(comp, 'definition') else '',
                'args': dict(comp.args) if hasattr(comp, 'args') and comp.args else {},
                'type': comp_type
            })

    return result


# =====================================================
# N-1 Contingency Scan APIs
# =====================================================

def run_contingency_scan(rid: str, job_type: str = 'powerFlow',
                         elements: List[str] = None,
                         max_scans: int = 10) -> List[Dict]:
    """
    运行 N-1 扫描分析

    遍历指定元件列表，对每个元件执行开断仿真，收集结果

    Args:
        rid: 项目 rid，格式为 'model/owner/key'
        job_type: 计算方案类型 ('powerFlow', 'emtp', etc.)
        elements: 要扫描的元件 ID 列表，None 表示扫描所有线路和变压器
        max_scans: 最大扫描数量，默认10个（避免耗时过长）

    Returns:
        扫描结果列表，每个元素包含：
        - element_id: 开断元件 ID
        - element_type: 元件类型 ('line', 'transformer')
        - element_name: 元件名称
        - status: 仿真状态 ('success', 'failed', 'convergence_error')
        - buses: 节点数据（电压等）
        - branches: 支路数据（功率等）
        - violations: 越限列表
        - severity: 严重程度 ('normal', 'warning', 'critical')
    """
    import time

    model = cloudpss.Model.fetch(rid)

    # 使用 getAllComponents 获取所有组件（新API）
    components = model.getAllComponents()

    # 确定要扫描的元件
    if elements is None:
        # 自动识别所有线路和变压器
        elements_to_scan = []
        for key, comp in components.items():
            # 组件可能是对象或字典，兼容两种访问方式
            if isinstance(comp, dict):
                comp_def = comp.get('definition', '')
            else:
                comp_def = getattr(comp, 'definition', '')
            comp_def_lower = str(comp_def).lower()
            # 线路和变压器通常包含 'line', 'branch', 'transformer', 'xfmr' 等关键字
            if any(kw in comp_def_lower for kw in ['line', 'branch', 'transformer', 'xfmr']):
                elements_to_scan.append(key)
    else:
        elements_to_scan = elements

    # 限制扫描数量
    if len(elements_to_scan) > max_scans:
        elements_to_scan = elements_to_scan[:max_scans]

    results = []

    for element_id in elements_to_scan:
        scan_result = {
            'element_id': element_id,
            'element_type': 'unknown',
            'element_name': '',
            'status': 'pending',
            'buses': [],
            'branches': [],
            'violations': [],
            'severity': 'normal',
            'error': None
        }

        # 保存原始组件信息用于恢复
        original_comp = components.get(element_id)
        if not original_comp:
            scan_result['status'] = 'failed'
            scan_result['error'] = f'Element {element_id} not found'
            results.append(scan_result)
            continue

        try:
            # 获取元件信息
            comp_def = original_comp.get('definition', '') if isinstance(original_comp, dict) else getattr(original_comp, 'definition', '')
            comp_label = original_comp.get('label', element_id) if isinstance(original_comp, dict) else getattr(original_comp, 'label', element_id)
            comp_args = original_comp.get('args', {}) if isinstance(original_comp, dict) else getattr(original_comp, 'args', {})
            comp_pins = original_comp.get('pins', {}) if isinstance(original_comp, dict) else getattr(original_comp, 'pins', {})

            # 识别元件类型
            comp_def_lower = str(comp_def).lower()
            if 'transformer' in comp_def_lower or 'xfmr' in comp_def_lower:
                scan_result['element_type'] = 'transformer'
            elif 'line' in comp_def_lower or 'branch' in comp_def_lower:
                scan_result['element_type'] = 'line'
            else:
                scan_result['element_type'] = 'other'

            scan_result['element_name'] = comp_label

            # 开断元件：使用 removeComponent 模拟N-1（新API）
            model.removeComponent(element_id)
            model.save()

            # 获取第一个 job 和 config
            if not model.jobs:
                scan_result['status'] = 'failed'
                scan_result['error'] = 'No job defined in model'
                # 恢复元件
                model.addComponent(comp_def, comp_label, comp_args, comp_pins)
                model.save()
                results.append(scan_result)
                continue

            job = model.jobs[0]
            config = model.configs[0] if model.configs else None

            # 运行仿真
            runner = model.run(job, config) if config else model.run(job)

            # 等待完成
            job_id = runner.id if hasattr(runner, 'id') else runner.job_id
            timeout = 120  # 2 分钟超时
            start_time = time.time()

            while not runner.status():
                if time.time() - start_time > timeout:
                    scan_result['status'] = 'failed'
                    scan_result['error'] = 'Simulation timeout'
                    # 恢复元件
                    model.addComponent(comp_def, comp_label, comp_args, comp_pins)
                    model.save()
                    results.append(scan_result)
                    break
                time.sleep(0.5)
            else:
                # 仿真完成，获取结果
                result = runner.result
                if result:
                    # 获取节点和支路数据
                    buses_raw = result.getBuses() if hasattr(result, 'getBuses') else []
                    branches_raw = result.getBranches() if hasattr(result, 'getBranches') else []

                    # 解析数据
                    if buses_raw and isinstance(buses_raw, list) and len(buses_raw) > 0:
                        table_data = buses_raw[0].get('data') if isinstance(buses_raw[0], dict) else None
                        scan_result['buses'] = _parse_table_result(table_data) if table_data else buses_raw

                    if branches_raw and isinstance(branches_raw, list) and len(branches_raw) > 0:
                        table_data = branches_raw[0].get('data') if isinstance(branches_raw[0], dict) else None
                        scan_result['branches'] = _parse_table_result(table_data) if table_data else branches_raw

                    scan_result['status'] = 'success'
                else:
                    scan_result['status'] = 'convergence_error'
                    scan_result['error'] = 'No result (convergence failure?)'

            # 恢复元件状态
            model.addComponent(comp_def, comp_label, comp_args, comp_pins)
            model.save()

        except Exception as e:
            scan_result['status'] = 'failed'
            scan_result['error'] = str(e)
            # 尝试恢复元件
            try:
                if original_comp:
                    comp_def = original_comp.get('definition', '') if isinstance(original_comp, dict) else getattr(original_comp, 'definition', '')
                    comp_label = original_comp.get('label', element_id) if isinstance(original_comp, dict) else getattr(original_comp, 'label', element_id)
                    comp_args = original_comp.get('args', {}) if isinstance(original_comp, dict) else getattr(original_comp, 'args', {})
                    comp_pins = original_comp.get('pins', {}) if isinstance(original_comp, dict) else getattr(original_comp, 'pins', {})
                    model.addComponent(comp_def, comp_label, comp_args, comp_pins)
                    model.save()
            except Exception as restore_error:
                scan_result['error'] += f' | Restore failed: {str(restore_error)}'

        results.append(scan_result)

    return results


def check_voltage_violations(buses: List[Dict], limits: Dict = None) -> List[Dict]:
    """
    检查电压越限

    Args:
        buses: 节点数据列表，每个节点包含 Vm (电压幅值), Bus (节点 ID) 等字段
        limits: 电压限制配置
                {
                    'min': 0.95,  # 标幺值下限
                    'max': 1.05,  # 标幺值上限
                    'critical_min': 0.90,  # 严重越限下限
                    'critical_max': 1.10,  # 严重越限上限
                    'bus_limits': {}  # 特定节点的自定义限制
                }

    Returns:
        越限列表，每个元素包含：
        - bus_id: 节点 ID
        - bus_name: 节点名称
        - voltage: 电压值 (pu)
        - limit_min: 下限
        - limit_max: 上限
        - violation_type: 'low' | 'high'
        - severity: 'warning' | 'critical'
    """
    if limits is None:
        limits = {
            'min': 0.95,
            'max': 1.05,
            'critical_min': 0.90,
            'critical_max': 1.10
        }

    violations = []

    for bus in buses:
        vm = bus.get('Vm') or bus.get('vm') or bus.get('voltage') or 0
        bus_id = bus.get('Bus') or bus.get('bus_id') or bus.get('id') or ''
        bus_name = bus.get('BusName') or bus.get('name') or bus_id

        # 检查是否有特定节点的限制
        bus_limits = limits.get('bus_limits', {})
        if bus_id in bus_limits:
            limit_min = bus_limits[bus_id].get('min', limits['min'])
            limit_max = bus_limits[bus_id].get('max', limits['max'])
            critical_min = bus_limits[bus_id].get('critical_min', limits.get('critical_min', 0.90))
            critical_max = bus_limits[bus_id].get('critical_max', limits.get('critical_max', 1.10))
        else:
            limit_min = limits['min']
            limit_max = limits['max']
            critical_min = limits.get('critical_min', 0.90)
            critical_max = limits.get('critical_max', 1.10)

        violation = None

        if vm < limit_min:
            severity = 'critical' if vm < critical_min else 'warning'
            violation = {
                'bus_id': bus_id,
                'bus_name': bus_name,
                'voltage': vm,
                'limit_min': limit_min,
                'limit_max': limit_max,
                'violation_type': 'low',
                'severity': severity,
                'deviation': limit_min - vm
            }
        elif vm > limit_max:
            severity = 'critical' if vm > critical_max else 'warning'
            violation = {
                'bus_id': bus_id,
                'bus_name': bus_name,
                'voltage': vm,
                'limit_min': limit_min,
                'limit_max': limit_max,
                'violation_type': 'high',
                'severity': severity,
                'deviation': vm - limit_max
            }

        if violation:
            violations.append(violation)

    return violations


def check_line_overloads(branches: List[Dict], limits: Dict = None) -> List[Dict]:
    """
    检查线路过载

    Args:
        branches: 支路数据列表，每个支路包含：
                  - Pij: 从 i 端到 j 端的有功功率
                  - Qij: 从 i 端到 j 端的无功功率
                  - Sij: 从 i 端到 j 端的视在功率
                  - id/Branch: 支路 ID
                  - rate/limit: 额定容量
        limits: 线路负载限制配置
                {
                    'loading_threshold': 100,  # 过载百分比阈值
                    'critical_threshold': 120,  # 严重过载百分比阈值
                    'default_rate': 100,  # 默认额定容量 (MW)
                    'branch_limits': {}  # 特定支路的自定义限制
                }

    Returns:
        过载列表，每个元素包含：
        - branch_id: 支路 ID
        - branch_name: 支路名称
        - loading: 负载百分比 (%)
        - power_flow: 实际功率 (MW)
        - rate: 额定容量 (MW)
        - severity: 'warning' | 'critical'
    """
    if limits is None:
        limits = {
            'loading_threshold': 100,
            'critical_threshold': 120,
            'default_rate': 100
        }

    overloads = []

    for branch in branches:
        # 获取功率数据
        pij = branch.get('Pij') or branch.get('pij') or branch.get('p_from') or 0
        qij = branch.get('Qij') or branch.get('qij') or branch.get('q_from') or 0

        # 计算视在功率
        sij = (pij ** 2 + qij ** 2) ** 0.5

        # 获取支路 ID 和名称
        branch_id = branch.get('id') or branch.get('Branch') or branch.get('branch_id') or ''
        branch_name = branch.get('Branch') or branch.get('name') or branch.get('branch_name') or branch_id

        # 获取额定容量
        rate = branch.get('rate') or branch.get('limit') or branch.get('rateMVA') or branch.get('Sn')
        if rate is None:
            # 检查是否有特定支路的限制
            branch_limits = limits.get('branch_limits', {})
            if branch_id in branch_limits:
                rate = branch_limits[branch_id]
            else:
                rate = limits.get('default_rate', 100)

        if rate <= 0:
            rate = limits.get('default_rate', 100)

        # 计算负载百分比
        loading_pct = abs(sij) / rate * 100

        # 检查是否过载
        threshold = limits.get('loading_threshold', 100)
        critical_threshold = limits.get('critical_threshold', 120)

        if loading_pct >= threshold:
            severity = 'critical' if loading_pct >= critical_threshold else 'warning'
            overloads.append({
                'branch_id': branch_id,
                'branch_name': branch_name,
                'loading': round(loading_pct, 1),
                'power_flow': round(abs(sij), 2),
                'rate': rate,
                'severity': severity,
                'overload_amount': round(abs(sij) - rate, 2)
            })

    return overloads


# =====================================================
# Harmonic Analysis APIs
# =====================================================

def analyze_harmonic(job_id: str, channel: str, fundamental_freq: float = 50.0,
                     plot_index: int = 0) -> Dict[str, Any]:
    """
    分析电磁暂态仿真结果的谐波特性

    对指定通道的时域信号进行 FFT 分析，提取谐波含量

    Args:
        job_id: 任务 ID
        channel: 通道名称（如 'Ia', 'Vb', 'Ic' 等）
        fundamental_freq: 基波频率 (Hz)，默认 50 Hz
        plot_index: 输出分组索引

    Returns:
        谐波分析结果字典，包含：
        - fundamental_freq: 基波频率 (Hz)
        - fundamental_magnitude: 基波幅值
        - harmonics: 各次谐波列表，每项包含：
          - order: 谐波次数 (1=基波，2=2 次谐波，...)
          - frequency: 频率 (Hz)
          - magnitude: 幅值
          - magnitude_pct: 相对于基波的百分比
          - phase: 相位 (弧度)
        - thd: 总谐波畸变率 (THD)
        - sampling_rate: 采样率 (Hz)
        - channel: 通道名称
        - job_id: 任务 ID

    Raises:
        ValueError: 当通道不存在或数据无效时
    """
    job = cloudpss.Job.fetch(job_id)
    result = job.view(cloudpss.EMTView)

    # 获取通道数据
    channels = result.getPlotChannelNames(plot_index)
    if channel not in channels:
        raise ValueError(f"Channel '{channel}' not found. Available: {channels}")

    data = result.getPlotChannelData(plot_index, channel)

    # 提取时间和信号值
    time = np.array(data.get('x', []) or data.get('time', []))
    signal = np.array(data.get('y', []) or data.get('values', []))

    if len(time) < 2 or len(signal) < 2:
        raise ValueError("Insufficient data points for harmonic analysis")

    # 计算采样率
    dt = np.mean(np.diff(time))
    sampling_rate = 1.0 / dt

    # 使用 FFT 分析
    if FFTAnalyzer:
        frequencies, magnitudes, phases = FFTAnalyzer.compute_fft(
            time, signal, sampling_rate=sampling_rate, window='hann'
        )

        # 提取谐波含量
        harmonics_dict = FFTAnalyzer.extract_harmonic_content(
            frequencies, magnitudes,
            fundamental_hz=fundamental_freq,
            max_harmonic=20,
            tolerance_hz=1.0
        )

        # 获取基波幅值
        fundamental_magnitude = harmonics_dict.get(1, 0)

        # 构建谐波列表
        harmonics_list = []
        for order, magnitude in harmonics_dict.items():
            harmonics_list.append({
                'order': order,
                'frequency': round(order * fundamental_freq, 2),
                'magnitude': round(float(magnitude), 6),
                'magnitude_pct': round(float(magnitude / fundamental_magnitude * 100) if fundamental_magnitude > 0 else 0, 2),
                'phase': 0.0  # Phase from FFT would need additional calculation
            })

        # 计算 THD
        thd = calculate_thd_internal(magnitudes, fundamental_magnitude, fundamental_freq, sampling_rate)

        return {
            'fundamental_freq': fundamental_freq,
            'fundamental_magnitude': round(float(fundamental_magnitude), 6),
            'harmonics': harmonics_list,
            'thd': round(thd, 4),
            'sampling_rate': round(sampling_rate, 2),
            'channel': channel,
            'job_id': job_id,
            'num_samples': len(signal),
            'duration_sec': round(time[-1] - time[0], 4) if len(time) > 1 else 0
        }
    else:
        # Fallback FFT implementation
        frequencies, magnitudes, phases = _compute_fft_fallback(time, signal, sampling_rate)

        # Simple harmonic extraction
        harmonics_list = []
        fundamental_magnitude = 0

        for n in range(1, 21):  # Up to 20th harmonic
            target_freq = n * fundamental_freq
            idx = np.argmin(np.abs(frequencies - target_freq))
            if np.abs(frequencies[idx] - target_freq) < 1.0:
                magnitude = float(magnitudes[idx])
                if n == 1:
                    fundamental_magnitude = magnitude
                harmonics_list.append({
                    'order': n,
                    'frequency': round(target_freq, 2),
                    'magnitude': round(magnitude, 6),
                    'magnitude_pct': round(magnitude / fundamental_magnitude * 100 if fundamental_magnitude > 0 else 0, 2),
                    'phase': float(phases[idx])
                })

        thd = calculate_thd_internal(magnitudes, fundamental_magnitude, fundamental_freq, sampling_rate)

        return {
            'fundamental_freq': fundamental_freq,
            'fundamental_magnitude': round(float(fundamental_magnitude), 6),
            'harmonics': harmonics_list,
            'thd': round(thd, 4),
            'sampling_rate': round(sampling_rate, 2),
            'channel': channel,
            'job_id': job_id
        }


def _compute_fft_fallback(time: np.ndarray, signal: np.ndarray,
                          sampling_rate: float) -> tuple:
    """
    Fallback FFT computation when FFTAnalyzer is not available

    Args:
        time: Time array
        signal: Signal array
        sampling_rate: Sampling rate in Hz

    Returns:
        Tuple of (frequencies, magnitudes, phases)
    """
    from scipy import fft

    n = len(signal)

    # Apply Hann window
    window = np.hanning(n)
    signal_windowed = signal * window

    # Compute FFT
    fft_result = fft.fft(signal_windowed)
    fft_freqs = fft.fftfreq(n, d=1.0 / sampling_rate)

    # Take positive frequencies only
    positive_idx = fft_freqs >= 0
    frequencies = fft_freqs[positive_idx]
    fft_positive = fft_result[positive_idx]

    # Compute magnitude and phase
    magnitudes = np.abs(fft_positive) * 2.0 / n
    magnitudes[0] /= 2.0  # DC component
    phases = np.angle(fft_positive)

    return frequencies, magnitudes, phases


def calculate_thd_internal(magnitudes: np.ndarray, fundamental_magnitude: float,
                           fundamental_freq: float, sampling_rate: float,
                           max_harmonic: int = 20) -> float:
    """
    Internal THD calculation helper

    THD = sqrt(sum of squares of harmonic magnitudes) / fundamental magnitude

    Args:
        magnitudes: Magnitude spectrum
        fundamental_magnitude: Fundamental (1st harmonic) magnitude
        fundamental_freq: Fundamental frequency in Hz
        sampling_rate: Sampling rate in Hz
        max_harmonic: Maximum harmonic order to consider

    Returns:
        Total Harmonic Distortion (THD) as a decimal (multiply by 100 for percentage)
    """
    if fundamental_magnitude <= 0:
        return 0.0

    # Find harmonic magnitudes
    harmonic_power = 0.0
    freq_resolution = sampling_rate / len(magnitudes)

    for n in range(2, max_harmonic + 1):  # Start from 2nd harmonic
        harmonic_freq = n * fundamental_freq
        idx = int(harmonic_freq / freq_resolution)
        if idx < len(magnitudes):
            harmonic_power += magnitudes[idx] ** 2

    thd = np.sqrt(harmonic_power) / fundamental_magnitude
    return thd


def calculate_thd(signal_data: Dict[str, Any], fundamental_freq: float = 50.0,
                  sampling_rate: float = None) -> Dict[str, Any]:
    """
    计算总谐波畸变率 (THD)

    THD = sqrt(sum of squares of all harmonic magnitudes) / fundamental magnitude
    THD% = THD * 100

    Args:
        signal_data: 信号数据字典，包含：
                     - time: 时间数组
                     - signal: 信号值数组
                     - sampling_rate: 采样率 (可选，如不提供则从 time 计算)
        fundamental_freq: 基波频率 (Hz)，默认 50 Hz
        sampling_rate: 采样率 (Hz)，如不提供则从 time 计算

    Returns:
        THD 计算结果，包含：
        - thd: THD 值（小数形式）
        - thd_pct: THD 百分比
        - fundamental_magnitude: 基波幅值
        - harmonic_magnitudes: 各次谐波幅值字典
        - num_harmonics: 分析的谐波次数
        - sampling_rate: 使用的采样率
    """
    time = np.array(signal_data.get('time', signal_data.get('x', [])))
    signal = np.array(signal_data.get('signal', signal_data.get('y', [])))

    if len(time) < 2 or len(signal) < 2:
        raise ValueError("Insufficient data points for THD calculation")

    if sampling_rate is None:
        dt = np.mean(np.diff(time))
        if dt <= 0:
            raise ValueError("Invalid time data: time must be monotonically increasing")
        sampling_rate = 1.0 / dt

    # Compute FFT
    if FFTAnalyzer:
        frequencies, magnitudes, _ = FFTAnalyzer.compute_fft(
            time, signal, sampling_rate=sampling_rate, window='hann'
        )
        harmonics_dict = FFTAnalyzer.extract_harmonic_content(
            frequencies, magnitudes, fundamental_hz=fundamental_freq, max_harmonic=20
        )
    else:
        frequencies, magnitudes, _ = _compute_fft_fallback(time, signal, sampling_rate)
        harmonics_dict = {}
        for n in range(1, 21):
            target_freq = n * fundamental_freq
            idx = np.argmin(np.abs(frequencies - target_freq))
            if np.abs(frequencies[idx] - target_freq) < 1.0:
                harmonics_dict[n] = float(magnitudes[idx])

    # Get fundamental magnitude
    fundamental_magnitude = harmonics_dict.get(1, 0)

    if fundamental_magnitude <= 0:
        return {
            'thd': 0.0,
            'thd_pct': 0.0,
            'fundamental_magnitude': 0.0,
            'harmonic_magnitudes': harmonics_dict,
            'num_harmonics': len(harmonics_dict),
            'sampling_rate': sampling_rate,
            'warning': 'No fundamental component found'
        }

    # Calculate THD (sum of squares of harmonics 2-20)
    harmonic_power = sum(mag ** 2 for n, mag in harmonics_dict.items() if n >= 2)
    thd = np.sqrt(harmonic_power) / fundamental_magnitude

    return {
        'thd': round(float(thd), 6),
        'thd_pct': round(float(thd * 100), 4),
        'fundamental_magnitude': round(float(fundamental_magnitude), 6),
        'harmonic_magnitudes': {k: round(v, 6) for k, v in harmonics_dict.items()},
        'num_harmonics': len(harmonics_dict),
        'sampling_rate': round(sampling_rate, 2)
    }


# GB/T 14549-1993 谐波限值标准
GB_T_14549_LIMITS = {
    # 电压总谐波畸变率限值 (按电压等级)
    'voltage_thd_limits': {
        0.38: 5.0,      # 0.38 kV: 5.0%
        6: 4.0,         # 6 kV: 4.0%
        10: 4.0,        # 10 kV: 4.0%
        35: 3.0,        # 35 kV: 3.0%
        66: 3.0,        # 66 kV: 3.0%
        110: 2.0,       # 110 kV: 2.0%
        220: 2.0,       # 220 kV: 2.0%
        500: 1.5,       # 500 kV: 1.5%
    },
    # 电压各次谐波含有率限值 (奇次谐波)
    'voltage_odd_harmonic_limits': {
        0.38: {3: 4.0, 5: 6.0, 7: 5.0, 9: 1.5, 11: 3.5, 13: 3.0, 15: 0.7, 17: 2.0, 19: 1.8, 21: 0.5},
        6: {3: 2.5, 5: 4.0, 7: 3.0, 9: 1.0, 11: 2.0, 13: 1.8, 15: 0.5, 17: 1.2, 19: 1.0, 21: 0.3},
        10: {3: 2.5, 5: 4.0, 7: 3.0, 9: 1.0, 11: 2.0, 13: 1.8, 15: 0.5, 17: 1.2, 19: 1.0, 21: 0.3},
        35: {3: 2.0, 5: 3.0, 7: 2.5, 9: 0.8, 11: 1.5, 13: 1.4, 15: 0.4, 17: 1.0, 19: 0.8, 21: 0.2},
    },
    # 电压偶次谐波含有率限值
    'voltage_even_harmonic_limits': {
        0.38: {2: 2.5, 4: 2.0, 6: 1.5, 8: 1.0, 10: 0.8, 12: 0.6, 14: 0.5, 16: 0.4, 18: 0.3, 20: 0.2},
        6: {2: 1.5, 4: 1.2, 6: 1.0, 8: 0.7, 10: 0.5, 12: 0.4, 14: 0.3, 16: 0.25, 18: 0.2, 20: 0.15},
        10: {2: 1.5, 4: 1.2, 6: 1.0, 8: 0.7, 10: 0.5, 12: 0.4, 14: 0.3, 16: 0.25, 18: 0.2, 20: 0.15},
        35: {2: 1.2, 4: 1.0, 6: 0.8, 8: 0.5, 10: 0.4, 12: 0.3, 14: 0.25, 16: 0.2, 18: 0.15, 20: 0.1},
    }
}


def check_harmonic_compliance(thd_result: Dict[str, Any], standard: str = "GB/T 14549",
                               voltage_level: float = 10.0) -> Dict[str, Any]:
    """
    检查谐波是否符合标准限值

    根据 GB/T 14549-1993《电能质量 公用电网谐波》标准进行合规性检查

    Args:
        thd_result: THD 计算结果字典（来自 calculate_thd 或 analyze_harmonic）
        standard: 标准名称，目前支持 "GB/T 14549"
        voltage_level: 电压等级 (kV)，用于确定适用的限值

    Returns:
        合规性检查结果，包含：
        - standard: 使用的标准名称
        - voltage_level: 电压等级 (kV)
        - overall_compliance: 是否整体合规 (True/False)
        - thd_compliance: THD 合规情况
          - measured: 实测 THD
          - limit: 限值
          - compliant: 是否合规
        - harmonic_violations: 谐波越限列表
          - order: 谐波次数
          - measured: 实测值 (%)
          - limit: 限值 (%)
          - violation: 越限量
        - violations_count: 越限总数
        - recommendations: 建议措施
    """
    result = {
        'standard': standard,
        'voltage_level': voltage_level,
        'overall_compliance': True,
        'thd_compliance': None,
        'harmonic_violations': [],
        'violations_count': 0,
        'recommendations': []
    }

    if standard != "GB/T 14549":
        result['warning'] = f"Standard '{standard}' not supported, using GB/T 14549"
        standard = "GB/T 14549"

    # 获取最接近的电压等级
    available_voltages = sorted(GB_T_14549_LIMITS['voltage_thd_limits'].keys())
    voltage_key = min(available_voltages, key=lambda v: abs(v - voltage_level))

    # 检查 THD 合规性
    thd_pct = thd_result.get('thd_pct', 0)
    thd_limit = GB_T_14549_LIMITS['voltage_thd_limits'].get(voltage_key, 5.0)

    result['thd_compliance'] = {
        'measured': round(thd_pct, 4),
        'limit': thd_limit,
        'compliant': thd_pct <= thd_limit
    }

    if not result['thd_compliance']['compliant']:
        result['overall_compliance'] = False
        result['recommendations'].append(
            f"总谐波畸变率 (THD={thd_pct:.2f}%) 超过限值 ({thd_limit}%)，建议安装滤波器"
        )

    # 检查各次谐波合规性
    harmonic_magnitudes = thd_result.get('harmonic_magnitudes', {})
    fundamental = harmonic_magnitudes.get(1, 0)

    if fundamental > 0:
        odd_limits = GB_T_14549_LIMITS['voltage_odd_harmonic_limits'].get(voltage_key, {})
        even_limits = GB_T_14549_LIMITS['voltage_even_harmonic_limits'].get(voltage_key, {})

        for order, magnitude in harmonic_magnitudes.items():
            if order <= 1:
                continue  # Skip fundamental

            magnitude_pct = (magnitude / fundamental) * 100

            # 确定适用的限值
            if order % 2 == 1:  # Odd harmonic
                limit = odd_limits.get(order)
            else:  # Even harmonic
                limit = even_limits.get(order)

            if limit is None:
                continue

            if magnitude_pct > limit:
                violation = {
                    'order': order,
                    'harmonic_type': '奇次' if order % 2 == 1 else '偶次',
                    'measured': round(magnitude_pct, 4),
                    'limit': limit,
                    'violation': round(magnitude_pct - limit, 4)
                }
                result['harmonic_violations'].append(violation)
                result['violations_count'] += 1
                result['overall_compliance'] = False

    # 生成建议
    if result['violations_count'] > 0:
        odd_violations = [v for v in result['harmonic_violations'] if v['harmonic_type'] == '奇次']
        even_violations = [v for v in result['harmonic_violations'] if v['harmonic_type'] == '偶次']

        if odd_violations:
            max_odd = max(odd_violations, key=lambda x: x['order'])
            result['recommendations'].append(
                f"主要奇次谐波为 {max_odd['order']} 次 ({max_odd['measured']:.2f}%)，建议考虑单调谐滤波器"
            )

        if even_violations:
            result['recommendations'].append(
                f"检测到 {len(even_violations)} 项偶次谐波越限，可能存在半波整流或不对称负荷"
            )

    return result


def impedance_scan(job_id: str, frequency_range: tuple = (10, 5000),
                   num_points: int = 500) -> Dict[str, Any]:
    """
    频域阻抗扫描分析

    通过注入不同频率的小扰动信号，分析系统的频率响应特性
    用于检测谐振风险和系统稳定性

    Args:
        job_id: 任务 ID
        frequency_range: 频率扫描范围 (min_freq, max_freq) in Hz
        num_points: 扫描点数

    Returns:
        阻抗扫描结果，包含：
        - frequencies: 扫描频率列表 (Hz)
        - impedance_magnitude: 阻抗幅值曲线
        - impedance_phase: 阻抗相位曲线
        - resonance_points: 谐振点列表
          - frequency: 谐振频率
          - impedance: 谐振阻抗
          - type: 'parallel' | 'series'
        - critical_frequencies: 关键频率（如 50Hz 整数倍）
    """
    # Note: This is a simplified implementation
    # Full impedance scan requires frequency sweep simulation

    import numpy as np

    # Generate frequency sweep
    min_freq, max_freq = frequency_range
    frequencies = np.logspace(np.log10(min_freq), np.log10(max_freq), num_points)

    # In a real implementation, this would:
    # 1. Run multiple EMT simulations with frequency-dependent injection
    # 2. Measure voltage/current response at each frequency
    # 3. Calculate Z = V/I for each frequency

    # For now, return a placeholder structure
    result = {
        'frequencies': frequencies.tolist(),
        'impedance_magnitude': [],  # Would be calculated from simulation
        'impedance_phase': [],       # Would be calculated from simulation
        'resonance_points': [],
        'critical_frequencies': [],
        'job_id': job_id,
        'frequency_range': frequency_range,
        'num_points': num_points,
        'status': 'placeholder',
        'note': 'Full impedance scan requires frequency sweep simulation capability'
    }

    # Identify critical frequencies (multiples of 50Hz)
    for n in range(1, int(max_freq / 50) + 1):
        freq = n * 50
        if min_freq <= freq <= max_freq:
            result['critical_frequencies'].append({
                'frequency': freq,
                'harmonic_order': n,
                'type': 'characteristic' if n % 2 == 1 else 'non-characteristic'
            })

    return result


# =====================================================
# Batch Simulation APIs
# =====================================================

def run_batch_simulations(scenarios: List[Dict[str, Any]],
                          rid: str,
                          max_parallel: int = 5,
                          job_type: str = 'powerFlow') -> List[Dict[str, Any]]:
    """
    批量运行仿真场景

    支持多场景并行执行，用于参数扫描、敏感性分析等

    Args:
        scenarios: 场景列表，每个场景包含：
                   - name: 场景名称
                   - config: 参数配置字典
                   - components: 要更新的元件列表 (可选)
                     - element_id: 元件 ID
                     - args: 元件参数
        rid: 项目 rid
        max_parallel: 最大并行数（默认 5）
        job_type: 计算方案类型 ('powerFlow', 'emtp')

    Returns:
        仿真结果列表，每个元素包含：
        - scenario_name: 场景名称
        - job_id: 任务 ID
        - status: 仿真状态 ('success', 'failed', 'timeout')
        - result: 仿真结果数据
        - error: 错误信息（如果有）
        - execution_time: 执行时间（秒）
    """
    import time
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading

    # 只读取一次原始模型，每个场景使用独立执行（避免资源冲突）
    base_model = cloudpss.Model.fetch(rid)
    results = []
    lock = threading.Lock()

    def run_single_scenario(scenario: Dict[str, Any], scenario_index: int) -> Dict[str, Any]:
        """运行单个场景 - 每个场景独立执行，避免并行冲突"""
        start_time = time.time()
        result = {
            'scenario_name': scenario.get('name', f'Scenario_{scenario_index}'),
            'scenario_index': scenario_index,
            'job_id': None,
            'status': 'pending',
            'result': None,
            'error': None,
            'execution_time': 0
        }

        try:
            # 1. 重新获取模型（确保每个场景使用独立的模型实例）
            model = cloudpss.Model.fetch(rid)

            # 2. 应用场景配置
            config = scenario.get('config')
            components = scenario.get('components', [])

            # 更新元件参数
            for comp in components:
                element_id = comp.get('element_id')
                args = comp.get('args', {})
                if element_id and args:
                    # 更新元件
                    model.updateComponent(element_id, args=args)

            # 保存修改（使用临时模型名称避免冲突）
            # 不在云端保存，只用于本次仿真
            # model.save()  # 已移除：避免并行保存冲突

            # 3. 运行仿真
            if not model.jobs:
                raise ValueError(f'No job defined in model for scenario {scenario_index}')

            job = model.jobs[0]
            config_obj = model.configs[0] if model.configs else None

            runner = model.run(job, config_obj) if config_obj else model.run(job)
            job_id = runner.id if hasattr(runner, 'id') else runner.job_id
            result['job_id'] = job_id

            # 4. 等待完成
            timeout = 180  # 3 分钟超时
            wait_start = time.time()

            while not runner.status():
                if time.time() - wait_start > timeout:
                    raise TimeoutError('Simulation timeout')
                time.sleep(0.5)

            # 5. 获取结果
            sim_result = runner.result
            if sim_result:
                if hasattr(sim_result, 'getBuses') and hasattr(sim_result, 'getBranches'):
                    buses_raw = sim_result.getBuses()
                    branches_raw = sim_result.getBranches()

                    buses = []
                    if isinstance(buses_raw, list) and len(buses_raw) > 0:
                        table_data = buses_raw[0].get('data') if isinstance(buses_raw[0], dict) else None
                        buses = _parse_table_result(table_data) if table_data else buses_raw

                    branches = []
                    if isinstance(branches_raw, list) and len(branches_raw) > 0:
                        table_data = branches_raw[0].get('data') if isinstance(branches_raw[0], dict) else None
                        branches = _parse_table_result(table_data) if table_data else branches_raw

                    result['result'] = {
                        'buses': buses,
                        'branches': branches
                    }
                else:
                    result['result'] = {
                        'buses': getattr(sim_result, 'buses', []),
                        'branches': getattr(sim_result, 'branches', [])
                    }

                result['status'] = 'success'
            else:
                result['status'] = 'convergence_error'
                result['error'] = 'No result (convergence failure?)'

        except Exception as e:
            result['status'] = 'failed'
            result['error'] = str(e)

        result['execution_time'] = round(time.time() - start_time, 2)
        return result

    # 并行执行场景
    with ThreadPoolExecutor(max_workers=max_parallel) as executor:
        future_to_index = {
            executor.submit(run_single_scenario, scenario, idx): idx
            for idx, scenario in enumerate(scenarios)
        }

        for future in as_completed(future_to_index):
            try:
                result = future.result()
                with lock:
                    results.append(result)
            except Exception as e:
                idx = future_to_index[future]
                with lock:
                    results.append({
                        'scenario_name': scenarios[idx].get('name', f'Scenario_{idx}'),
                        'scenario_index': idx,
                        'job_id': None,
                        'status': 'failed',
                        'result': None,
                        'error': str(e),
                        'execution_time': 0
                    })

    # 按场景索引排序
    results.sort(key=lambda x: x['scenario_index'])
    return results


def parameter_sweep(rid: str, param_name: str, values: List[float],
                    component_id: str = None,
                    max_parallel: int = 5,
                    job_type: str = 'powerFlow') -> List[Dict[str, Any]]:
    """
    参数扫描仿真

    对指定参数进行扫描，分析参数变化对系统的影响

    Args:
        rid: 项目 rid
        param_name: 参数名称（如 'load_level', 'voltage_setpoint'）
        values: 参数值列表
        component_id: 元件 ID（可选，如不提供则使用场景 config）
        max_parallel: 最大并行数（默认 5）
        job_type: 计算方案类型

    Returns:
        扫描结果列表，每个元素包含：
        - param_value: 参数值
        - scenario_name: 场景名称
        - job_id: 任务 ID
        - status: 仿真状态
        - result: 仿真结果
        - error: 错误信息
        - execution_time: 执行时间
    """
    # 构建场景列表
    scenarios = []
    for value in values:
        scenario = {
            'name': f'{param_name}={value}',
            'config': {},
            'components': []
        }

        if component_id:
            # 通过元件参数设置
            scenario['components'].append({
                'element_id': component_id,
                'args': {param_name: value}
            })
        else:
            # 通过场景 config 设置
            scenario['config'][param_name] = value

        scenarios.append(scenario)

    return run_batch_simulations(scenarios, rid, max_parallel, job_type)


def aggregate_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    汇总批量仿真结果

    计算统计指标，生成龙卷风图数据（敏感性分析）

    Args:
        results: 批量仿真结果列表

    Returns:
        汇总结果，包含：
        - total_scenarios: 总场景数
        - success_count: 成功数
        - failed_count: 失败数
        - success_rate: 成功率
        - total_execution_time: 总执行时间
        - avg_execution_time: 平均执行时间
        - statistics: 统计指标
          - voltage: 电压统计 (min/max/avg)
          - power_loss: 网损统计
          - line_loading: 线路负载统计
        - tornado_data: 龙卷风图数据（敏感性分析）
          - parameter: 参数名称
          - impact: 影响程度
          - direction: 影响方向
        - worst_cases: 最严重场景列表
    """
    if not results:
        return {
            'total_scenarios': 0,
            'success_count': 0,
            'failed_count': 0,
            'success_rate': 0,
            'total_execution_time': 0,
            'avg_execution_time': 0,
            'statistics': {},
            'tornado_data': [],
            'worst_cases': []
        }

    total = len(results)
    # Support both 'status' and 'success' fields
    success = sum(1 for r in results if r.get('status') == 'success' or r.get('success', False))
    failed = total - success
    total_time = sum(r.get('execution_time', 0) for r in results)

    aggregated = {
        'total_scenarios': total,
        'success_count': success,
        'failed_count': failed,
        'success_rate': round(success / total * 100, 1) if total > 0 else 0,
        'total_execution_time': round(total_time, 2),
        'avg_execution_time': round(total_time / total, 2) if total > 0 else 0,
        'statistics': {},
        'tornado_data': [],
        'worst_cases': []
    }

    # 收集成功场景的结果数据
    successful_results = [r for r in results if (r.get('status') == 'success' or r.get('success', False)) and r.get('result')]

    if successful_results:
        # 电压统计
        all_voltages = []
        for r in successful_results:
            buses = r['result'].get('buses', [])
            for bus in buses:
                vm = bus.get('Vm') or bus.get('vm') or bus.get('voltage')
                if vm is not None:
                    all_voltages.append(vm)

        if all_voltages:
            aggregated['statistics']['voltage'] = {
                'min': round(min(all_voltages), 4),
                'max': round(max(all_voltages), 4),
                'avg': round(sum(all_voltages) / len(all_voltages), 4),
                'std': round(np.std(all_voltages), 4) if len(all_voltages) > 1 else 0
            }

        # 网损统计
        all_losses = []
        for r in successful_results:
            branches = r['result'].get('branches', [])
            total_loss = sum(b.get('Ploss', 0) for b in branches)
            all_losses.append(total_loss)

        if all_losses:
            aggregated['statistics']['power_loss'] = {
                'min': round(min(all_losses), 4),
                'max': round(max(all_losses), 4),
                'avg': round(sum(all_losses) / len(all_losses), 4),
                'std': round(np.std(all_losses), 4) if len(all_losses) > 1 else 0
            }

        # 线路负载统计
        all_loadings = []
        for r in successful_results:
            branches = r['result'].get('branches', [])
            for branch in branches:
                pij = abs(branch.get('Pij', 0))
                rate = branch.get('rate', 100)
                if rate > 0:
                    loading = pij / rate * 100
                    all_loadings.append(loading)

        if all_loadings:
            aggregated['statistics']['line_loading'] = {
                'min': round(min(all_loadings), 2),
                'max': round(max(all_loadings), 2),
                'avg': round(sum(all_loadings) / len(all_loadings), 2),
                'max_over_100': round(sum(1 for l in all_loadings if l > 100), 0)
            }

        # 龙卷风图数据（敏感性分析）
        # 分析参数变化对关键指标的影响
        tornado_data = []

        # 按场景顺序分析参数影响
        if len(results) >= 2:
            # 计算每个场景的关键指标
            scenario_metrics = []
            for i, r in enumerate(results):
                metric = {
                    'index': i,
                    'name': r.get('scenario_name', f'Scenario_{i}'),
                    'voltage_min': None,
                    'voltage_avg': None,
                    'power_loss': None
                }

                if (r.get('status') == 'success' or r.get('success', False)) and r.get('result'):
                    buses = r['result'].get('buses', [])
                    branches = r['result'].get('branches', [])

                    if buses:
                        voltages = [b.get('Vm') or 0 for b in buses]
                        metric['voltage_min'] = min(voltages) if voltages else None
                        metric['voltage_avg'] = sum(voltages) / len(voltages) if voltages else None

                    if branches:
                        metric['power_loss'] = sum(b.get('Ploss', 0) for b in branches)

                scenario_metrics.append(metric)

            # 计算敏感性（参数变化导致的指标变化）
            base_metric = scenario_metrics[0] if scenario_metrics else None
            if base_metric and base_metric.get('voltage_avg') is not None:
                base_voltage = base_metric['voltage_avg']
                base_loss = base_metric.get('power_loss', 0)

                for metric in scenario_metrics[1:]:
                    if metric['voltage_avg'] is not None:
                        voltage_impact = abs(metric['voltage_avg'] - base_voltage)
                        loss_impact = abs(metric.get('power_loss', 0) - base_loss) if metric.get('power_loss') else 0

                        tornado_data.append({
                            'scenario': metric['name'],
                            'voltage_impact': round(voltage_impact, 4),
                            'voltage_direction': 'increase' if metric['voltage_avg'] > base_voltage else 'decrease',
                            'loss_impact': round(loss_impact, 4),
                            'loss_direction': 'increase' if metric.get('power_loss', 0) > base_loss else 'decrease'
                        })

            # 按影响程度排序
            tornado_data.sort(key=lambda x: x['voltage_impact'], reverse=True)
            aggregated['tornado_data'] = tornado_data[:10]  # Top 10 敏感性场景

        # 最严重场景
        worst_cases = []
        for r in results:
            if (r.get('status') == 'success' or r.get('success', False)) and r.get('result'):
                buses = r['result'].get('buses', [])
                branches = r['result'].get('branches', [])

                issues = {
                    'low_voltage_count': 0,
                    'overload_count': 0,
                    'min_voltage': 1.0,
                    'max_loading': 0
                }

                for bus in buses:
                    vm = bus.get('Vm') or 0
                    if vm < issues['min_voltage']:
                        issues['min_voltage'] = vm
                    if vm < 0.95:
                        issues['low_voltage_count'] += 1

                for branch in branches:
                    pij = abs(branch.get('Pij', 0))
                    rate = branch.get('rate', 100)
                    loading = pij / rate * 100 if rate > 0 else 0
                    if loading > issues['max_loading']:
                        issues['max_loading'] = loading
                    if loading > 100:
                        issues['overload_count'] += 1

                # 计算严重程度评分
                severity_score = (
                    issues['low_voltage_count'] * 10 +
                    issues['overload_count'] * 15 +
                    max(0, 1 - issues['min_voltage'] - 0.05) * 100 +
                    max(0, issues['max_loading'] - 100) * 0.5
                )

                worst_cases.append({
                    'scenario_name': r.get('scenario_name', ''),
                    'severity_score': round(severity_score, 2),
                    'issues': issues
                })

        # 按严重程度排序
        worst_cases.sort(key=lambda x: x['severity_score'], reverse=True)
        aggregated['worst_cases'] = worst_cases[:5]  # Top 5 最严重场景

    return aggregated


# =====================================================
# Topology Analysis Functions - 拓扑分析函数
# =====================================================

def analyze_topology_from_file(file_path: str, options: Dict = None) -> Dict[str, Any]:
    """
    从 JSON 文件分析拓扑结构

    Args:
        file_path: 拓扑结构 JSON 文件路径
        options: 分析选项

    Returns:
        拓扑分析报告
    """
    if options is None:
        options = {
            'include_matrix': True,
            'include_connectivity': True,
            'include_paths': False,
            'include_visualization': True
        }

    import json

    # 读取 JSON 文件
    with open(file_path, 'r', encoding='utf-8') as f:
        topology_data = json.load(f)

    # 提取组件和连接
    components, connections = _extract_topology_components(topology_data)

    result = {
        'file': file_path,
        'timestamp': __import__('datetime').datetime.now().isoformat(),
        'type': 'topology_analysis',
        'summary': {},
        'matrix': None,
        'connectivity': None,
        'paths': None,
        'visualization': None
    }

    # 连接矩阵
    if options.get('include_matrix', True):
        result['matrix'] = _generate_connection_matrix(components, connections)

    # 连通性分析
    if options.get('include_connectivity', True):
        result['connectivity'] = _analyze_connectivity(components, connections)
        result['summary']['island_count'] = result['connectivity']['island_count']
        result['summary']['largest_island_size'] = result['connectivity']['largest_island_size']

    # 度数统计
    result['summary'].update(_calculate_degree_stats(components, connections))
    result['summary']['node_count'] = len(components)
    result['summary']['connection_count'] = len(connections)

    # 可视化数据
    if options.get('include_visualization', True):
        result['visualization'] = _generate_topology_visualization(components, connections)

    return result


def _extract_topology_components(topology_data: Dict) -> tuple:
    """从拓扑数据中提取组件和连接关系"""
    components = []
    connections = []

    raw = topology_data.get('topology', {}).get('raw', {})
    comps = raw.get('components', {})
    mappings = raw.get('mappings', {})

    # 构建 pin 到 component 的映射
    pin_to_component = {}
    for key, comp in comps.items():
        pins = comp.get('pins', {})
        label = comp.get('label', '')
        definition = comp.get('definition', '')

        # 判断是否为电气节点
        is_electrical = (
            'bus' in definition.lower() or
            'bus' in label.lower() or
            '母线' in label or
            len(pins) > 0
        )

        if is_electrical:
            comp_type = _classify_topology_component(comp)
            components.append({
                'id': key,
                'label': label or key,
                'type': comp_type,
                'pins': pins,
                'definition': definition
            })

            # 记录 pin 映射
            for pin_id, node_ref in pins.items():
                if node_ref not in pin_to_component:
                    pin_to_component[node_ref] = []
                pin_to_component[node_ref].append({
                    'component': key,
                    'pin': pin_id
                })

    # 基于共享节点建立连接
    processed = set()
    for node_ref, comp_list in pin_to_component.items():
        if len(comp_list) > 1:
            for i in range(len(comp_list)):
                for j in range(i + 1, len(comp_list)):
                    conn_key = '-'.join(sorted([comp_list[i]['component'], comp_list[j]['component']]))
                    if conn_key not in processed:
                        processed.add(conn_key)
                        connections.append({
                            'id': f'conn_{node_ref}',
                            'source': comp_list[i]['component'],
                            'source_pin': comp_list[i]['pin'],
                            'target': comp_list[j]['component'],
                            'target_pin': comp_list[j]['pin'],
                            'node_ref': node_ref
                        })

    return components, connections


def _classify_topology_component(comp: Dict) -> str:
    """分类组件类型"""
    definition = (comp.get('definition', '') or '').lower()
    label = (comp.get('label', '') or '').lower()

    if 'bus' in definition or 'bus' in label or '母线' in comp.get('label', ''):
        return 'bus'
    if 'line' in definition or 'line' in label or '线路' in comp.get('label', ''):
        return 'line'
    if 'transformer' in definition or 'transformer' in label or '变压器' in comp.get('label', ''):
        return 'transformer'
    if 'generator' in definition or 'generator' in label or '发电机' in comp.get('label', ''):
        return 'generator'
    if 'load' in definition or 'load' in label or '负荷' in comp.get('label', ''):
        return 'load'

    return 'other'


def _generate_connection_matrix(components: List[Dict], connections: List[Dict]) -> Dict[str, Any]:
    """生成连接矩阵（邻接矩阵）"""
    n = len(components)
    node_index = {comp['id']: idx for idx, comp in enumerate(components)}

    # 创建邻接矩阵
    matrix = [[0] * n for _ in range(n)]

    for conn in connections:
        src_idx = node_index.get(conn['source'])
        tgt_idx = node_index.get(conn['target'])
        if src_idx is not None and tgt_idx is not None:
            matrix[src_idx][tgt_idx] = 1
            matrix[tgt_idx][src_idx] = 1

    # 转换为稀疏表示
    sparse = []
    for i in range(n):
        for j in range(n):
            if matrix[i][j] != 0:
                sparse.append({'row': i, 'col': j, 'value': matrix[i][j]})

    return {
        'type': 'adjacency',
        'size': n,
        'nodes': [{'id': c['id'], 'label': c['label'], 'type': c['type']} for c in components],
        'matrix': matrix,
        'sparse': sparse
    }


def _analyze_connectivity(components: List[Dict], connections: List[Dict]) -> Dict[str, Any]:
    """连通性分析 - 检测电气岛"""
    # 构建邻接表
    adj_list = {comp['id']: [] for comp in components}

    for conn in connections:
        adj_list[conn['source']].append(conn['target'])
        adj_list[conn['target']].append(conn['source'])

    # DFS 查找连通分量
    visited = set()
    islands = []

    def dfs(node_id):
        component = []
        stack = [node_id]
        while stack:
            current = stack.pop()
            if current not in visited:
                visited.add(current)
                comp = next((c for c in components if c['id'] == current), None)
                if comp:
                    component.append({
                        'id': comp['id'],
                        'label': comp['label'],
                        'type': comp['type']
                    })
                for neighbor in adj_list.get(current, []):
                    if neighbor not in visited:
                        stack.append(neighbor)
        return component

    for comp in components:
        if comp['id'] not in visited:
            island = dfs(comp['id'])
            islands.append({
                'id': f'island_{len(islands)}',
                'nodes': island,
                'size': len(island)
            })

    # 计算密度
    n = len(components)
    max_edges = n * (n - 1) / 2 if n > 1 else 1
    density = len(connections) / max_edges if max_edges > 0 else 0

    return {
        'island_count': len(islands),
        'islands': islands,
        'is_fully_connected': len(islands) == 1,
        'largest_island_size': max((i['size'] for i in islands), default=0),
        'density': round(density, 4)
    }


def _calculate_degree_stats(components: List[Dict], connections: List[Dict]) -> Dict[str, Any]:
    """计算度数统计"""
    degree_map = {comp['id']: 0 for comp in components}

    for conn in connections:
        degree_map[conn['source']] = degree_map.get(conn['source'], 0) + 1
        degree_map[conn['target']] = degree_map.get(conn['target'], 0) + 1

    degrees = list(degree_map.values())
    max_degree = max(degrees) if degrees else 0
    min_degree = min(degrees) if degrees else 0
    avg_degree = sum(degrees) / len(degrees) if degrees else 0

    # 找出关键节点
    critical_nodes = []
    threshold = max_degree * 0.8 if max_degree > 0 else 0
    for node_id, degree in degree_map.items():
        if degree >= threshold and degree > 2:
            comp = next((c for c in components if c['id'] == node_id), None)
            if comp:
                critical_nodes.append({
                    'id': comp['id'],
                    'label': comp['label'],
                    'type': comp['type'],
                    'degree': degree
                })

    critical_nodes.sort(key=lambda x: x['degree'], reverse=True)

    return {
        'max_degree': max_degree,
        'min_degree': min_degree,
        'avg_degree': round(avg_degree, 2),
        'total_degree': sum(degrees),
        'critical_nodes': critical_nodes[:5]
    }


def _generate_topology_visualization(components: List[Dict], connections: List[Dict]) -> Dict[str, Any]:
    """生成可视化数据（用于 D3.js 等）"""
    # 节点类型到颜色的映射
    type_colors = {
        'bus': '#3b82f6',
        'line': '#10b981',
        'transformer': '#f59e0b',
        'generator': '#ef4444',
        'load': '#8b5cf6',
        'other': '#6b7280'
    }

    # 计算节点度数
    degree_map = {}
    for conn in connections:
        degree_map[conn['source']] = degree_map.get(conn['source'], 0) + 1
        degree_map[conn['target']] = degree_map.get(conn['target'], 0) + 1

    nodes = [
        {
            'id': comp['id'],
            'label': comp['label'],
            'type': comp['type'],
            'value': degree_map.get(comp['id'], 0),
            'color': type_colors.get(comp['type'], type_colors['other'])
        }
        for comp in components
    ]

    links = [
        {
            'source': conn['source'],
            'target': conn['target'],
            'value': 1
        }
        for conn in connections
    ]

    return {
        'nodes': nodes,
        'links': links,
        'node_types': list(type_colors.keys()),
        'metadata': {
            'node_count': len(nodes),
            'link_count': len(links)
        }
    }


def find_topology_path(components: List[Dict], connections: List[Dict],
                       source_id: str, target_id: str) -> Dict[str, Any]:
    """
    查找两点之间的电气路径（BFS 最短路径）
    """
    # 构建邻接表
    adj_list = {comp['id']: [] for comp in components}
    for conn in connections:
        adj_list[conn['source']].append(conn['target'])
        adj_list[conn['target']].append(conn['source'])

    # BFS 查找最短路径
    queue = [[source_id]]
    visited = {source_id}

    while queue:
        path = queue.pop(0)
        current = path[-1]

        if current == target_id:
            path_components = []
            for node_id in path:
                comp = next((c for c in components if c['id'] == node_id), None)
                if comp:
                    path_components.append({
                        'id': comp['id'],
                        'label': comp['label'],
                        'type': comp['type']
                    })
            return {
                'found': True,
                'source': source_id,
                'target': target_id,
                'path': path_components,
                'length': len(path) - 1
            }

        for neighbor in adj_list.get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(path + [neighbor])

    return {
        'found': False,
        'source': source_id,
        'target': target_id,
        'message': '无电气路径连接'
    }

def main():
    """命令行接口，通过 JSON-RPC 与 Node.js 层通信"""

    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No command specified'}))
        sys.exit(1)

    command = sys.argv[1]
    args = sys.argv[2:]

    try:
        # 初始化配置
        token = os.environ.get('CLOUDPSS_TOKEN')
        api_url = os.environ.get('CLOUDPSS_API_URL', 'https://cloudpss.net/')

        if token:
            set_token(token)
        set_api_url(api_url)

        result = None

        if command == 'fetch_model':
            result = fetch_model(args[0])

        elif command == 'dump_model':
            # dump_model(rid, file_path, format, compress)
            rid = args[0]
            file_path = args[1]
            format = args[2] if len(args) > 2 else 'yaml'
            compress = args[3] if len(args) > 3 else 'gzip'
            result = dump_model(rid, file_path, format, compress)

        elif command == 'load_model':
            # load_model(file_path, format, compress)
            file_path = args[0]
            format = args[1] if len(args) > 1 else 'yaml'
            compress = args[2] if len(args) > 2 else 'gzip'
            result = load_model(file_path, format, compress)

        elif command == 'list_projects':
            # 支持可选参数: name, page_size, owner
            name = args[0] if len(args) > 0 else None
            page_size = int(args[1]) if len(args) > 1 else 100
            owner = args[2] if len(args) > 2 else None
            result = list_user_projects(name, page_size, owner)

        elif command == 'run_simulation':
            result = run_simulation(args[0], int(args[1]) if len(args) > 1 else 0,
                                    int(args[2]) if len(args) > 2 else 0)

        elif command == 'wait_completion':
            result = wait_for_completion(args[0], int(args[1]) if len(args) > 1 else 300)

        elif command == 'get_power_flow_results':
            result = get_power_flow_results(args[0])

        elif command == 'get_emt_results':
            result = get_emt_results(args[0], int(args[1]) if len(args) > 1 else 0)

        elif command == 'get_logs':
            result = get_simulation_logs(args[0])

        elif command == 'abort':
            result = abort_simulation(args[0])

        elif command == 'update_component':
            rid = args[0]
            component_key = args[1]
            label = args[2] if len(args) > 2 else None
            result = update_component(rid, component_key, label=label)

        elif command == 'add_component':
            # 复杂参数通过 JSON 传递
            if len(args) >= 5:
                rid = args[0]
                definition = args[1]
                label = args[2]
                args_dict = json.loads(args[3])
                pins_dict = json.loads(args[4])
                result = add_component(rid, definition, label, args_dict, pins_dict)

        elif command == 'get_components':
            result = get_all_components(args[0])

        elif command == 'get_topology':
            implement_type = args[1] if len(args) > 1 else 'emtp'
            result = get_topology(args[0], implement_type)

        elif command == 'save_model':
            result = save_model(args[0], args[1] if len(args) > 1 else None)

        elif command == 'create_config':
            result = create_config(args[0], args[1])

        elif command == 'create_job':
            result = create_job(args[0], args[1], args[2])

        elif command == 'run_contingency_scan':
            rid = args[0]
            job_type = args[1] if len(args) > 1 else 'powerFlow'
            elements = json.loads(args[2]) if len(args) > 2 else None
            result = run_contingency_scan(rid, job_type, elements)

        elif command == 'check_voltage_violations':
            buses = json.loads(args[0])
            limits = json.loads(args[1]) if len(args) > 1 else None
            result = check_voltage_violations(buses, limits)

        elif command == 'check_line_overloads':
            branches = json.loads(args[0])
            limits = json.loads(args[1]) if len(args) > 1 else None
            result = check_line_overloads(branches, limits)

        # Harmonic Analysis commands
        elif command == 'analyze_harmonic':
            job_id = args[0]
            channel = args[1]
            fundamental_freq = float(args[2]) if len(args) > 2 else 50.0
            plot_index = int(args[3]) if len(args) > 3 else 0
            result = analyze_harmonic(job_id, channel, fundamental_freq, plot_index)

        elif command == 'calculate_thd':
            signal_data = json.loads(args[0])
            fundamental_freq = float(args[1]) if len(args) > 1 else 50.0
            result = calculate_thd(signal_data, fundamental_freq)

        elif command == 'check_harmonic_compliance':
            thd_result = json.loads(args[0])
            standard = args[1] if len(args) > 1 else "GB/T 14549"
            voltage_level = float(args[2]) if len(args) > 2 else 10.0
            result = check_harmonic_compliance(thd_result, standard, voltage_level)

        elif command == 'impedance_scan':
            job_id = args[0]
            freq_min = float(args[1]) if len(args) > 1 else 10
            freq_max = float(args[2]) if len(args) > 2 else 5000
            num_points = int(args[3]) if len(args) > 3 else 500
            result = impedance_scan(job_id, (freq_min, freq_max), num_points)

        # Batch Simulation commands
        elif command == 'run_batch_simulations':
            scenarios = json.loads(args[0])
            rid = args[1]
            max_parallel = int(args[2]) if len(args) > 2 else 5
            job_type = args[3] if len(args) > 3 else 'powerFlow'
            result = run_batch_simulations(scenarios, rid, max_parallel, job_type)

        elif command == 'parameter_sweep':
            rid = args[0]
            param_name = args[1]
            values = json.loads(args[2])
            component_id = args[3] if len(args) > 3 else None
            max_parallel = int(args[4]) if len(args) > 4 else 5
            job_type = args[5] if len(args) > 5 else 'powerFlow'
            result = parameter_sweep(rid, param_name, values, component_id, max_parallel, job_type)

        elif command == 'aggregate_results':
            results = json.loads(args[0])
            result = aggregate_results(results)

        # Component Analysis commands
        elif command == 'analyze_components':
            rid = args[0]
            detailed = args[1] == 'true' if len(args) > 1 else False
            result = analyze_components(rid, detailed)

        elif command == 'classify_component':
            definition = args[0] if len(args) > 0 else None
            args_json = json.loads(args[1]) if len(args) > 1 else None
            result = classify_component(definition, args_json)

        elif command == 'get_component_by_id':
            rid = args[0]
            component_id = args[1]
            result = get_component_by_id(rid, component_id)

        elif command == 'get_component_parameters':
            rid = args[0]
            component_id = args[1]
            result = get_component_parameters(rid, component_id)

        elif command == 'get_components_by_type':
            rid = args[0]
            component_type = args[1]
            result = get_components_by_type(rid, component_type)

        # Topology Analysis commands
        elif command == 'analyze_topology_from_file':
            file_path = args[0]
            options = json.loads(args[1]) if len(args) > 1 else None
            result = analyze_topology_from_file(file_path, options)

        elif command == 'find_topology_path':
            file_path = args[0]
            source_id = args[1]
            target_id = args[2]
            topology_data = json.loads(args[3]) if len(args) > 3 else None
            components, connections = _extract_topology_components(topology_data)
            result = find_topology_path(components, connections, source_id, target_id)

        else:
            print(json.dumps({'error': f'Unknown command: {command}'}))
            sys.exit(1)

        print(json.dumps({'success': True, 'data': result}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'command': command
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
