import { app, shell, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc'
import { createMenu } from './menu'
import { createTray } from './tray'
import { initLogger, logger } from './logger'
import { initAgent } from './agent'
import { initStore } from './store'

// Initialize logger first
initLogger()

logger.info('学霸帝Claw 启动中...')
logger.info(`版本: ${app.getVersion()}`)
logger.info(`平台: ${process.platform}`)
logger.info(`Electron: ${process.versions.electron}`)
logger.info(`Node: ${process.versions.node}`)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  logger.info('创建主窗口...')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    title: '学霸帝Claw',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    logger.info('主窗口准备就绪，显示窗口')
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    // Minimize to tray instead of closing
    if (process.platform === 'darwin' && !app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      logger.info('窗口隐藏到托盘')
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  logger.info('主窗口创建完成')
}

// Extend app type
declare module 'electron' {
  interface App {
    isQuitting?: boolean
  }
}

app.whenReady().then(async () => {
  logger.info('App ready')

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.xuebadi.claw')

  // Initialize store
  initStore()
  logger.info('Store 初始化完成')

  // Initialize agent
  await initAgent()
  logger.info('Agent 初始化完成')

  // Setup IPC handlers
  setupIpcHandlers()
  logger.info('IPC handlers 注册完成')

  // Watch for window shortcuts in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create main window
  createWindow()

  // Create menu
  createMenu(mainWindow!)

  // Create system tray
  tray = createTray(mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })

  logger.info('学霸帝Claw 启动完成')
})

app.on('before-quit', () => {
  logger.info('应用即将退出...')
  app.isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('quit', () => {
  logger.info('学霸帝Claw 已退出')
})

// Export for other modules
export { mainWindow }
