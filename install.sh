#!/bin/bash

# CloudPSS Skills 自动安装脚本
# 用法：curl -sSL https://raw.githubusercontent.com/chenyingthu/cloudpss-skills/master/install.sh | bash

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║        CloudPSS 电力系统仿真技能包 - 安装程序            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# 配置变量
INSTALL_DIR="${CLOUDPSS_INSTALL_DIR:-$HOME/cloudpss-skills}"
REPO_URL="${CLOUDPSS_REPO_URL:-https://github.com/chenyingthu/cloudpss-skills.git}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查系统依赖..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装，请先安装 Node.js >= 18"
        exit 1
    fi

    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 未安装，请先安装 Python >= 3.8"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f1 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js 版本过低 ($NODE_VERSION)，需要 >= 18"
        exit 1
    fi

    log_info "依赖检查通过"
}

# 克隆或更新仓库
clone_repo() {
    if [ -d "$INSTALL_DIR" ]; then
        log_warn "目录 $INSTALL_DIR 已存在"
        read -p "是否删除并重新安装？[y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            log_info "跳过安装，使用现有版本"
            return 0
        fi
    fi

    log_info "克隆仓库到 $INSTALL_DIR ..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    log_info "仓库克隆完成"
}

# 安装 Python 依赖
install_python_deps() {
    log_info "安装 Python 依赖..."
    cd "$INSTALL_DIR"

    if [ -f "requirements.txt" ]; then
        pip3 install -r requirements.txt
    else
        pip3 install cloudpss
    fi

    log_info "Python 依赖安装完成"
}

# 配置环境变量
setup_env() {
    log_info "配置环境变量..."

    ENV_FILE="$HOME/.cloudpss_env"

    if [ ! -f "$ENV_FILE" ]; then
        cat > "$ENV_FILE" << 'EOF'
# CloudPSS 环境变量
# 请替换为您的实际 token
export CLOUDPSS_TOKEN="your-token-here"
export CLOUDPSS_API_URL="https://cloudpss.net/"
EOF
        log_warn "请编辑 $ENV_FILE 设置您的 CLOUDPSS_TOKEN"
    fi

    # 添加到 bashrc/zshrc
    if ! grep -q "cloudpss_env" ~/.bashrc 2>/dev/null; then
        echo "" >> ~/.bashrc
        echo "# CloudPSS 环境变量" >> ~/.bashrc
        echo "[ -f \"$ENV_FILE\" ] && source \"$ENV_FILE\"" >> ~/.bashrc
        log_info "已添加到 ~/.bashrc"
    fi

    if [ -n "$ZSH_VERSION" ] || [ -f ~/.zshrc ]; then
        if ! grep -q "cloudpss_env" ~/.zshrc 2>/dev/null; then
            echo "" >> ~/.zshrc
            echo "# CloudPSS 环境变量" >> ~/.zshrc
            echo "[ -f \"$ENV_FILE\" ] && source \"$ENV_FILE\"" >> ~/.zshrc
            log_info "已添加到 ~/.zshrc"
        fi
    fi
}

# 验证安装
verify_install() {
    log_info "验证安装..."
    cd "$INSTALL_DIR"

    # 加载环境变量
    if [ -f "$ENV_FILE" ]; then
        source "$ENV_FILE"
    fi

    # 运行简单测试
    if node -e "const { CloudPSSSkills } = require('./src/index'); console.log('CloudPSS Skills 加载成功')" 2>/dev/null; then
        log_info "Node.js 模块加载成功"
    else
        log_warn "Node.js 模块加载失败，请检查依赖"
    fi

    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║                    安装完成！                            ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo "下一步:"
    echo "1. 编辑配置文件：nano ~/.cloudpss_env"
    echo "2. 设置您的 CLOUDPSS_TOKEN"
    echo "3. 重新加载环境：source ~/.cloudpss_env"
    echo "4. 运行测试：cd $INSTALL_DIR && node tests/fusion/fusion-test-n1-loss-optimization.js"
    echo ""
    echo "使用方法:"
    echo "  在 Claude Code 中，只需说：'帮我分析 IEEE39 系统的 N-1 安全情况'"
    echo ""
}

# 主流程
main() {
    check_dependencies
    clone_repo
    install_python_deps
    setup_env
    verify_install
}

main "$@"
