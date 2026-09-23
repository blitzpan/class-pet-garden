import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let sqliteDb = null
let openedPath = null

export function getDbConfig() {
  return {
    driver: 'sqlite',
    path: process.env.SQLITE_PATH || path.resolve(__dirname, 'pet-garden.db'),
  }
}

function getDb() {
  const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, 'pet-garden.db')
  if (!sqliteDb || openedPath !== dbPath) {
    sqliteDb = new Database(dbPath)
    sqliteDb.pragma('journal_mode = WAL')
    sqliteDb.pragma('foreign_keys = ON')
    openedPath = dbPath
  }
  return sqliteDb
}

// 重置连接（测试时切换到独立的测试库文件）
export function resetDbConnection() {
  if (sqliteDb) {
    sqliteDb.close()
    sqliteDb = null
    openedPath = null
  }
}

// MySQL 的 INSERT IGNORE 在 SQLite 中对应 INSERT OR IGNORE
function normalizeSql(sql) {
  return sql.replace(/INSERT IGNORE/gi, 'INSERT OR IGNORE')
}

function createDbInterface() {
  const dbh = getDb()
  return {
    prepare(sql) {
      const normalized = normalizeSql(sql)
      const stmt = dbh.prepare(normalized)
      return {
        async get(...params) {
          return stmt.get(...params)
        },
        async all(...params) {
          return stmt.all(...params)
        },
        async run(...params) {
          const info = stmt.run(...params)
          return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
        },
      }
    },

    async exec(sql) {
      const statements = sql
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement && !statement.startsWith('--'))

      for (const statement of statements) {
        dbh.exec(statement)
      }
    },

    transaction(fn) {
      return async (...args) => {
        const alreadyIn = dbh.inTransaction
        if (!alreadyIn) dbh.prepare('BEGIN').run()
        try {
          const result = await fn(...args)
          if (!alreadyIn) dbh.prepare('COMMIT').run()
          return result
        } catch (error) {
          if (!alreadyIn) dbh.prepare('ROLLBACK').run()
          throw error
        }
      }
    },

    async close() {
      if (sqliteDb) {
        sqliteDb.close()
        sqliteDb = null
        openedPath = null
      }
    },
  }
}

export const db = createDbInterface()

export function getPool() {
  return getDb()
}

