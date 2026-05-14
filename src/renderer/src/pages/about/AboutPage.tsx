import { useState, useEffect } from 'react'

export default function AboutPage() {
  const [version, setVersion] = useState('1.0.0')

  useEffect(() => {
    window.api.getVersion().then(v => setVersion(v)).catch(() => setVersion('1.0.0'))
  }, [])

  const handleOpenExternal = (url: string) => {
    window.api.openExternal(url)
  }

  return (
    <div>
      {/* App info */}
      <div className="card">
        <div className="text-center p-4">
          <div style={{ 
            fontSize: 64, 
            marginBottom: 16,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            🖐️
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            学霸帝Claw
          </h1>
          <p className="text-muted" style={{ marginBottom: 16 }}>
            基于 UI-TARS 的智能桌面助手
          </p>
          <div className="flex justify-center gap-4 text-sm text-muted">
            <span>版本 {version}</span>
            <span>|</span>
            <span>Electron</span>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="card">
        <div className="card-title">✨ 核心功能</div>
        <div className="grid-2">
          <div style={{ padding: 16, background: 'var(--color-bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>AI 驱动</h4>
            <p className="text-sm text-muted">
              基于 UI-TARS-1.5-7B 模型，理解屏幕内容，执行自然语言指令
            </p>
          </div>
          <div style={{ padding: 16, background: 'var(--color-bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🖱️</div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>精准控制</h4>
            <p className="text-sm text-muted">
              控制鼠标、键盘，截取屏幕截图，实现自动化操作
            </p>
          </div>
          <div style={{ padding: 16, background: 'var(--color-bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>隐私安全</h4>
            <p className="text-sm text-muted">
              完全本地运行，屏幕内容不上传云端，保护隐私
            </p>
          </div>
          <div style={{ padding: 16, background: 'var(--color-bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>💻</div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>macOS 原生</h4>
            <p className="text-sm text-muted">
              原生 macOS 应用，支持 Apple Silicon，界面美观流畅
            </p>
          </div>
        </div>
      </div>

      {/* Tech stack */}
      <div className="card">
        <div className="card-title">🛠️ 技术栈</div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="text-sm" style={{ width: 120, fontWeight: 500 }}>核心框架</span>
            <span className="text-sm text-muted">Electron + React + TypeScript</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm" style={{ width: 120, fontWeight: 500 }}>构建工具</span>
            <span className="text-sm text-muted">electron-vite + electron-builder</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm" style={{ width: 120, fontWeight: 500 }}>AI 模型</span>
            <span className="text-sm text-muted">UI-TARS-1.5-7B (ByteDance)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm" style={{ width: 120, fontWeight: 500 }}>许可协议</span>
            <span className="text-sm text-muted">Apache-2.0</span>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="card">
        <div className="card-title">🔗 相关链接</div>
        <div className="flex flex-col gap-2">
          <button
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => handleOpenExternal('https://github.com/bytedance/UI-TARS')}
          >
            🌐 UI-TARS 项目主页
          </button>
          <button
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => handleOpenExternal('https://github.com/bytedance/UI-TARS-desktop')}
          >
            🌐 UI-TARS Desktop
          </button>
          <button
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => handleOpenExternal('https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B')}
          >
            🌐 UI-TARS-1.5-7B (HuggingFace)
          </button>
          <button
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => handleOpenExternal('https://www.modelscope.cn/models')}
          >
            🌐 ModelScope 模型市场
          </button>
        </div>
      </div>

      {/* Credits */}
      <div className="card">
        <div className="card-title">🙏 致谢</div>
        <p className="text-sm text-muted" style={{ lineHeight: 1.8 }}>
          学霸帝Claw 基于 ByteDance 的 UI-TARS 开源项目开发，感谢字节跳动开源团队的努力。
          <br/><br/>
          UI-TARS: Pioneering Automated GUI Interaction with Native Agents
          <br/>
          arXiv:2501.12326
          <br/><br/>
          本应用仅供学习和研究使用，请遵守相关开源协议。
        </p>
      </div>

      {/* Copyright */}
      <div className="card">
        <div className="text-center text-sm text-muted">
          <p>© 2025 xuebadi. All rights reserved.</p>
          <p className="mt-2">
            本应用基于 Apache-2.0 协议开源
          </p>
        </div>
      </div>
    </div>
  )
}
