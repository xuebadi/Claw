"""
学霸帝Claw 模型服务器
====================
基于 UI-TARS-1.5-7B 的本地模型推理服务器
提供 OpenAI 兼容 API，支持视觉理解

启动方式:
    python src/server.py
    或: uvicorn src.server:app --host 0.0.0.0 --port 8000
"""

import os
import sys
import time
import json
import base64
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any, AsyncGenerator, Union

# 添加项目根目录到路径
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# 导入 GGUF 管理器（llama-server 后端，Intel Mac 兼容）
from gguf_manager import GGUFModelManager, LLAMA_SERVER_PATH

# PyTorch 端已禁用（Intel Mac Metal 问题）
try:
    from model_manager import ModelManager
except ImportError:
    ModelManager = None

# ============================================================
# 应用配置
# ============================================================

app = FastAPI(
    title="学霸帝Claw 模型服务器",
    description="UI-TARS-1.5-7B 本地推理服务 | OpenAI 兼容 API",
    version="1.0.0"
)

# CORS 中间件（允许桌面应用跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局模型管理器实例
model_manager: Optional[ModelManager] = None
gguf_manager: Optional[GGUFModelManager] = None

# 服务器状态
server_status = {
    "started_at": None,
    "model_loaded": False,
    "model_name": None,
    "device": None,
    "total_requests": 0,
    "request_history": []
}


# ============================================================
# 数据模型
# ============================================================

class ChatMessage(BaseModel):
    role: str  # "system", "user", "assistant"
    content: Union[str, List[Dict[str, Any]]]  # 文本或多模态内容


class ChatCompletionRequest(BaseModel):
    model: str = "ui-tars-1.5-7b"
    messages: List[ChatMessage]
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    stream: bool = False


class ModelConfigRequest(BaseModel):
    model_config = {'protected_namespaces': ()}
    model_path: Optional[str] = None
    model_name: str = "ByteDance-Seed/UI-TARS-1.5-7B"
    device: Optional[str] = None  # "auto", "cpu", "mps", "cuda"
    load_in_8bit: bool = False
    load_in_4bit: bool = False


class TextGenerationRequest(BaseModel):
    prompt: str
    image: Optional[str] = None  # base64 编码的图片
    max_new_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9


# ============================================================
# 启动事件
# ============================================================

