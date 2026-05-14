import { Menu, BrowserWindow, app, shell } from 'electron'

export function createMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '学霸帝Claw',
      submenu: [
        {
          label: '关于 学霸帝Claw',
          role: 'about'
        },
        { type: 'separator' },
        {
          label: '偏好设置...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('navigate', '/settings')
          }
        },
        { type: 'separator' },
        {
          label: '检查更新...',
          click: () => {
            mainWindow.webContents.send('check-updates')
          }
        },
        { type: 'separator' },
        {
          label: '隐藏 学霸帝Claw',
          accelerator: 'CmdOrCtrl+H',
          role: 'hide'
        },
        {
          label: '隐藏其他',
          role: 'hideOthers'
        },
        {
          label: '全部显示',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: '退出 学霸帝Claw',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.isQuitting = true
            app.quit()
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          role: 'reload'
        },
        {
          label: '强制重新加载',
          accelerator: 'CmdOrCtrl+Shift+R',
          role: 'forceReload'
        },
        {
          label: '开发者工具',
          accelerator: 'Option+CmdOrCtrl+I',
          role: 'toggleDevTools'
        },
        { type: 'separator' },
        {
          label: '放大',
          accelerator: 'CmdOrCtrl+Plus',
          role: 'zoomIn'
        },
        {
          label: '缩小',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut'
        },
        {
          label: '重置缩放',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom'
        },
        { type: 'separator' },
        {
          label: '全屏',
          accelerator: 'Ctrl+Cmd+F',
          role: 'togglefullscreen'
        }
      ]
    },
    {
      label: '窗口',
      submenu: [
        {
          label: '最小化',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: '关闭',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        },
        { type: 'separator' },
        {
          label: '前置所有窗口',
          role: 'front'
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '学霸帝Claw 使用文档',
          click: async () => {
            await shell.openExternal('https://github.com/xuebadi/xueba-tars-desktop')
          }
        },
        {
          label: '报告问题',
          click: async () => {
            await shell.openExternal('https://github.com/xuebadi/xueba-tars-desktop/issues')
          }
        },
        { type: 'separator' },
        {
          label: '关于',
          click: () => {
            mainWindow.webContents.send('show-about')
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
