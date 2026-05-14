import { useState, useRef } from 'react'

interface HomePageProps {
  onNavigate: (page: 'home' | 'local' | 'settings' | 'about') => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  screenshot?: string
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null)
  const [agentThinking, setAgentThinking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleCapture = async () => {
    try {
      const result = await window.api.captureScreen()
      setCurrentScreenshot(result.dataUrl)
    } catch (error) {
      console.error('截图失败:', error)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setAgentThinking(true)
    scrollToBottom()

    try {
      // Capture current screen
      const screenResult = await window.api.captureScreen()
      const screenSize = await window.api.getPrimaryScreenSize()

      // Send to agent
      const response = await window.api.sendToAgent(userMessage.content, {
        screenshot: currentScreenshot || screenResult.dataUrl,
        screenSize
      })

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.reasoning || response.error || '未知响应',
        timestamp: new Date(),
        screenshot: response.screenshot
      }

      setMessages(prev => [...prev, assistantMessage])

      // Update screenshot if agent returned one
      if (response.screenshot) {
        setCurrentScreenshot(response.screenshot)
      }
    } catch (error) {
      console.error('Agent 请求失败:', error)
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `错误: ${error}`,
        timestamp: new Date()
      }])
    } finally {
      setIsLoading(false)
      setAgentThinking(false)
      scrollToBottom()
    }
  }

  const quickActions = [
    { icon: '📸', label: '截取屏幕', desc: '获取当前屏幕截图', action: handleCapture },
    { icon: '🖱️', label: '本地控制', desc: '直接控制鼠标和键盘', action: () => onNavigate('local') },
    { icon: '📋', label: '打开应用', desc: '启动常用应用程序', action: () => handleQuickAction('打开 Safari 浏览器') },
    { icon: '🌐', label: '网页搜索', desc: '搜索网页内容', action: () => handleQuickAction('帮我搜索最近的 AI 新闻') },
  ]

  const handleQuickAction = (text: string) => {
    setInput(text)
    // Auto submit after a short delay
    setTimeout(() => {
      handleSubmit()
    }, 100)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      {/* Quick actions */}
      <div className="card">
        <div className="card-title">⚡ 快捷操作</div>
        <div className="quick-actions">
          {quickActions.map((action, index) => (
            <div
              key={index}
              className="quick-action"
              onClick={action.action}
            >
              <div className="icon">{action.icon}</div>
              <div>
                <div className="label">{action.label}</div>
                <div className="desc">{action.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Task input */}
      <div className="card">
        <div className="card-title">💬 输入任务指令</div>
        <form onSubmit={handleSubmit}>
          <textarea
            className="input"
            placeholder="例如：帮我打开 Safari 浏览器并访问 github.com"
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={3}
            disabled={isLoading}
          />
          <div className="flex justify-between items-center mt-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCapture}
              disabled={isLoading}
            >
              📸 截取屏幕
            </button>
            <button
              type="submit"
              className="task-submit-btn"
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  处理中...
                </>
              ) : (
                <>🚀 执行任务</>
              )}
            </button>
          </div>
        </form>

        {/* Screenshot preview */}
        {currentScreenshot && (
          <div className="screenshot-preview">
            <img src={currentScreenshot} alt="屏幕截图" />
            <div className="screenshot-actions">
              <button
                className="btn"
                onClick={handleCapture}
              >
                🔄 刷新
              </button>
              <button
                className="btn"
                onClick={() => setCurrentScreenshot(null)}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="card">
          <div className="card-title">📝 对话历史</div>
          <div className="message-list">
            {messages.map(message => (
              <div key={message.id} className={`message ${message.role}`}>
                <div className="message-avatar">
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message-content">
                  <div className="message-text">{message.content}</div>
                  <div className="message-time">{formatTime(message.timestamp)}</div>
                </div>
              </div>
            ))}
            
            {agentThinking && (
              <div className="message assistant">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="message-text">
                    <span className="spinner dark" style={{ marginRight: 8 }}></span>
                    AI 正在分析屏幕并思考...
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="icon">🤖</div>
            <h3>开始你的第一个任务</h3>
            <p className="text-muted text-sm">
              在上方输入框中输入自然语言指令，AI 将自动分析屏幕并执行任务
            </p>
            <div className="alert alert-info mt-4" style={{ textAlign: 'left' }}>
              <strong>💡 示例任务：</strong><br/>
              • "帮我打开 Safari 浏览器"<br/>
              • "截取当前屏幕"<br/>
              • "在桌面上创建一个新文件夹"<br/>
              • "打开备忘录并记录今日待办"
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
