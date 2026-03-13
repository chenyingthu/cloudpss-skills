#!/usr/bin/env python3
"""
验证 Python 代码版本 - 检查调试日志是否存在
"""
import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, '../python')

# 读取源代码检查调试日志
with open('../python/cloudpss_wrapper.py', 'r', encoding='utf-8') as f:
    content = f.read()

print("=" * 60)
print("Python 代码验证")
print("=" * 60)

# 检查调试日志是否存在
has_stderr_debug = 'file=sys.stderr' in content
has_pf_log = '[PF]' in content

print(f"\n调试日志检查:")
print(f"  - stderr 输出：{'✓ 存在' if has_stderr_debug else '✗ 不存在'}")
print(f"  - [PF] 标记：{'✓ 存在' if has_pf_log else '✗ 不存在'}")

if has_stderr_debug and has_pf_log:
    print("\n✓ 代码已更新，包含调试日志")
    print("\n如果测试仍显示空数据，请执行：")
    print("  rm -rf python/__pycache__")
    print("  rm -f python/*.pyc")
else:
    print("\n✗ 代码未更新，请拉取最新代码")

print("=" * 60)
