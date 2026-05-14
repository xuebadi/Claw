import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'

// Configure electron-log
const logPath = join(app.getPath('userData'), 'logs')

export function initLogger(): void {
  log.transports.file.resolvePathFn = () => join(logPath, 'main.log')
  log.transports.file.level = 'info'
  log.transports.console.level = 'debug'
  log.transports.file.maxSize = 10 * 1024 * 1024 // 10MB
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}'

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error)
  })

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection:', reason)
  })
}

export const logger = log
export default log
