import { useState, useEffect } from 'react'

interface ControlAction {
  type: 'move' | 'click' | 'scroll' | 'type' | 'hotkey'
  description: string
  params?: any
}

export default function LocalPage() {
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail: string }>>([])
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSteps, setRecordingSteps] = useState<ControlAction[]>([])
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null)
  const [controlStatus, setControlStatus] = useState<string>('')
  const [screenSize, setScreenSize] = useState<{ width: number; height: number; scaleFactor: number } | null>(null)

  useEffect(() => {
    loadScreenInfo()
    loadScreenSources()
  }, [])

  const loadScreenInfo = async () => {
    try {
      const size = await window.api.getPrimaryScreenSize()
      setScreenSize(size)
    } catch (error) {
      console.error('获取屏幕信息失败:', error)
    }
  }

  const loadScreenSources = async () => {
    try {
      const sources = await window.api.getScreenSources()
      setScreenSources(sources)
      if (sources.length > 0) {
        setSelectedSource(sources[0].id)
      }
    } catch (error) {
      console.error('获取屏幕源失败:', error)
    }
  }

  const handleCapture = async () => {
    try {
      setControlStatus('正在截取屏幕...')
      const result = await window.api.captureScreen()
      setCurrentScreenshot(result.dataUrl)
      setControlStatus('')
    } catch (error) {
      setControlStatus(`截图失败: ${error}`)
    }
  }

  const handleMouseMove = async (x: number, y: number) => {
    try {
      await window.api.mouseMove(x, y)
      addStep({ type: 'move', description: `移动鼠标到 (${x}, ${y})`, params: { x, y } })
    } catch (error) {
      setControlStatus(`鼠标移动失败: ${error}`)
    }
  }

  const handleMouseClick = async (button: 'left' | 'right' = 'left') => {
    try {
      await window.api.mouseClick(button, 'click')
      addStep({ type: 'click', description: `点击鼠标${button === 'left' ? '左' : '右'}键` })
    } catch (error) {
      setControlStatus(`鼠标点击失败: ${error}`)
    }
  }

  const handleMouseDoubleClick = async () => {
    try {
      await window.api.mouseClick('left', 'doubleClick')
      addStep({ type: 'click', description: '双击左键' })
    } catch (error) {
      setControlStatus(`双击失败: ${error}`)
    }
  }

  const handleScroll = async (direction: 'up' | 'down') => {
    try {
      const deltaY = direction === 'down' ? 300 : -300
      await window.api.mouseScroll(0, deltaY)
      addStep({ type: 'scroll', description: `向${direction === 'down' ? '下' : '上'}滚动` })
    } catch (error) {
      setControlStatus(`滚动失败: ${error}`)
    }
  }

  const handleKeyboardType = async () => {
    const text = prompt('输入要输入的文字:')
    if (text) {
      try {
        await window.api.keyboardType(text)
        addStep({ type: 'type', description: `输入文字: "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}"` })
      } catch (error) {
        setControlStatus(`输入失败: ${error}`)
      }
    }
  }

  const handleHotkey = async (keys: string[]) => {
    try {
      await window.api.keyboardHotkey(keys)
      addStep({ type: 'hotkey', description: `按下快捷键: ${keys.join('+')}` })
    } catch (error) {
      setControlStatus(`快捷键失败: ${error}`)
    }
  }

  const addStep = (action: ControlAction) => {
    if (isRecording) {
      setRecordingSteps(prev => [...prev, action])
    }
    setControlStatus(action.description)
    setTimeout(() => setControlStatus(''), 2000)
  }

  const handleStartRecording = () => {
    setIsRecording(true)
    setRecordingSteps([])
    setControlStatus('开始录制操作...')
  }

  const handleStopRecording = () => {
    setIsRecording(false)
    setControlStatus(`录制完成，共 ${recordingSteps.length} 个步骤`)
  }

  const handleClearRecording = () => {
    setRecordingSteps([])
    setControlStatus('已清除录制')
  }

  const handlePlayback = async () => {
    if (recordingSteps.length === 0) {
      setControlStatus('没有可回放的操作')
      return
    }

    setControlStatus('开始回放...')
    for (const step of recordingSteps) {
      setControlStatus(`执行: ${step.description}`)
      
      switch (step.type) {
        case 'move':
          await window.api.mouseMove(step.params?.x, step.params?.y)
          break
        case 'click':
          await window.api.mouseClick('left', 'click')
          break
        case 'scroll':
          await window.api.mouseScroll(0, step.params?.deltaY || 300)
          break
        case 'type':
          await window.api.keyboardType(step.params?.text || '')
          break
        case 'hotkey':
          await window.api.keyboardHotkey(step.params?.keys || [])
          break
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    setControlStatus('回放完成')
  }

  return (
    <div>
      {/* Control panel */}
      <div className="card">
        <div className="card-title">🖱️ 鼠标控制</div>
        <div className="grid-2">
          <div className="flex flex-col gap-2">
            <div className="input-group">
              <label className="input-label">X 坐标</label>
              <input
                type="number"
                className="input"
                placeholder="X"
                id="mouse-x"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Y 坐标</label>
              <input
                type="number"
                className="input"
                placeholder="Y"
                id="mouse-y"
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                const x = parseInt((document.getElementById('mouse-x') as HTMLInputElement).value)
                const y = parseInt((document.getElementById('mouse-y') as HTMLInputElement).value)
                if (!isNaN(x) && !isNaN(y)) {
                  handleMouseMove(x, y)
                }
              }}
            >
              📍 移动到
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="input-label">快速操作</div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => handleMouseClick('left')}>
                🖱️ 左键点击
              </button>
              <button className="btn btn-secondary" onClick={() => handleMouseClick('right')}>
                🖱️ 右键点击
              </button>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={handleMouseDoubleClick}>
                🖱️ 双击
              </button>
              <button className="btn btn-secondary" onClick={() => handleScroll('up')}>
                ⬆️ 向上滚
              </button>
              <button className="btn btn-secondary" onClick={() => handleScroll('down')}>
                ⬇️ 向下滚
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard control */}
      <div className="card">
        <div className="card-title">⌨️ 键盘控制</div>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => handleKeyboardType()}>
              ⌨️ 输入文字
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 'a'])}>
              ⌘+A 全选
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 'c'])}>
              ⌘+C 复制
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 'v'])}>
              ⌘+V 粘贴
            </button>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 'z'])}>
              ⌘+Z 撤销
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 's'])}>
              ⌘+S 保存
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 'w'])}>
              ⌘+W 关闭
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 'tab'])}>
              ⌘+Tab 切换应用
            </button>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => handleHotkey(['return'])}>
              ↵ 回车
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['escape'])}>
              Esc 退出
            </button>
            <button className="btn btn-secondary" onClick={() => handleHotkey(['command', 'space'])}>
              ⌘+空格 聚焦搜索
            </button>
          </div>
        </div>
      </div>

      {/* Recording */}
      <div className="card">
        <div className="card-title">🎬 操作录制</div>
        <div className="flex items-center gap-4 mb-4">
          {isRecording ? (
            <>
              <button className="btn btn-danger" onClick={handleStopRecording}>
                ⏹️ 停止录制 ({recordingSteps.length} 步)
              </button>
              <span className="text-sm text-muted">
                <span style={{ color: 'var(--color-danger)' }}>●</span> 录制中...
              </span>
            </>
          ) : (
            <button className="btn btn-success" onClick={handleStartRecording}>
              ⏺️ 开始录制
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={handlePlayback}
            disabled={recordingSteps.length === 0}
          >
            ▶️ 回放
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleClearRecording}
            disabled={recordingSteps.length === 0}
          >
            🗑️ 清除
          </button>
        </div>

        {recordingSteps.length > 0 && (
          <div>
            <div className="input-label mb-2">录制的操作：</div>
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {recordingSteps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2"
                  style={{ borderBottom: '1px solid var(--color-border-light)' }}
                >
                  <span className="text-muted text-sm">{index + 1}.</span>
                  <span className="text-sm">{step.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Screen */}
      <div className="card">
        <div className="card-title">🖥️ 屏幕预览</div>
        <div className="flex items-center gap-4 mb-4">
          <button className="btn btn-primary" onClick={handleCapture}>
            📸 截取屏幕
          </button>
          {screenSize && (
            <span className="text-sm text-muted">
              屏幕分辨率: {screenSize.width} × {screenSize.height}
              {screenSize.scaleFactor !== 1 && ` (缩放 ${screenSize.scaleFactor}x)`}
            </span>
          )}
        </div>

        {currentScreenshot && (
          <div className="screenshot-preview" style={{ marginTop: 16 }}>
            <img src={currentScreenshot} alt="屏幕截图" />
            <div className="screenshot-actions">
              <button className="btn" onClick={handleCapture}>
                🔄 刷新
              </button>
              <button className="btn" onClick={() => setCurrentScreenshot(null)}>
                ✕
              </button>
            </div>
          </div>
        )}

        {controlStatus && (
          <div className="alert alert-info mt-4">
            {controlStatus}
          </div>
        )}
      </div>
    </div>
  )
}