@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    global server_status, model_manager
    
    server_status["started_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    
    # 模型管理器已禁用（Intel Mac Metal 问题）
    # 使用 llama-server 作为推理后端（见 init_gguf_manager）
    
    print("=" * 50)
    print("  学霸帝Claw 模型服务器 v1.1 (Intel Mac 修复版)")
    print("  推理后端: llama-server (brew CPU-only 版本)")
    print("  llama-server: http://127.0.0.1:8765")
    print("  API 代理:   http://localhost:8000")
    print("  控制面板:   http://localhost:8000/")
    print("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭时释放资源"""
    global gguf_manager
    if gguf_manager:
        gguf_manager.unload()
        print("llama-server 已停止，服务器关闭")


# ============================================================
# Web 控制面板
# ============================================================

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """返回 Web 控制面板"""
    html_path = PROJECT_ROOT / "templates" / "index.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


@app.get("/api/status")
async def get_status():
    """获取服务器和模型状态"""
    global model_manager, server_status
    
    if gguf_manager and gguf_manager.is_loaded:
        model_info = {
            "loaded": True,
            "model_name": gguf_manager.model_name,
            "backend": "llama-server",
            "base_url": gguf_manager.base_url,
        }
    elif model_manager:
        model_info = model_manager.get_status()
    else:
        model_info = {"loaded": False, "backend": "llama-server (未运行)"}
    
    return {
        "server": {
            "version": "1.0.0",
            "name": "学霸帝Claw 模型服务器",
            "started_at": server_status["started_at"],
            "uptime": _get_uptime(),
        },
        "model": model_info,
        "requests": {
            "total": server_status["total_requests"],
        }
    }


def _get_uptime() -> str:
    """计算运行时间"""
    if not server_status["started_at"]:
        return "00:00:00"
    
    start_time = time.mktime(time.strptime(server_status["started_at"], "%Y-%m-%d %H:%M:%S"))
    uptime_sec = int(time.time() - start_time)
    
    hours, remainder = divmod(uptime_sec, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


# ============================================================
# OpenAI 兼容 API
# ============================================================

@app.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    """
    OpenAI 兼容的聊天补全接口
    支持多模态输入（文本 + 图片）
    """
    global model_manager, server_status
    
    
    server_status["total_requests"] += 1
    
    # 检查 llama-server 是否运行
    if not gguf_manager or not gguf_manager.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="llama-server 未运行。请先启动 llama-server：\n"
                   "llama-server -m ~/.xuebadi/models/gguf/UI-TARS-1.5-7B-q4_k_m.gguf \\"
                   " --mmproj ~/.xuebadi/models/gguf/UI-TARS-1.5-7B-q8_0.mmproj \\"
                   " --host 127.0.0.1 --port 8765 -ngl 0"
        )
    
    try:
        # 转换消息格式为 gguf_manager.chat() 需要的格式
        messages_for_llama = []
        for msg in req.messages:
            if isinstance(msg.content, list):
                # 多模态内容：直接传递（gguf_manager 处理 base64）
                messages_for_llama.append({"role": msg.role, "content": msg.content})
            else:
                messages_for_llama.append({"role": msg.role, "content": msg.content})
        
        if req.stream:
            # 流式：直接代理到 llama-server
            return StreamingResponse(
                _stream_to_llama(messages_for_llama, req),
                media_type="text/event-stream"
            )
        else:
            # 非流式：调用 gguf_manager.chat()
            result = gguf_manager.chat(
                messages=messages_for_llama,
                max_tokens=req.max_tokens,
                temperature=req.temperature,
            )
            
            return {
                "id": f"chatcmpl-{int(time.time())}",
                "object": "chat.completion",
                "model": req.model,
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": result["choices"][0]["message"]["content"]
                    },
                    "finish_reason": "stop"
                }],
                "usage": result.get("usage", {})
            }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _stream_to_llama(
    messages: List[Dict],
    req: ChatCompletionRequest
) -> AsyncGenerator[str, None]:
    """流式代理到 llama-server"""
    global gguf_manager
    
    import urllib.request
    
    payload = {
        "model": gguf_manager.model_name or "UI-TARS-1.5-7B",
        "messages": messages,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
        "top_p": req.top_p,
        "stream": True,
    }
    
    req_obj = urllib.request.Request(
        f"{gguf_manager.base_url}/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    
    try:
        with urllib.request.urlopen(req_obj, timeout=600) as resp:
            chunk_id = f"chatcmpl-{int(time.time())}"
            full_content = ""
            
            for line in resp:
                line = line.decode("utf-8").strip()
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        if "content" in delta and delta["content"]:
                            content_piece = delta["content"]
                            full_content += content_piece
                            
                            chunk_data = {
                                "id": chunk_id,
                                "object": "chat.completion.chunk",
                                "model": req.model,
                                "choices": [{
                                    "index": 0,
                                    "delta": {"content": content_piece},
                                    "finish_reason": None
                                }]
                            }
                            yield f"data: {json.dumps(chunk_data)}\n\n"
                    except json.JSONDecodeError:
                        continue
            
            # 发送结束标记
            end_data = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "model": req.model,
                "choices": [{
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }]
            }
            yield f"data: {json.dumps(end_data)}\n\n"
            yield "data: [DONE]\n\n"
    except Exception as e:
        error_data = {"error": {"message": str(e), "type": "internal_error"}}
        yield f"data: {json.dumps(error_data)}\n\n"
        yield "data: [DONE]\n\n"


