import { useState, useEffect } from 'react'

interface Settings {
  model: string
  modelPath: string
  apiEndpoint: string
  apiKey: string
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  autoStart: boolean
  minimizeToTray: boolean
  screenshotQuality: number
  maxHistory: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    model: 'UI-TARS-1.5-7B',
    modelPath: '',
    apiEndpoint: 'http://localhost:8000/v1',
    apiKey: '',
    theme: 'system',
    language: 'zh',
    autoStart: false,
    minimizeToTray: true,
    screenshotQuality: 85,
    maxHistory: 100
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const stored = await window.api.storeGet('settings')
      if (stored) {
        setSettings({ ...settings, ...stored })
      }
    } catch (error) {
      console.error('加载设置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      await window.api.storeSet('settings', settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('保存设置失败:', error)
    }
  }

  const handleChange = (key: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleOpenExternalLink = (url: string) => {
    window.api.openExternal(url)
  }

  if (loading) {
    return (
      <div className="card">
        <div className="text-center p-4">
          <span className="spinner dark"></span>
          <p className="text-muted mt-2">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Model settings */}
      <div className="card">
        <div className="card-title">🤖 模型设置</div>
        
        <div className="input-group">
          <label className="input-label">模型名称</label>
          <select
            className="input select"
            value={settings.model}
            onChange={e => handleChange('model', e.target.value)}
          >
            <option value="UI-TARS-1.5-7B">UI-TARS-1.5-7B（推荐）</option>
            <option value="UI-TARS-7B">UI-TARS-7B</option>
            <option value="Seed-1.5-VL-7B">Seed-1.5-VL-7B</option>
          </select>
          <p className="text-sm text-muted mt-2">
            UI-TARS-1.5-7B 是最新版本，在 GUI 自动化任务上表现最佳
          </p>
        </div>

        <div className="input-group">
          <label className="input-label">API 端点</label>
          <input
            type="text"
            className="input"
            placeholder="http://localhost:8000/v1"
            value={settings.apiEndpoint}
            onChange={e => handleChange('apiEndpoint', e.target.value)}
          />
          <p className="text-sm text-muted mt-2">
            模型推理服务器的地址。留空将使用演示模式。
          </p>
        </div>

        <div className="input-group">
          <label className="input-label">API 密钥</label>
          <input
            type="password"
            className="input"
            placeholder="sk-..."
            value={settings.apiKey}
            onChange={e => handleChange('apiKey', e.target.value)}
          />
          <p className="text-sm text-muted mt-2">
            如果模型服务器需要认证，请输入 API 密钥
          </p>
        </div>

        <div className="input-group">
          <label className="input-label">本地模型路径</label>
          <input
            type="text"
            className="input"
            placeholder="~/.cache/huggingface/models/..."
            value={settings.modelPath}
            onChange={e => handleChange('modelPath', e.target.value)}
          />
          <p className="text-sm text-muted mt-2">
            本地缓存的模型路径。用于离线模式。
          </p>
        </div>

        <div className="alert alert-info">
          <strong>💡 如何获取模型：</strong><br/>
          1. 从 ModelScope 下载 UI-TARS-1.5-7B 模型<br/>
          2. 使用 vLLM 或 ollama 启动本地推理服务器<br/>
          3. 填入服务器地址和端口
        </div>
      </div>

      {/* Appearance */}
      <div className="card">
        <div className="card-title">🎨 外观设置</div>
        
        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="settings-label">主题</div>
              <div className="settings-desc">选择应用的外观主题</div>
            </div>
            <select
              className="input select"
              style={{ width: 150 }}
              value={settings.theme}
              onChange={e => handleChange('theme', e.target.value)}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色模式</option>
              <option value="dark">深色模式</option>
            </select>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">语言</div>
              <div className="settings-desc">应用界面语言</div>
            </div>
            <select
              className="input select"
              style={{ width: 150 }}
              value={settings.language}
              onChange={e => handleChange('language', e.target.value)}
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      {/* Behavior */}
      <div className="card">
        <div className="card-title">⚙️ 行为设置</div>
        
        <div className="settings-section">
          <div className="settings-row">
            <div>
              <div className="settings-label">开机自启动</div>
              <div className="settings-desc">登录时自动启动学霸帝Claw</div>
            </div>
            <div
              className={`toggle ${settings.autoStart ? 'active' : ''}`}
              onClick={() => handleChange('autoStart', !settings.autoStart)}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">最小化到托盘</div>
              <div className="settings-desc">关闭窗口时最小化到菜单栏托盘</div>
            </div>
            <div
              className={`toggle ${settings.minimizeToTray ? 'active' : ''}`}
              onClick={() => handleChange('minimizeToTray', !settings.minimizeToTray)}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">截图质量</div>
              <div className="settings-desc">屏幕截图的压缩质量 (10-100)</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range"
                min="10"
                max="100"
                value={settings.screenshotQuality}
                onChange={e => handleChange('screenshotQuality', parseInt(e.target.value))}
                style={{ width: 100 }}
              />
              <span className="text-sm" style={{ width: 30 }}>{settings.screenshotQuality}</span>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">历史记录上限</div>
              <div className="settings-desc">保存的任务历史记录最大条数</div>
            </div>
            <input
              type="number"
              className="input"
              style={{ width: 100 }}
              value={settings.maxHistory}
              onChange={e => handleChange('maxHistory', parseInt(e.target.value))}
              min="10"
              max="1000"
            />
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            {saved && (
              <span className="text-sm" style={{ color: 'var(--color-secondary)' }}>
                ✅ 设置已保存
              </span>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleSave}>
            💾 保存设置
          </button>
        </div>
      </div>

      {/* Model download guide */}
      <div className="card">
        <div className="card-title">📥 模型下载指南</div>
        <div className="flex flex-col gap-4">
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>方法一：从 ModelScope 下载（推荐）</h4>
            <p className="text-sm text-muted mb-2">
              ModelScope 镜像在国内访问速度快，推荐使用。
            </p>
            <button
              className="btn btn-secondary text-sm"
              onClick={() => handleOpenExternalLink('https://www.modelscope.cn/models')}
            >
              🌐 访问 ModelScope
            </button>
          </div>

          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>方法二：从 HuggingFace 下载</h4>
            <p className="text-sm text-muted mb-2">
              官方模型托管地址。
            </p>
            <button
              className="btn btn-secondary text-sm"
              onClick={() => handleOpenExternalLink('https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B')}
            >
              🌐 访问 HuggingFace
            </button>
          </div>

          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>方法三：使用 vLLM 启动服务</h4>
            <pre style={{ background: 'var(--color-bg-tertiary)', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto' }}>
{`# 安装 vLLM
pip install vllm

# 启动 UI-TARS-1.5-7B 服务器
python -m vllm.entrypoints.openai.api_server \\
  --model ByteDance-Seed/UI-TARS-1.5-7B \\
  --port 8000 \\
  --tensor-parallel-size 1`}
            </pre>
          </div>

          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>方法四：使用 Ollama（CPU 运行）</h4>
            <pre style={{ background: 'var(--color-bg-tertiary)', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto' }}>
{`# 安装 Ollama
brew install ollama

# 启动 Ollama 服务
ollama serve

# 创建 Modelfile
# FROM 导入下载的模型
# PARAMETER temperature 0.7
# PARAMETER top_p 0.9
# TEMPLATE "{{ .Prompt }}"

# 创建并运行模型
ollama create ui-tars -f Modelfile
ollama run ui-tars`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
