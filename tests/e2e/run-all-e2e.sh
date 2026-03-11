#!/bin/bash
#
# 运行所有E2E测试
#

set -e

echo "═══════════════════════════════════════════════════════════════════"
echo "         CloudPSS Skills E2E 测试套件                              "
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# 检查Token - 先检查当前目录，再检查父目录
TOKEN_FILE=""
if [ -f ".cloudpss_token" ]; then
    TOKEN_FILE=".cloudpss_token"
elif [ -f "../.cloudpss_token" ]; then
    TOKEN_FILE="../.cloudpss_token"
else
    echo "❌ 错误: 未找到 .cloudpss_token 文件"
    echo "   请在项目根目录或父目录创建 .cloudpss_token 文件并写入您的 CloudPSS Token"
    exit 1
fi

# 加载Token
export CLOUDPSS_TOKEN=$(cat "$TOKEN_FILE" | tr -d '\n')
echo "✅ Token 已加载 (from $TOKEN_FILE)"
echo ""

# 测试文件列表
TEST_DIR="tests/e2e"
TEST_FILES=(
    "e2e-model-management.test.js"
    "e2e-power-flow.test.js"
    "e2e-n1-scanning.test.js"
    "e2e-reporting-export.test.js"
    "e2e-equipment-operation.test.js"
    "e2e-batch-computation.test.js"
)

# 结果统计
TOTAL_PASSED=0
TOTAL_FAILED=0
FAILED_TESTS=()

echo "📋 测试计划:"
echo "   共 ${#TEST_FILES[@]} 个测试文件"
echo ""

for test_file in "${TEST_FILES[@]}"; do
    test_path="$TEST_DIR/$test_file"

    if [ ! -f "$test_path" ]; then
        echo "⚠️  跳过: $test_file (文件不存在)"
        continue
    fi

    echo ""
    echo "───────────────────────────────────────────────────────────────────"
    echo "▶ 运行: $test_file"
    echo "───────────────────────────────────────────────────────────────────"

    if node "$test_path"; then
        echo "✅ $test_file 完成"
    else
        echo "❌ $test_file 失败"
        FAILED_TESTS+=("$test_file")
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "                     E2E 测试汇总                                   "
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo "🎉 所有测试通过!"
    exit 0
else
    echo "❌ 以下测试失败:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "   - $test"
    done
    exit 1
fi