def _build_prompt(messages: List[Dict]) -> str:
    """从消息列表构建提示词"""
    prompt_parts = []
    
    system_msg = ""
    user_msgs = []
    assistant_msgs = []
    
    for msg in messages:
        if msg["role"] == "system":
            system_msg = msg["content"]
        elif msg["role"] == "user":
            user_msgs.append(msg["content"])
        elif msg["role"] == "assistant":
            assistant_msgs.append(msg["content"])
    
    if system_msg:
        prompt_parts.append(f"<|system|>\n{system_msg}\n<|end|>")
    
    for i in range(len(user_msgs)):
        prompt_parts.append(f"<|user|>\n{user_msgs[i]}\n<|end|>")
        if i < len(assistant_msgs):
            prompt_parts.append(f"<|assistant|)\n{assistant_msgs[i]}\n<|end|>")
    
    prompt_parts.append("<|assistant|)\n")
    
    return "\n".join(prompt_parts)


async def _stream_generate(
    prompt: str, 
    image: Optional[str], 
    req: ChatCompletionRequest
) -> AsyncGenerator[str, None]:
    """[已弃用] 流式生成 - 使用 _stream_to_llama 代替"""
    # 此函数已弃用，保留用于兼容
    global model_manager
    if not model_manager:
        return  # 空生成器
    full_text = ""
    chunk_id = f"chatcmpl-{int(time.time())}"
    
    async for chunk in model_manager.generate_stream(
        prompt=prompt,
        image=image,
        max_new_tokens=req.max_tokens,
        temperature=req.temperature,
        top_p=req.top_p
    ):
        full_text += chunk
        
        data = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "model": req.model,
            "choices": [{
                "index": 0,
                "delta": {"content": chunk},
                "finish_reason": None
            }]
        }
        yield f"data: {json.dumps(data)}\n\n"
    
    # 发送结束标记
    data = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "model": req.model,
        "choices": [{
            "index": 0,
            "delta": {},
            "finish_reason": "stop"
        }]
    }
    yield f"data: {json.dumps(data)}\n\n"
    yield "data: [DONE]\n\n"


async def _fetch_image(url: str) -> Optional[str]:
    """从 URL 获取图片并转为 base64"""
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return base64.b64encode(resp.content).decode()
    except Exception:
        pass
    return None


# ============================================================
# 模型管理 API
# ============================================================

@app.post("/api/model/load")
async def load_model(config: ModelConfigRequest):
    """加载模型（同步接口，兼容旧版）"""
    global model_manager, server_status
    
    try:
        status = await model_manager.load_model(
            model_name=config.model_name,
            model_path=config.model_path,
            device=config.device,
            load_in_8bit=config.load_in_8bit,
            load_in_4bit=config.load_in_4bit
        )
        
        server_status["model_loaded"] = True
        server_status["model_name"] = config.model_name
        
        return {"success": True, "status": status}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"模型加载失败: {str(e)}")


@app.post("/api/model/load/stream")
async def load_model_stream(config: ModelConfigRequest):
    """
    加载模型（SSE 流式接口，实时推送进度）
    首次加载时自动从 ModelScope 下载模型
    
    事件格式:
        event: progress
        data: {"phase": "download", "progress": 50, "message": "下载中..."}
        
        event: done
        data: {"success": true, "message": "加载成功"}
        
        event: error
        data: {"message": "加载失败"}
    """
    global model_manager, server_status
    
    async def event_generator():
        import concurrent.futures
        progress_queue = asyncio.Queue()
        main_loop = asyncio.get_event_loop()

        def progress_cb(phase, progress, message):
            """进度回调（由 _emit_progress 通过 call_soon_threadsafe 调度到此线程）"""
            try:
                progress_queue.put_nowait(
                    {"phase": phase, "progress": progress, "message": message}
                )
            except Exception:
                pass

        # 设置回调到 model_manager
        model_manager._progress_callback = progress_cb
        model_manager._event_loop = main_loop

        def sync_load():
            """在线程中同步加载"""
            try:
                result = model_manager._load_model_sync(
                    model_name=config.model_name,
                    model_path=config.model_path,
                    device=config.device,
                    load_in_8bit=config.load_in_8bit,
                    load_in_4bit=config.load_in_4bit,
                )
                return result
            except Exception as e:
                return None

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(sync_load)

            while not future.done():
                try:
                    data = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield f"event: progress\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    continue

            # 消费队列中剩余的进度事件
            while not progress_queue.empty():
                data = progress_queue.get_nowait()
                yield f"event: progress\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

            result = future.result()

            if result:
                server_status["model_loaded"] = True
                server_status["model_name"] = config.model_name
                yield f"event: done\ndata: {json.dumps(result, ensure_ascii=False)}\n\n"
            else:
                yield f"event: error\ndata: {json.dumps({'message': '模型加载失败'}, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/api/model/check/{model_name:path}")
