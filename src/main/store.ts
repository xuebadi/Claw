import Store from 'electron-store'
import { logger } from './logger'

interface StoreSchema {
  settings: {
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
  tasks: TaskRecord[]
  windowState: {
    width: number
    height: number
    x?: number
    y?: number
    isMaximized: boolean
  }
}

interface TaskRecord {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
  steps: TaskStep[]
  screenshot?: string
}

interface TaskStep {
  id: string
  action: string
  description: string
  timestamp: string
  screenshot?: string
}

let store: Store<StoreSchema> | null = null

export function initStore(): void {
  store = new Store<StoreSchema>({
    name: 'xueba-tars-config',
    defaults: {
      settings: {
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
      },
      tasks: [],
      windowState: {
        width: 1200,
        height: 800,
        isMaximized: false
      }
    }
  })
  logger.info('Store 初始化完成，配置路径:', store.path)
}

export function getStore(): Store<StoreSchema> {
  if (!store) {
    initStore()
  }
  return store!
}
