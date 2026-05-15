#!/bin/bash
# 学霸帝Claw 模型服务器启动脚本
# 用法: start-server.sh [start|stop|restart|status]

LLAMA_BIN="/usr/local/bin/llama-server"
MODEL_PATH="$HOME/.xuebadi/models/gguf/UI-TARS-1.5-7B-q4_k_m.gguf"
MPROJ_PATH="$HOME/.xuebadi/models/gguf/UI-TARS-1.5-7B-q8_0.mmproj"
LLAMA_PORT=8765
FASTAPI_PORT=8000
SERVER_DIR="$HOME/.qclaw/workspace-ua58rsb93veqtxl7/xueba-tars-server"
LOG_DIR="/tmp/xueba-tars-logs"

mkdir -p "$LOG_DIR"

start_llama() {
    if curl -s -m 2 "http://127.0.0.1:$LLAMA_PORT/health" | grep -q "ok" 2>/dev/null; then
        echo "llama-server 已在运行 (端口 $LLAMA_PORT)"
        return 0
    fi
    echo "启动 llama-server..."
    nohup "$LLAMA_BIN" \
        -m "$MODEL_PATH" \
        --mmproj "$MPROJ_PATH" \
        --host 127.0.0.1 --port $LLAMA_PORT \
        -ngl 0 -c 2048 -t 4 \
        > "$LOG_DIR/llama-server.log" 2>&1 &
    echo "PID: $!"
    # 等待就绪
    for i in $(seq 1 15); do
        sleep 2
        if curl -s -m 3 "http://127.0.0.1:$LLAMA_PORT/health" 2>/dev/null | grep -q "ok"; then
            echo "✅ llama-server 就绪"
            return 0
        fi
        echo "  加载中... ($((i*2))s)"
    done
    echo "❌ llama-server 启动超时，查看日志: $LOG_DIR/llama-server.log"
    return 1
}

start_fastapi() {
    if curl -s -m 2 "http://localhost:$FASTAPI_PORT/health" | grep -q "ok" 2>/dev/null; then
        echo "FastAPI 已在运行 (端口 $FASTAPI_PORT)"
        return 0
    fi
    echo "启动 FastAPI..."
    cd "$SERVER_DIR"
    nohup bash -c "PYTHONPATH=\"$PWD/src\" python3 -m uvicorn src.server:app --host 0.0.0.0 --port $FASTAPI_PORT" \
        > "$LOG_DIR/fastapi.log" 2>&1 &
    echo "PID: $!"
    sleep 3
    if curl -s -m 3 "http://localhost:$FASTAPI_PORT/health" 2>/dev/null | grep -q "ok"; then
        echo "✅ FastAPI 就绪 → http://localhost:$FASTAPI_PORT"
        return 0
    fi
    echo "❌ FastAPI 启动失败，查看日志: $LOG_DIR/fastapi.log"
    return 1
}

stop_all() {
    echo "停止服务..."
    pkill -f "uvicorn src.server" 2>/dev/null && echo "  FastAPI 已停止"
    pkill -f "llama-server.*UI-TARS" 2>/dev/null && echo "  llama-server 已停止"
}

status() {
    echo "=== 服务状态 ==="
    LLAMA_PID=$(pgrep -f "llama-server.*UI-TARS" 2>/dev/null)
    FASTAPI_PID=$(pgrep -f "uvicorn src.server" 2>/dev/null)
    
    if [ -n "$LLAMA_PID" ]; then
        LLAMA_MEM=$(ps -o rss= -p "$LLAMA_PID" 2>/dev/null | awk '{printf "%.0f MB", $1/1024}')
        echo "llama-server : ✅ PID=$LLAMA_PID (${LLAMA_MEM})"
    else
        echo "llama-server : ❌ 未运行"
    fi
    
    if [ -n "$FASTAPI_PID" ]; then
        echo "FastAPI      : ✅ PID=$FASTAPI_PID"
    else
        echo "FastAPI      : ❌ 未运行"
    fi
    
    echo "---"
    curl -s -m 3 "http://localhost:$FASTAPI_PORT/health" 2>/dev/null && echo "" || echo "/health 不可达"
}

case "${1:-start}" in
    start)
        start_llama && start_fastapi
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        start_llama && start_fastapi
        ;;
    status)
        status
        ;;
    *)
        echo "用法: $0 [start|stop|restart|status]"
        ;;
esac