async def check_model(model_name: str):
    """检查模型是否已在本地存在"""
    global model_manager
    if model_manager:
        return model_manager.check_model_exists(model_name)
    return {"exists": False}


@app.post("/api/model/unload")
async def unload_model():
    """卸载模型"""
    global model_manager, server_status
    
    if model_manager:
        await model_manager.unload()
        server_status["model_loaded"] = False
        server_status["model_name"] = None
    
    return {"success": True, "message": "模型已卸载"}


@app.get("/api/models")
async def list_models():
    """列出可用模型"""
    return {
        "models": [
            {
                "id": "ui-tars-1.5-7b",
                "name": "UI-TARS-1.5-7B",
                "description": "字节跳动 UI-TARS 视觉语言模型，支持屏幕理解和操作规划",
                "size": "~14GB (FP16)",
                "source": "ModelScope / HuggingFace"
            },
            {
                "id": "ui-tars-1.5-2b",
                "name": "UI-TARS-1.5-2B",
                "description": "轻量版 UI-TARS 模型，适合低内存设备",
                "size": "~4GB (FP16)",
                "source": "ModelScope / HuggingFace"
            }
        ]
    }


# ============================================================
# GGUF 模型管理 API
# ============================================================


class GGUFLoadRequest(BaseModel):
    model_config = {'protected_namespaces': ()}
    model_id: str = "UI-TARS-1.5-7B-q5_k_m"
    n_ctx: int = 4096
    n_threads: Optional[int] = None
    n_gpu_layers: int = 0