export async function initDb() {
  const dbh = getDb()
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      is_guest TINYINT NOT NULL DEFAULT 0,
      created_at BIGINT
    )`,

    `CREATE TABLE IF NOT EXISTS classes (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36),
      name VARCHAR(255) NOT NULL,
      created_at BIGINT,
      updated_at BIGINT
    )`,

    `CREATE TABLE IF NOT EXISTS students (
      id VARCHAR(36) PRIMARY KEY,
      class_id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      student_no VARCHAR(64),
      total_points INT NOT NULL DEFAULT 0,
      pet_type VARCHAR(64),
      pet_level INT NOT NULL DEFAULT 1,
      pet_exp INT NOT NULL DEFAULT 0,
      parent_password_hash VARCHAR(255),
      created_at BIGINT,
      CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id)
    )`,

    `CREATE TABLE IF NOT EXISTS badges (
      id VARCHAR(36) PRIMARY KEY,
      student_id VARCHAR(36) NOT NULL,
      pet_type VARCHAR(64) NOT NULL,
      earned_at BIGINT,
      CONSTRAINT fk_badges_student FOREIGN KEY (student_id) REFERENCES students(id)
    )`,

    `CREATE TABLE IF NOT EXISTS evaluation_rules (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      points INT NOT NULL,
      category VARCHAR(64) NOT NULL,
      is_custom TINYINT NOT NULL DEFAULT 0,
      user_id VARCHAR(36),
      created_at BIGINT
    )`,

    `CREATE TABLE IF NOT EXISTS evaluation_records (
      id VARCHAR(36) PRIMARY KEY,
      class_id VARCHAR(36) NOT NULL,
      student_id VARCHAR(36) NOT NULL,
      points INT NOT NULL,
      reason VARCHAR(512) NOT NULL,
      category VARCHAR(64) NOT NULL,
      timestamp BIGINT,
      CONSTRAINT fk_records_class FOREIGN KEY (class_id) REFERENCES classes(id),
      CONSTRAINT fk_records_student FOREIGN KEY (student_id) REFERENCES students(id)
    )`,

    `CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(128) PRIMARY KEY,
      value TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS class_tasks (
      id VARCHAR(36) PRIMARY KEY,
      class_id VARCHAR(36) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      rule_id VARCHAR(36) NOT NULL,
      deadline BIGINT,
      target_type VARCHAR(32) NOT NULL DEFAULT 'all',
      target_student_ids TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at BIGINT,
      updated_at BIGINT,
      CONSTRAINT fk_tasks_class FOREIGN KEY (class_id) REFERENCES classes(id),
      CONSTRAINT fk_tasks_rule FOREIGN KEY (rule_id) REFERENCES evaluation_rules(id)
    )`,

    `CREATE TABLE IF NOT EXISTS task_completions (
      id VARCHAR(36) PRIMARY KEY,
      task_id VARCHAR(36) NOT NULL,
      student_id VARCHAR(36) NOT NULL,
      evaluation_record_id VARCHAR(36),
      completed_at BIGINT,
      completed_by VARCHAR(36),
      UNIQUE (task_id, student_id),
      CONSTRAINT fk_completions_task FOREIGN KEY (task_id) REFERENCES class_tasks(id),
      CONSTRAINT fk_completions_student FOREIGN KEY (student_id) REFERENCES students(id),
      CONSTRAINT fk_completions_record FOREIGN KEY (evaluation_record_id) REFERENCES evaluation_records(id)
    )`,

    `CREATE TABLE IF NOT EXISTS class_vip_subscriptions (
      id VARCHAR(36) PRIMARY KEY,
      class_id VARCHAR(36) NOT NULL,
      plan VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      started_at BIGINT,
      expires_at BIGINT,
      created_at BIGINT,
      updated_at BIGINT,
      CONSTRAINT fk_vip_class FOREIGN KEY (class_id) REFERENCES classes(id)
    )`,

    `CREATE INDEX IF NOT EXISTS idx_classes_user_id ON classes(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rules_user_id ON evaluation_rules(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_records_class_id ON evaluation_records(class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_records_student_id ON evaluation_records(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_records_timestamp ON evaluation_records(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_class_id ON class_tasks(class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_completions_task_id ON task_completions(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_completions_student_id ON task_completions(student_id)`,
  ]

  for (const statement of statements) {
    await db.exec(statement)
  }

  // 迁移：家长密码字段（已存在则忽略）
  try {
    await db.exec('ALTER TABLE students ADD COLUMN parent_password_hash VARCHAR(255)')
  } catch (e) {
    // 字段已存在，忽略
  }

  // 迁移：班级邀请码（6 位纯数字，唯一；已存在则忽略）
  try {
    await db.exec('ALTER TABLE classes ADD COLUMN invite_code VARCHAR(12)')
  } catch (e) {
    // 字段已存在，忽略
  }
  // 为历史班级回填唯一邀请码
  const classesWithoutCode = await db.prepare('SELECT id FROM classes WHERE invite_code IS NULL OR invite_code = ?').all('')
  for (const row of classesWithoutCode) {
    let code
    do {
      code = String(Math.floor(100000 + Math.floor(Math.random() * 900000)))
    } while (await db.prepare('SELECT 1 FROM classes WHERE invite_code = ?').get(code))
    await db.prepare('UPDATE classes SET invite_code = ? WHERE id = ?').run(code, row.id)
  }

  await db.exec(`
    INSERT OR IGNORE INTO evaluation_rules (id, name, points, category, is_custom, created_at) VALUES
      ('rule_1', '课堂积极发言', 2, '学习', 0, 1704067200000),
      ('rule_2', '作业完成优秀', 3, '学习', 0, 1704067200000),
      ('rule_3', '帮助同学', 2, '行为', 0, 1704067200000),
      ('rule_4', '遵守纪律', 1, '行为', 0, 1704067200000),
      ('rule_5', '迟到', -1, '行为', 0, 1704067200000),
      ('rule_6', '未完成作业', -2, '学习', 0, 1704067200000),
      ('rule_7', '课堂捣乱', -3, '行为', 0, 1704067200000),
      ('rule_8', '主动打扫卫生', 2, '健康', 0, 1704067200000),
      ('rule_9', '坚持运动', 2, '健康', 0, 1704067200000),
      ('rule_10', '不讲卫生', -1, '健康', 0, 1704067200000),
      ('rule_11', '认真完成作业', 2, '家庭', 0, 1704067200000),
      ('rule_12', '书写工整坐姿端正', 1, '家庭', 0, 1704067200000),
      ('rule_13', '主动打扫整理房间', 2, '家庭', 0, 1704067200000),
      ('rule_14', '分担家务帮助父母', 2, '家庭', 0, 1704067200000),
      ('rule_15', '照顾弟妹友爱同伴', 2, '家庭', 0, 1704067200000),
      ('rule_16', '坚持运动锻炼身体', 1, '家庭', 0, 1704067200000),
      ('rule_17', '勇敢大方礼貌待人', 1, '家庭', 0, 1704067200000),
      ('rule_18', '早睡早起自己的事自己做', 1, '家庭', 0, 1704067200000),
      ('rule_19', '不挑食光盘行动', 1, '家庭', 0, 1704067200000),
      ('rule_20', '不写作业敷衍了事', -2, '家庭', 0, 1704067200000),
      ('rule_21', '不听话顶撞长辈', -2, '家庭', 0, 1704067200000),
      ('rule_22', '挑食不好好吃饭', -1, '家庭', 0, 1704067200000),
      ('rule_23', '沉迷手机电视超时', -1, '家庭', 0, 1704067200000),
      ('rule_24', '乱放东西不收拾', -1, '家庭', 0, 1704067200000),
      ('rule_25', '撒谎', -3, '家庭', 0, 1704067200000)
  `)
}

export { getPool as pool }
