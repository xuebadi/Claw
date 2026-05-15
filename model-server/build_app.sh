#!/bin/bash
# ============================================================
# 学霸帝Claw 模型服务器 - macOS 应用打包脚本
# ============================================================
# 使用 PyInstaller 将 Python 服务器打包为 macOS .app
#
# 用法:
#   chmod +x build_app.sh
#   ./build_app.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_NAME="学霸帝Claw模型服务器"
APP_BUNDLE="${PROJECT_ROOT}/dist/${APP_NAME}.app"
DIST_DIR="${PROJECT_ROOT}/dist"

echo "============================================"
echo "  ${APP_NAME} 打包工具"
echo "============================================"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 python3"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "📌 Python 版本: ${PYTHON_VERSION}"

# 安装依赖
echo ""
echo "📦 安装 Python 依赖..."
pip3 install -r "${PROJECT_ROOT}/requirements.txt" --quiet 2>/dev/null || {
    echo "⚠️  部分依赖安装失败，继续尝试打包..."
}

# 安装 PyInstaller
echo ""
echo "📦 安装 PyInstaller..."
pip3 install pyinstaller --quiet 2>/dev/null

# 清理旧的构建
rm -rf "${DIST_DIR}" "${PROJECT_ROOT}/build" "${PROJECT_ROOT}/spec"

# 创建图标（如果存在）
ICON_PATH=""
if [ -f "${PROJECT_ROOT}/../xueba-tars-desktop/build/icon.icns" ]; then
    ICON_PATH="${PROJECT_ROOT}/../xueba-tars-desktop/build/icon.icns"
    echo "🎨 使用自定义图标"
fi

# PyInstaller 参数
PYINSTALLER_ARGS=(
    --name="${APP_NAME}"
    --windowed
    --onedir
    --clean
    --noconfirm
)

if [ -n "$ICON_PATH" ]; then
    PYINSTALLER_ARGS+=(--icon="$ICON_PATH")
fi

# 添加数据文件
PYINSTALLER_ARGS+=(
    --add-data="${PROJECT_ROOT}/templates:templates"
    --add-data="${PROJECT_ROOT}/static:static"
)

# 主入口
PYINSTALLER_ARGS+=("${PROJECT_ROOT}/src/server.py")

echo ""
echo "🔨 开始打包应用..."
echo ""

# 执行打包
pyinstaller "${PYINSTALLER_ARGS[@]}"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 打包成功！"
    echo ""
    echo "📦 应用位置: ${APP_BUNDLE}"
    
    # 显示大小
    if [ -d "${APP_BUNDLE}" ]; then
        APP_SIZE=$(du -sh "${APP_BUNDLE}" | cut -f1)
        echo "📏 应用大小: ${APP_SIZE}"
    fi
    
    # 复制到桌面
    echo ""
    read -p "是否复制到桌面？(y/n): " COPY_TO_DESKTOP
    if [ "$COPY_TO_DESKTOP" = "y" ] || [ "$COPY_TO_DESKTOP" = "Y" ]; then
        cp -r "${APP_BUNDLE}" ~/Desktop/
        echo "✅ 已复制到桌面: ~/Desktop/${APP_NAME}.app"
    fi
    
else
    echo ""
    echo "❌ 打包失败！"
    exit 1
fi