@app.on_event("startup")
async def init_gguf_manager():
    """初始化 GGUF 管理器（llama-server 后端）
    
    尝试连接到已运行的 llama-server（端口 8765）。
    如果未运行，初始化管理器（可由用户通过 API 启动 llama-server 子进程）。
    """
    global gguf_manager
    try:
        # 检查是否已有 llama-server 在运行
        import urllib.request
        req = urllib.request.Request(
            "http://127.0.0.1:8765/v1/models",
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                gguf_manager = GGUFModelManager(port=8765)
                gguf_manager.is_loaded = True
                gguf_manager.model_name = "UI-TARS-1.5-7B"
                print("[GGUF] ✅ 已连接到运行中的 llama-server (127.0.0.1:8765)")
                return
    except Exception:
        pass
    
    # 没有运行的 llama-server，初始化管理器（用户可手动启动 llama-server）
    gguf_manager = GGUFModelManager(port=8765)
    print("[GGUF] llama-server 未运行。手动启动：")
    print("[GGUF] llama-server -m ~/.xuebadi/models/gguf/UI-TARS-1.5-7B-q4_k_m.gguf \\")
    print("[GGUF]     --mmproj ~/.xuebadi/models/gguf/UI-TARS-1.5-7B-q8_0.mmproj \\")
    print("[GGUF]     --host 127.0.0.1 --port 8765 -ngl 0")


@app.get("/api/gguf/models")
async def list_gguf_models():
    """列出可用的 GGUF 模型"""
    global gguf_manager
    if not gguf_manager:
        return {"available": False, "error": "GGUF 管理器未初始化"}
    models = gguf_manager.get_available_models()
    return {
        "available": True,
        "llama_server_running": gguf_manager.is_loaded,
        "llama_server_url": gguf_manager.base_url,
        "models": models
    }


@app.get("/api/gguf/check/{model_id}")
async def check_gguf_model(model_id: str):
    """检查 GGUF 模型是否已下载"""
    global gguf_manager
    if not gguf_manager:
        return {"available": False, "error": "GGUF 管理器未初始化"}
    result = gguf_manager.check_model_exists(model_id)
    result["llama_server_running"] = gguf_manager.is_loaded
    return result


@app.post("/api/gguf/download")
async def download_gguf_model(model_id: str):
    """下载 GGUF 模型（同步）"""
    global gguf_manager
    if not gguf_manager:
        raise HTTPException(503, "GGUF 管理器未初始化")
    try:
        result = gguf_manager.download_model(model_id)
        return {"success": True, "files": result}
    except Exception as e:
        raise HTTPException(500, f"下载失败: {e}")


@app.post("/api/gguf/load/stream")
async def load_gguf_stream(req: GGUFLoadRequest):
    """
    加载 GGUF 模型（SSE 流式，含下载进度）
    首次使用自动从 ModelScope 下载
    通过 llama-server 子进程运行
    """
    global gguf_manager, server_status

    if not gguf_manager:
        raise HTTPException(503, "GGUF 管理器未初始化")

    import concurrent.futures

    async def event_generator():
        progress_queue = asyncio.Queue()
        main_loop = asyncio.get_event_loop()

        def progress_cb(phase, progress, message):
            try:
                progress_queue.put_nowait(
                    {"phase": phase, "progress": progress, "message": message}
                )
            except Exception:
                pass

        gguf_manager._progress_callback = progress_cb
        gguf_manager._event_loop = main_loop

        def sync_load():
            try:
                result = gguf_manager.load_model_sync(
                    model_id=req.model_id,
                    n_ctx=req.n_ctx,
                    n_threads=req.n_threads,
                    n_gpu_layers=req.n_gpu_layers,
                )
                return result
            except Exception as e:
                return None

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(sync_load)

            while not future.done():
                try:
                    data = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield f"event: progress\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    continue

            while not progress_queue.empty():
                data = progress_queue.get_nowait()
                yield f"event: progress\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

            result = future.result()

            if result:
                server_status["model_loaded"] = True
                server_status["model_name"] = req.model_id
                server_status["model_type"] = "gguf"
                yield f"event: done\ndata: {json.dumps(result, ensure_ascii=False)}\n\n"
            else:
                yield f"event: error\ndata: {json.dumps({'message': 'GGUF 模型加载失败'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/api/gguf/generate")
async def generate_gguf(req: TextGenerationRequest):
    """GGUF 模型文本生成（通过 llama-server）"""
    global gguf_manager
    if not gguf_manager or not gguf_manager.is_loaded:
        raise HTTPException(503, "llama-server 未运行或模型未加载")
    
    try:
        text = gguf_manager.generate(
            prompt=req.prompt,
            max_tokens=req.max_new_tokens,
            temperature=req.temperature,
            top_p=req.top_p,
        )
        return {"generated_text": text}
    except Exception as e:
        raise HTTPException(500, f"生成失败: {e}")


@app.post("/api/gguf/unload")
async def unload_gguf():
    """卸载 GGUF 模型"""
    global gguf_manager, server_status
    if gguf_manager:
        gguf_manager.unload()
        server_status["model_loaded"] = gguf_manager.is_loaded
        server_status["model_name"] = None
    return {"success": True}


# ============================================================
# 文本生成 API（直接接口）
# ============================================================

@app.post("/api/generate")
async def generate_text(req: TextGenerationRequest):
    """直接文本生成接口"""
    global model_manager
    
    
    result = await model_manager.generate(
        prompt=req.prompt,
        image=req.image,
        max_new_tokens=req.max_new_tokens,
        temperature=req.temperature,
        top_p=req.top_p
    )
    
    return result


# ============================================================
# 健康检查
# ============================================================

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "ok",
        "model_loaded": gguf_manager.is_loaded if gguf_manager else False,
        "backend": "llama-server",
        "llama_server_url": gguf_manager.base_url if gguf_manager else "N/A"
    }


# ============================================================
# 主入口
# ============================================================

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
