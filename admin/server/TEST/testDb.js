import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, db, resetDbConnection } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = process.env.SQLITE_TEST_PATH || path.resolve(__dirname, '..', 'pet-garden.test.db')

const TABLES = [
  'task_completions',
  'class_tasks',
  'evaluation_records',
  'class_vip_subscriptions',
  'badges',
  'students',
  'classes',
  'evaluation_rules',
  'settings',
  'users',
]

export async function ensureTestDatabase() {
  // SQLite 使用独立的测试库文件
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH)
  }
  process.env.SQLITE_PATH = TEST_DB_PATH
  resetDbConnection()
}

export async function resetTestDb() {
  await db.exec('PRAGMA foreign_keys = OFF')
  for (const table of TABLES) {
    await db.prepare(`DELETE FROM ${table}`).run()
  }
  await db.exec('PRAGMA foreign_keys = ON')
}

let initialized = false

export async function setupTestDb() {
  if (!initialized) {
    await ensureTestDatabase()
    await initDb()
    initialized = true
  }
  await resetTestDb()
  return db
}
