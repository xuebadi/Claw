import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow): Tray {
  // Create tray icon
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon: Electron.NativeImage
  
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      // Create a simple default icon
      icon = nativeImage.createEmpty()
    }
    // Resize for tray (16x16 on macOS)
    icon = icon.resize({ width: 16, height: 16 })
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('学霸帝Claw - 智能桌面助手')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 学霸帝Claw',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    { type: 'separator' },
    {
      label: '新建任务',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        mainWindow.show()
        mainWindow.webContents.send('new-task')
      }
    },
    {
      label: '开始录制任务',
      click: () => {
        mainWindow.webContents.send('start-recording')
      }
    },
    {
      label: '停止录制',
      click: () => {
        mainWindow.webContents.send('stop-recording')
      }
    },
    { type: 'separator' },
    {
      label: '设置...',
      click: () => {
        mainWindow.show()
        mainWindow.webContents.send('navigate', '/settings')
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
