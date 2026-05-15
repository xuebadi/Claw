"""
学霸帝Claw GGUF 模型加载器
=========================
使用 llama-server（brew 版本）加载 GGUF 格式模型
支持 VLM（视觉语言模型）+ mmproj
CPU 推理优化（无 Metal 依赖，brew 编译版绕过 Intel Mac Metal 问题）
"""

import os
import sys
import json
import time
import signal
import subprocess
import threading
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Dict, Any, Callable
from urllib.request import Request, urlopen

# 默认存储路径
DEFAULT_MODEL_DIR = Path.home() / ".xuebadi" / "models"
GGUF_DIR = DEFAULT_MODEL_DIR / "gguf"

# UI-TARS GGUF 模型注册表
GGUF_REGISTRY = {
    "UI-TARS-1.5-7B-q5_k_m": {
        "modelscope_id": "Mungert/UI-TARS-1.5-7B-GGUF",
        "filename": "UI-TARS-1.5-7B-q5_k_m.gguf",
        "mmproj": "UI-TARS-1.5-7B-q8_0.mmproj",
        "size_gb": 5.53,
        "description": "UI-TARS-1.5-7B Q5_K_M 量化版 (5.5GB, 推荐)",
        "recommended": True,
    },
    "UI-TARS-1.5-7B-q4_k_m": {
        "modelscope_id": "Mungert/UI-TARS-1.5-7B-GGUF",
        "filename": "UI-TARS-1.5-7B-q4_k_m.gguf",
        "mmproj": "UI-TARS-1.5-7B-q8_0.mmproj",
        "size_gb": 4.78,
        "description": "UI-TARS-1.5-7B Q4_K_M 量化版 (4.8GB, 最低内存)",
    },
    "UI-TARS-1.5-7B-q8_0": {
        "modelscope_id": "Mungert/UI-TARS-1.5-7B-GGUF",
        "filename": "UI-TARS-1.5-7B-q8_0.gguf",
        "mmproj": "UI-TARS-1.5-7B-q8_0.mmproj",
        "size_gb": 8.10,
        "description": "UI-TARS-1.5-7B Q8_0 量化版 (8.1GB, 高质量)",
    },
    "UI-TARS-1.5-7B-bf16": {
        "modelscope_id": "Mungert/UI-TARS-1.5-7B-GGUF",
        "filename": "UI-TARS-1.5-7B-bf16.gguf",
        "mmproj": "UI-TARS-1.5-7B-bf16.mmproj",
        "size_gb": 15.24,
        "description": "UI-TARS-1.5-7B BF16 全精度 (15.2GB)",
    },
}

# llama-server 路径（brew 安装版，无 Metal）
LLAMA_SERVER_PATH = "/usr/local/bin/llama-server"


