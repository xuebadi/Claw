"""
学霸帝Claw 模型管理器
====================
负责模型的下载、加载、推理和卸载
支持 UI-TARS-1.5-7B 及其变体
首次加载时自动从 ModelScope 下载模型
"""

import os
import sys
import time
import json
import shutil
import torch
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, AsyncGenerator, Callable

# 模型默认存储路径
DEFAULT_MODEL_DIR = Path.home() / ".xuebadi" / "models"

# 模型名称到 ModelScope ID 的映射
MODEL_REGISTRY = {
    "ui-tars-1.5-7b": {
        "modelscope_id": "ByteDance-Seed/UI-TARS-1.5-7B",
        "huggingface_id": "ByteDance/UI-TARS-1.5-7B",
        "size_gb": 14,
        "description": "UI-TARS-1.5-7B 视觉语言模型",
    },
    "ui-tars-1.5-2b": {
        "modelscope_id": "ByteDance-Seed/UI-TARS-1.5-2B",
        "huggingface_id": "ByteDance/UI-TARS-1.5-2B",
        "size_gb": 4,
        "description": "UI-TARS-1.5-2B 轻量版",
    },
}


class ModelManager:
    """模型管理器 - 统一管理模型生命周期"""
    
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.processor = None
        self.device = None
        self.model_name = None
        self.model_path = None
        self.is_generating = False
        self.load_time = None
        self._progress_callback = None
        self._event_loop = None  # 主事件循环引用
        
        # 确保模型目录存在
        DEFAULT_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    
    def get_status(self) -> Dict[str, Any]:
        """获取当前模型状态"""
        if not self.model:
            return {
                "loaded": False,
                "model_name": None,
                "device": None,
            }
        
        # 获取 GPU/MPS 内存使用情况
        memory_info = {}
        if torch.cuda.is_available():
            memory_info["gpu_allocated"] = f"{torch.cuda.memory_allocated() / 1e9:.2f} GB"
            memory_info["gpu_reserved"] = f"{torch.cuda.memory_reserved() / 1e9:.2f} GB"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            memory_info["device"] = "mps (Apple Silicon)"
        
        return {
            "loaded": True,
            "model_name": self.model_name,
            "model_path": str(self.model_path) if self.model_path else None,
            "device": str(self.device),
            "load_time": self.load_time,
            "dtype": str(next(self.model.parameters()).dtype) if self.model else None,
            "memory": memory_info,
        }
    
    def is_loaded(self) -> bool:
        """检查模型是否已加载"""
        return self.model is not None
    
    async def load_model(
        self,
        model_name: str = "ByteDance-Seed/UI-TARS-1.5-7B",
        model_path: Optional[str] = None,
        device: Optional[str] = None,
        load_in_8bit: bool = False,
        load_in_4bit: bool = False,
        progress_callback: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """
        加载模型（异步包装）
        
        Args:
            model_name: HuggingFace/ModelScope 模型名称
            model_path: 本地模型路径（优先使用）
            device: 指定设备 ("auto", "cpu", "mps", "cuda")
            load_in_8bit: 是否使用 8bit 量化
            load_in_4bit: 是否使用 4bit 量化
            progress_callback: 进度回调 fn(phase, progress, message)
        
        Returns:
            加载状态信息
        """
        self._progress_callback = progress_callback
        # 在线程池中执行阻塞的模型加载
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._load_model_sync,
            model_name, model_path, device, load_in_8bit, load_in_4bit
        )
    
    def _emit_progress(self, phase: str, progress: float, message: str):
        """发送进度更新"""
        if self._progress_callback:
            try:
                # 如果有主事件循环引用，使用线程安全调用
                if self._event_loop and self._event_loop.is_running():
                    self._event_loop.call_soon_threadsafe(
                        self._progress_callback, phase, progress, message
                    )
                else:
                    self._progress_callback(phase, progress, message)
            except Exception:
                pass
    
    def _load_model_sync(
        self,
        model_name: str,
        model_path: Optional[str],
        device: Optional[str],
        load_in_8bit: bool,
        load_in_4bit: bool,
    ) -> Dict[str, Any]:
        """同步加载模型（在 executor 中运行）"""
        from transformers import AutoModelForCausalLM, AutoTokenizer, AutoProcessor
        
        print(f"[ModelManager] 开始加载模型: {model_name}")
        start_time = time.time()
        
        try:
            # 1. 确定设备
            self._emit_progress("init", 0, "检测硬件设备...")
            self.device = self._detect_device(device)
            print(f"[ModelManager] 使用设备: {self.device}")
            self._emit_progress("init", 10, f"设备: {self.device}")
            
            # 2. 确定模型路径（含自动下载）
            if model_path and Path(model_path).exists():
                actual_path = model_path
                print(f"[ModelManager] 使用本地路径: {actual_path}")
                self._emit_progress("resolve", 20, f"使用本地路径: {actual_path}")
            else:
                actual_path = self._resolve_model_path(model_name)
                print(f"[ModelManager] 解析路径: {actual_path}")
            
            self.model_path = actual_path
            self.model_name = model_name
            
            # 3. 加载 tokenizer 和 processor
            self._emit_progress("tokenizer", 40, "加载分词器...")
            print("[ModelManager] 加载 Tokenizer...")
            self.tokenizer = AutoTokenizer.from_pretrained(
                actual_path,
                trust_remote_code=True,
                use_fast=False
            )
            self._emit_progress("tokenizer", 50, "分词器加载完成")
            
            # 尝试加载 processor（用于多模态模型）
            try:
                self.processor = AutoProcessor.from_pretrained(
                    actual_path,
                    trust_remote_code=True
                )
            except Exception as e:
                print(f"[ModelManager] Processor 加载失败（非多模态模型）: {e}")
                self.processor = None
            
            # 4. 加载模型
            self._emit_progress("model", 55, "加载模型权重（这可能需要几分钟）...")
            print("[ModelManager] 加载模型权重...")
            
            # 根据设备和量化设置选择加载方式
            dtype = torch.float16 if self.device != "cpu" else torch.float32
            
            kwargs = {
                "pretrained_model_name_or_path": actual_path,
                "trust_remote_code": True,
                "torch_dtype": dtype,
                "device_map": "auto" if self.device == "auto" else None,
            }
            
            # 量化加载
            if load_in_4bit or load_in_8bit:
                try:
                    from transformers import BitsAndBytesConfig
                    
                    bnb_config = BitsAndBytesConfig(
                        load_in_4bit=load_in_4bit,
                        load_in_8bit=load_in_8bit,
                        bnb_4bit_compute_dtype=dtype,
                    )
                    kwargs["quantization_config"] = bnb_config
                    kwargs.pop("device_map", None)
                    
                except ImportError:
                    print("[ModelManager] bitsandbytes 未安装，跳过量化")
            
            # 如果指定了具体设备
            if self.device not in ("auto",):
                kwargs.pop("device_map", None)
            
            self._emit_progress("model", 60, "正在读取模型文件...")
            self.model = AutoModelForCausalLM.from_pretrained(**kwargs)
            
            # 移动到指定设备
            if self.device not in ("auto",) and hasattr(self.model, 'to'):
                self._emit_progress("model", 85, f"移动模型到 {self.device}...")
                self.model = self.model.to(self.device)
            
            # 设置为评估模式
            self.model.eval()
            
            # 记录加载时间
            elapsed = time.time() - start_time
            self.load_time = time.strftime("%Y-%m-%d %H:%M:%S")
            
            self._emit_progress("done", 100, f"加载完成！耗时 {elapsed:.1f}s")
            
            result = {
                "success": True,
                "model_name": model_name,
                "device": str(self.device),
                "load_time_seconds": round(elapsed, 2),
                "message": f"模型加载成功，耗时 {elapsed:.1f}s"
            }
            
            print(f"[ModelManager] {result['message']}")
            return result
            
        except Exception as e:
            error_msg = f"模型加载失败: {str(e)}"
            print(f"[ModelManager] ERROR: {error_msg}")
            self._emit_progress("error", -1, error_msg)
            
            # 清理可能部分加载的资源
            self.model = None
            self.tokenizer = None
            
            raise RuntimeError(error_msg)
    
    async def unload(self) -> None:
        """卸载模型，释放内存"""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._unload_sync)
    
    def _unload_sync(self) -> None:
        """同步卸载"""
        print("[ModelManager] 卸载模型...")
        
        if self.model is not None:
            del self.model
            self.model = None
        
        if self.tokenizer is not None:
            del self.tokenizer
            self.tokenizer = None
        
        if self.processor is not None:
            del self.processor
            self.processor = None
        
        # 清理 GPU 缓存
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        # MPS 缓存清理
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            if hasattr(torch.mps, 'empty_cache'):
                torch.mps.empty_cache()
        
        import gc
        gc.collect()
        
        self.model_name = None
        self.device = None
        self.load_time = None
        
        print("[ModelManager] 模型已卸载，内存已释放")
    
    async def generate(
        self,
        prompt: str,
        image: Optional[str] = None,
        max_new_tokens: int = 512,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ) -> Dict[str, Any]:
        """
        文本生成（异步包装）
        
        Returns:
            {
                "text": 生成的文本,
                "prompt_tokens": 输入 token 数,
                "completion_tokens": 输出 token 数,
                "total_tokens": 总 token 数,
                "finish_reason": 停止原因
            }
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._generate_sync,
            prompt, image, max_new_tokens, temperature, top_p
        )
    
    def _generate_sync(
        self,
        prompt: str,
        image: Optional[str],
        max_new_tokens: int,
        temperature: float,
        top_p: float,
    ) -> Dict[str, Any]:
        """同步生成"""
        from PIL import Image
        import base64
        import io
        
        start_time = time.time()
        
        try:
            # 处理图片输入
            image_input = None
            if image and self.processor:
                try:
                    image_data = base64.b64decode(image)
                    image_input = Image.open(io.BytesIO(image_data)).convert("RGB")
                except Exception as e:
                    print(f"[ModelManager] 图片处理失败: {e}")
            
            # 构建输入
            if image_input and self.processor:
                # 多模态输入
                inputs = self.processor(
                    text=prompt,
                    images=[image_input],
                    return_tensors="pt",
                ).to(self.device)
            else:
                # 纯文本输入
                inputs = self.tokenizer(
                    prompt,
                    return_tensors="pt",
                ).to(self.device)
            
            # 生成参数
            gen_kwargs = dict(
                max_new_tokens=max_new_tokens,
                temperature=temperature if temperature > 0 else 1.0,
                top_p=top_p,
                do_sample=temperature > 0,
                pad_token_id=self.tokenizer.eos_token_id,
            )
            
            # 执行生成
            with torch.no_grad():
                output_ids = self.model.generate(**inputs, **gen_kwargs)
            
            # 解码输出
            input_length = inputs.input_ids.shape[1]
            new_ids = output_ids[0][input_length:]
            generated_text = self.tokenizer.decode(new_ids, skip_special_tokens=True)
            
            elapsed = time.time() - start_time
            
            return {
                "text": generated_text.strip(),
                "prompt_tokens": int(input_length),
                "completion_tokens": len(new_ids),
                "total_tokens": int(output_ids.shape[1]),
                "finish_reason": "stop",
                "generation_time_seconds": round(elapsed, 2),
            }
            
        except Exception as e:
            error_msg = f"生成失败: {str(e)}"
            print(f"[ModelManager] ERROR: {error_msg}")
            raise RuntimeError(error_msg)
    
    async def generate_stream(
        self,
        prompt: str,
        image: Optional[str] = None,
        max_new_tokens: int = 512,
        temperature: float = 0.7,
        top_p: float = 0.9,
    ) -> AsyncGenerator[str, None]:
        """流式文本生成"""
        loop = asyncio.get_event_loop()
        
        queue = asyncio.Queue()
        
        def _stream_worker():
            try:
                for chunk in self._generate_stream_sync(
                    prompt, image, max_new_tokens, temperature, top_p
                ):
                    queue.put_nowait(chunk)
                queue.put_nowait(None)  # 结束标记
            except Exception as e:
                queue.put_nowait(Exception(e))
        
        # 启动流式生成任务
        loop.run_in_executor(None, _stream_worker)
        
        # 异步产出结果
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item
    
    def _generate_stream_sync(
        self,
        prompt: str,
        image: Optional[str],
        max_new_tokens: int,
        temperature: float,
        top_p: float,
    ):
        """同步流式生成（迭代器）"""
        from PIL import Image
        import base64
        import io
        
        # 构建输入（与 _generate_sync 相同逻辑）
        image_input = None
        if image and self.processor:
            try:
                image_data = base64.b64decode(image)
                image_input = Image.open(io.BytesIO(image_data)).convert("RGB")
            except Exception:
                pass
        
        if image_input and self.processor:
            inputs = self.processor(text=prompt, images=[image_input], return_tensors="pt").to(self.device)
        else:
            inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        
        # 流式生成
        from transformers import TextIteratorStreamer
        streamer = TextIteratorAnalyzer(self.tokenizer, skip_prompt=True, **inputs)
        
        gen_kwargs = dict(
            max_new_tokens=max_new_tokens,
            temperature=temperature if temperature > 0 else 1.0,
            top_p=top_p,
            do_sample=temperature > 0,
            pad_token_id=self.tokenizer.eos_token_id,
            streamer=streamer,
        )
        
        # 在后台线程中运行生成
        import threading
        thread = threading.Thread(target=self.model.generate, kwargs={**inputs, **gen_kwargs})
        thread.start()
        
        # 从 streamer 获取输出
        for text in streamer:
            yield text
        
        thread.join(timeout=60)
    
    def _detect_device(self, device_hint: Optional[str]) -> str:
        """检测最佳可用设备"""
        if device_hint and device_hint != "auto":
            return device_hint
        
        # 优先级: CUDA > MPS > CPU
        if torch.cuda.is_available():
            return "cuda"
        
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"
        
        return "cpu"
    
    def _resolve_model_path(self, model_name: str) -> str:
        """
        解析模型路径（支持自动下载）：
        1. 先检查本地缓存目录
        2. 再检查 modelscope hub_cache
        3. 尝试从 ModelScope 自动下载
        4. 最后尝试 HuggingFace
        """
        # 标准化模型名称
        normalized = model_name.replace("/", "--")
        
        # 方式1: 直接路径
        local_path = DEFAULT_MODEL_DIR / normalized
        if local_path.exists() and (local_path / "config.json").exists():
            print(f"[ModelManager] 找到本地模型: {local_path}")
            self._emit_progress("resolve", 25, f"找到本地模型: {local_path.name}")
            return str(local_path)
        
        # 方式2: ModelScope hub_cache
        hub_cache = DEFAULT_MODEL_DIR / "hub"
        if hub_cache.exists():
            for sub in hub_cache.iterdir():
                if model_name.replace("/", "--") in sub.name and (sub / "config.json").exists():
                    print(f"[ModelManager] 找到 hub 缓存: {sub}")
                    self._emit_progress("resolve", 25, f"找到缓存模型: {sub.name}")
                    return str(sub)
        
        # 方式3: 从 ModelScope 下载（推荐，国内访问稳定）
        self._emit_progress("download", 20, "模型未找到，尝试从 ModelScope 自动下载...")
        
        modelscope_ok = False
        try:
            from modelscope import snapshot_download
            
            print(f"[ModelManager] 从 ModelScope 下载: {model_name}")
            self._emit_progress("download", 22, f"连接 ModelScope: {model_name}")
            
            downloaded = snapshot_download(
                model_name,
                cache_dir=str(DEFAULT_MODEL_DIR)
            )
            modelscope_ok = True
            self._emit_progress("download", 38, "模型下载完成！")
            print(f"[ModelManager] 下载完成: {downloaded}")
            return downloaded
            
        except ImportError:
            print("[ModelManager] modelscope 未安装")
            self._emit_progress("download", 23, "modelscope 未安装，请运行: pip install modelscope")
        except Exception as e:
            err_str = str(e)
            print(f"[ModelScope] 下载失败: {err_str}")
            # 判断是否是因为模型不存在
            if "does not exist" in err_str or "not exists" in err_str:
                self._emit_progress("download", 25, 
                    f"ModelScope 上未找到 {model_name}，尝试其他源...")
            else:
                self._emit_progress("download", 25, f"ModelScope 下载失败: {err_str[:100]}")
        
        # 方式4: 从 HuggingFace 下载（含镜像）
        hf_endpoints = [
            "https://hf-mirror.com",      # 国内镜像
            None,                           # 默认 HuggingFace
        ]
        
        hf_model_name = model_name
        # ModelScope → HuggingFace ID 映射
        hf_mapping = {
            "ByteDance-Seed/UI-TARS-1.5-7B": "ByteDance/UI-TARS-1.5-7B",
            "ByteDance-Seed/UI-TARS-1.5-2B": "ByteDance/UI-TARS-1.5-2B",
        }
        if model_name in hf_mapping:
            hf_model_name = hf_mapping[model_name]
        
        for endpoint in hf_endpoints:
            if endpoint:
                self._emit_progress("download", 26, f"尝试 HuggingFace 镜像: {endpoint}")
            else:
                self._emit_progress("download", 27, f"尝试 HuggingFace: {hf_model_name}")
            
            try:
                import os
                old_endpoint = os.environ.get('HF_ENDPOINT')
                if endpoint:
                    os.environ['HF_ENDPOINT'] = endpoint
                
                from huggingface_hub import snapshot_download as hf_download
                
                print(f"[ModelManager] 从 HuggingFace 下载: {hf_model_name} (endpoint={endpoint or 'default'})")
                downloaded = hf_download(
                    hf_model_name,
                    cache_dir=str(DEFAULT_MODEL_DIR)
                )
                
                # 恢复环境变量
                if old_endpoint is not None:
                    os.environ['HF_ENDPOINT'] = old_endpoint
                elif endpoint:
                    os.environ.pop('HF_ENDPOINT', None)
                
                self._emit_progress("download", 38, "模型下载完成！")
                print(f"[ModelManager] 下载完成: {downloaded}")
                return downloaded
                
            except ImportError:
                self._emit_progress("download", 28, "huggingface_hub 未安装，请运行: pip install huggingface_hub")
                break
            except Exception as e:
                print(f"[HuggingFace] 下载失败: {e}")
                self._emit_progress("download", 28, f"HuggingFace 下载失败: {str(e)[:80]}")
                continue
        
        # 所有自动下载方式均失败 → 提示用户手动下载
        msg = (
            f"自动下载失败：{model_name} 在 ModelScope/HuggingFace 上不可达。\n"
            f"请手动下载模型到: {DEFAULT_MODEL_DIR}\n"
            f"或设置本地路径后重试。"
        )
        print(f"[ModelManager] {msg}")
        self._emit_progress("download", 30, msg)
        
        # 不抛异常，让后续加载流程尝试（也许用户已通过其他方式安装）
        return model_name
    
    def check_model_exists(self, model_name: str) -> Dict[str, Any]:
        """检查模型是否已在本地存在"""
        normalized = model_name.replace("/", "--")
        
        # 检查直接路径
        local_path = DEFAULT_MODEL_DIR / normalized
        if local_path.exists() and (local_path / "config.json").exists():
            size = sum(f.stat().st_size for f in local_path.rglob("*") if f.is_file())
            return {
                "exists": True,
                "path": str(local_path),
                "size_gb": round(size / 1e9, 2),
            }
        
        # 检查 hub cache
        hub_cache = DEFAULT_MODEL_DIR / "hub"
        if hub_cache.exists():
            for sub in hub_cache.iterdir():
                if model_name.replace("/", "--") in sub.name and (sub / "config.json").exists():
                    size = sum(f.stat().st_size for f in sub.rglob("*") if f.is_file())
                    return {
                        "exists": True,
                        "path": str(sub),
                        "size_gb": round(size / 1e9, 2),
                    }
        
        return {"exists": False}


class TextIteratorAnalyzer:
    """自定义流式迭代器（兼容 TextIteratorStreamer）"""
    
    def __init__(self, tokenizer, **kwargs):
        self.tokenizer = tokenizer
        self.kwargs = kwargs
    
    def __iter__(self):
        return self
    
    def __next__(self):
        raise NotImplementedError("使用 generate_stream 方法")


if __name__ == "__main__":
    # 测试代码
    manager = ModelManager()
    print(f"模型目录: {DEFAULT_MODEL_DIR}")
    print(f"状态: {manager.get_status()}")
