#!/usr/bin/env python3
"""
学霸帝Claw 模型下载脚本
====================
从 ModelScope 下载 UI-TARS-1.5-7B 模型

用法:
    python scripts/download_model.py [--model MODEL_NAME] [--output DIR]
"""

import os
import sys
import argparse
from pathlib import Path

# 默认模型
DEFAULT_MODEL = "ByteDance-Seed/UI-TARS-1.5-7B"
DEFAULT_OUTPUT_DIR = Path.home() / ".xuebadi" / "models"


def download_from_modelscope(model_name: str, output_dir: Path) -> bool:
    """从 ModelScope 下载模型"""
    print(f"=" * 50)
    print(f"  学霸帝Claw 模型下载器")
    print(f"  模型: {model_name}")
    print(f"  输出目录: {output_dir}")
    print(f"=" * 50)
    
    try:
        from modelscope import snapshot_download
    except ImportError:
        print("❌ 错误: 需要安装 modelscope")
        print("   运行: pip install modelscope")
        return False
    
    # 确保输出目录存在
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n📥 开始下载模型...")
    print("   (这可能需要几分钟到几十分钟，取决于网络速度)\n")
    
    try:
        downloaded_path = snapshot_download(
            model_name,
            cache_dir=str(output_dir)
        )
        
        print(f"\n✅ 模型下载完成！")
        print(f"   路径: {downloaded_path}")
        return True
        
    except Exception as e:
        print(f"\n❌ 下载失败: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='下载学霸帝Claw 模型')
    parser.add_argument(
        '--model', '-m',
        default=DEFAULT_MODEL,
        help=f'模型名称 (默认: {DEFAULT_MODEL})'
    )
    parser.add_argument(
        '--output', '-o',
        default=str(DEFAULT_OUTPUT_DIR),
        help=f'输出目录 (默认: {DEFAULT_OUTPUT_DIR})'
    )
    
    args = parser.parse_args()
    
    success = download_from_modelscope(args.model, Path(args.output))
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