class GGUFModelManager:
    """
    GGUF 模型管理器（基于 llama-server 子进程）
    
    工作方式：
    1. 启动 llama-server 作为子进程（FastAPI server）
    2. 通过 HTTP 调用 OpenAI 兼容 API（v1/chat/completions）
    3. 子进程处理所有模型加载和推理
    
    优点：
    - 绕过 llama-cpp-python Metal 崩溃问题（brew 版无 Metal）
    - 原生支持 VLM + mmproj
    - 稳定可靠
    """

    def __init__(
        self,
        port: int = 8765,
        host: str = "127.0.0.1",
        n_ctx: int = 2048,
        n_threads: int = 4,
    ):
        self.port = port
        self.host = host
        self.n_ctx = n_ctx
        self.n_threads = n_threads

        self._process: Optional[subprocess.Popen] = None
        self._log_thread: Optional[threading.Thread] = None
        self._log_lines: list = []
        self._log_lock = threading.Lock()

        self.model_name: Optional[str] = None
        self.model_path: Optional[str] = None
        self.is_loaded = False

        self._progress_callback: Optional[Callable] = None
        self._event_loop = None

        # 确保目录存在
        GGUF_DIR.mkdir(parents=True, exist_ok=True)

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def _emit_progress(self, phase: str, progress: float, message: str):
        if self._progress_callback:
            try:
                if self._event_loop and self._event_loop.is_running():
                    self._event_loop.call_soon_threadsafe(
                        self._progress_callback, phase, progress, message
                    )
                else:
                    self._progress_callback(phase, progress, message)
            except Exception:
                pass

    def _log_reader(self):
        """后台线程：实时读取 llama-server 日志并提取进度"""
        if not self._process:
            return
        try:
            stream = self._process.stderr if self._process.stderr else None
            if not stream:
                return
            for line in iter(stream.readline, ""):
                if not line:
                    break
                stripped = line.strip()
                with self._log_lock:
                    self._log_lines.append(stripped)
                    # 只保留最近 200 行
                    if len(self._log_lines) > 200:
                        self._log_lines = self._log_lines[-200:]

                # 从日志中提取进度信息
                msg = stripped.lower()
                if "loading model" in msg:
                    self._emit_progress("loading", 10, "正在加载模型...")
                elif "model loaded" in msg:
                    self._emit_progress("done", 100, "模型加载完成！")
                    self.is_loaded = True
                elif "listening on" in msg:
                    self._emit_progress("init", 50, "服务已启动")
        except Exception:
            pass

    def _start_log_thread(self):
        self._log_thread = threading.Thread(target=self._log_reader, daemon=True)
        self._log_thread.start()

    def get_available_models(self) -> list:
        """获取可用的 GGUF 模型列表"""
        result = []
        for key, info in GGUF_REGISTRY.items():
            gguf_path = GGUF_DIR / info["filename"]
            result.append({
                "id": key,
                "description": info["description"],
                "size_gb": info["size_gb"],
                "downloaded": gguf_path.exists(),
                "recommended": info.get("recommended", False),
            })
        return result

    def check_model_exists(self, model_id: str) -> Dict[str, Any]:
        """检查 GGUF 模型是否已下载"""
        info = GGUF_REGISTRY.get(model_id)
        if not info:
            return {"exists": False, "error": f"未知模型: {model_id}"}

        gguf_path = GGUF_DIR / info["filename"]
        mmproj_file = info.get("mmproj")
        mmproj_path = GGUF_DIR / mmproj_file if mmproj_file else None

        if not gguf_path.exists():
            return {"exists": False}

        size = gguf_path.stat().st_size
        return {
            "exists": True,
            "gguf_path": str(gguf_path),
            "gguf_size_gb": round(size / 1e9, 2),
            "mmproj_path": str(mmproj_path) if mmproj_path else None,
            "mmproj_exists": mmproj_path.exists() if mmproj_path else None,
        }

    def _download_file(
        self,
        url: str,
        dest: Path,
        progress_cb: Optional[Callable] = None,
    ):
        """下载文件并显示进度"""
        req = Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")

        with urlopen(req, timeout=300) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 1024 * 1024  # 1MB

            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)

                    if total > 0 and progress_cb:
                        pct = downloaded / total * 100
                        gb_down = downloaded / 1e9
                        gb_total = total / 1e9
                        progress_cb(
                            "download",
                            pct,
                            f"下载中: {gb_down:.1f} / {gb_total:.1f} GB ({pct:.0f}%)"
                        )

    def download_model(self, model_id: str) -> Dict[str, Any]:
        """从 ModelScope 下载 GGUF 模型"""
        info = GGUF_REGISTRY.get(model_id)
        if not info:
            raise ValueError(f"未知模型: {model_id}")

        base_url = f"https://www.modelscope.cn/models/{info['modelscope_id']}/resolve/master"
        results = {}

        # 下载主 GGUF 文件
        gguf_path = GGUF_DIR / info["filename"]
        if not gguf_path.exists():
            url = f"{base_url}/{info['filename']}"
            print(f"[GGUF] 下载: {url}")
            self._emit_progress("download", 0, f"开始下载 {info['filename']}...")
            self._download_file(url, gguf_path)
            self._emit_progress("download", 100, f"✅ {info['filename']} 下载完成")
            results["gguf"] = str(gguf_path)
        else:
            print(f"[GGUF] 已存在: {gguf_path}")
            self._emit_progress("download", 0, f"GGUF 文件已存在: {gguf_path.name}")
            results["gguf"] = str(gguf_path)

        # 下载 mmproj (视觉编码器)
        if info.get("mmproj"):
            mmproj_path = GGUF_DIR / info["mmproj"]
            if not mmproj_path.exists():
                url = f"{base_url}/{info['mmproj']}"
                print(f"[GGUF] 下载 mmproj: {url}")
                self._emit_progress("download", 0, f"下载视觉编码器 {info['mmproj']}...")
                self._download_file(url, mmproj_path)
                self._emit_progress("download", 100, f"✅ mmproj 下载完成")
                results["mmproj"] = str(mmproj_path)
            else:
                results["mmproj"] = str(mmproj_path)

        return results

    def _is_server_ready(self, timeout: int = 10) -> bool:
        """检查 llama-server 是否就绪"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                req = urllib.request.Request(
                    f"{self.base_url}/v1/models",
                    headers={"Content-Type": "application/json"},
                )
                with urlopen(req, timeout=3) as resp:
                    if resp.status == 200:
                        return True
            except Exception:
                pass
            time.sleep(0.5)
        return False

    def load_model_sync(
        self,
        model_id: str,
        n_ctx: Optional[int] = None,
        n_threads: Optional[int] = None,
        n_gpu_layers: int = 0,
    ) -> Dict[str, Any]:
        """
        启动 llama-server 子进程，加载 GGUF 模型。
        
        参数：
            model_id: GGUF_REGISTRY 中的模型 ID
            n_ctx: 上下文窗口大小（默认 2048）
            n_threads: CPU 线程数（默认 4）
            n_gpu_layers: GPU 层数（Intel Mac = 0，强制 CPU）
        """
        info = GGUF_REGISTRY.get(model_id)
        if not info:
            raise ValueError(f"未知模型: {model_id}")

        # 停止已有的 llama-server
        self._stop_server()

        start_time = time.time()
        n_ctx = n_ctx or self.n_ctx
        n_threads = n_threads or self.n_threads

        # 1. 确保 GGUF 模型已下载
        self._emit_progress("init", 0, "检查模型文件...")
        gguf_path = GGUF_DIR / info["filename"]

        if not gguf_path.exists():
            self._emit_progress("download", 0, "模型未下载，开始从 ModelScope 下载...")
            self.download_model(model_id)
            self._emit_progress("download", 100, "模型下载完成")

        # 2. 构建 llama-server 命令
        # 强制 -ngl 0（禁用 GPU，brew 版 llama-server 无 Metal）
        cmd = [
            LLAMA_SERVER_PATH,
            "-m", str(gguf_path),
            "--host", self.host,
            "--port", str(self.port),
            "-ngl", "0",          # 禁用 GPU 层（Intel Mac 强制 CPU）
            "-c", str(n_ctx),     # 上下文大小
            "-t", str(n_threads), # 线程数
        ]

        # 3. 添加 mmproj（如果有）
        if info.get("mmproj"):
            mmproj_path = GGUF_DIR / info["mmproj"]
            if mmproj_path.exists():
                cmd.extend(["--mmproj", str(mmproj_path)])
                print(f"[GGUF] 使用视觉编码器: {mmproj_path}")

        print(f"[GGUF] 启动: {' '.join(cmd)}")

        # 4. 启动 llama-server 子进程
        self._emit_progress("loading", 5, "启动 llama-server...")
        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=False,
            bufsize=1,
        )

        # 5. 启动日志读取线程
        self._start_log_thread()

        # 6. 等待服务就绪
        self._emit_progress("loading", 30, "等待服务启动...")
        if not self._is_server_ready(timeout=30):
            self._stop_server()
            raise RuntimeError(
                f"llama-server 启动失败（端口 {self.port} 未就绪）。"
                "请检查日志或尝试：`brew services restart llama-cpp`"
            )

        self._emit_progress("done", 100, f"模型加载完成！耗时 {time.time() - start_time:.1f}s")

        self.model_name = model_id
        self.model_path = str(gguf_path)
        self.is_loaded = True

        elapsed = time.time() - start_time
        return {
            "success": True,
            "model_name": model_id,
            "model_type": "gguf",
            "gguf_file": info["filename"],
            "n_ctx": n_ctx,
            "n_threads": n_threads,
            "n_gpu_layers": n_gpu_layers,
            "base_url": self.base_url,
            "load_time_seconds": round(elapsed, 2),
            "message": f"llama-server 启动成功（端口 {self.port}），GGUF 模型已就绪",
        }

    def _stop_server(self):
        """停止 llama-server 子进程"""
        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None
        self.is_loaded = False
        self.model_name = None

    def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        top_p: float = 0.9,
        stop: Optional[list] = None,
    ) -> str:
        """
        文本生成（通过 OpenAI 兼容 API）
        """
        if not self.is_loaded:
            raise RuntimeError("模型未加载")

        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }
        if stop:
            payload["stop"] = stop

        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())

        return result["choices"][0]["message"]["content"].strip()

    def chat(
        self,
        messages: list,
        max_tokens: int = 512,
        temperature: float = 0.7,
        stream: bool = False,
    ) -> Dict[str, Any]:
        """
        聊天（支持多模态消息，如图片）

        messages: [{"role": "user", "content": [...] }]
            content 可以是字符串或列表（包含 text + image_url）
        """
        if not self.is_loaded:
            raise RuntimeError("模型未加载")

        payload = {
            "model": self.model_name,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urlopen(req, timeout=600) as resp:  # 10min 超时（视觉任务慢）
            result = json.loads(resp.read())

        return result

    def unload(self):
        """停止模型服务"""
        self._stop_server()
        self.model_name = None
        self.model_path = None

    def get_server_logs(self, lines: int = 50) -> str:
        """获取 llama-server 最近日志"""
        with self._log_lock:
            logs = list(self._log_lines)
        return "\n".join(logs[-lines:])
