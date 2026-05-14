import { useState, useEffect } from 'react'
import HomePage from './pages/home/HomePage'
import LocalPage from './pages/local/LocalPage'
import SettingsPage from './pages/settings/SettingsPage'
import AboutPage from './pages/about/AboutPage'

type Page = 'home' | 'local' | 'settings' | 'about'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [agentStatus, setAgentStatus] = useState({ connected: false, model: 'UI-TARS-1.5-7B' })

  useEffect(() => {
    // Get agent status on mount
    window.api.getAgentStatus().then(status => {
      setAgentStatus(status)
    }).catch(console.error)

    // Listen for navigation events from main process
    window.api.onNavigate((path: string) => {
      if (path === '/settings') setCurrentPage('settings')
      else if (path === '/local') setCurrentPage('local')
      else setCurrentPage('home')
    })

    window.api.onShowAbout(() => {
      setCurrentPage('about')
    })
  }, [])

  const navItems = [
    { id: 'home' as Page, label: '首页', icon: '🏠', path: '/' },
    { id: 'local' as Page, label: '本地控制', icon: '💻', path: '/local' },
    { id: 'settings' as Page, label: '设置', icon: '⚙️', path: '/settings' },
    { id: 'about' as Page, label: '关于', icon: 'ℹ️', path: '/about' },
  ]

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={setCurrentPage} />
      case 'local':
        return <LocalPage />
      case 'settings':
        return <SettingsPage />
      case 'about':
        return <AboutPage />
      default:
        return <HomePage onNavigate={setCurrentPage} />
    }
  }

  const pageTitles: Record<Page, { title: string; desc: string }> = {
    home: { title: '学霸帝Claw', desc: '基于 UI-TARS 的智能桌面助手' },
    local: { title: '本地控制', desc: '控制本机屏幕、鼠标和键盘' },
    settings: { title: '设置', desc: '配置模型、快捷键和其他选项' },
    about: { title: '关于', desc: '学霸帝Claw 版本信息和许可证' },
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🖐️ 学霸帝Claw</h1>
          <div className="subtitle">UI-TARS Desktop</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.id)}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-badge">
            <div className={`status-dot ${agentStatus.connected ? '' : 'offline'}`} />
            <span>
              {agentStatus.connected 
                ? `已连接 ${agentStatus.model}` 
                : '演示模式'
              }
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <header className="page-header">
          <h2>{pageTitles[currentPage].title}</h2>
          <p>{pageTitles[currentPage].desc}</p>
        </header>

        <div className="page-content">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}
