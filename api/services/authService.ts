/**
 * 认证服务 — 注册/登录/JWT 签发与验证
 */
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb, uuid } from '../db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'omnivision-dev-secret-change-in-prod'
const JWT_EXPIRES_IN = '7d'

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

export interface JwtPayload {
  userId: string
  email: string
}

/**
 * 注册新用户
 * @returns AuthUser + token
 */
export function registerUser(email: string, password: string, displayName?: string): { user: AuthUser; token: string } {
  const db = getDb()
  const normalizedEmail = email.toLowerCase().trim()

  // 检查邮箱是否已注册
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)
  if (existing) {
    throw new Error('该邮箱已注册')
  }

  // 密码校验
  if (password.length < 6) {
    throw new Error('密码长度至少 6 位')
  }

  const id = uuid()
  const passwordHash = bcrypt.hashSync(password, 10)

  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
  ).run(id, normalizedEmail, passwordHash, displayName?.trim() || null)

  const user: AuthUser = { id, email: normalizedEmail, displayName: displayName?.trim() || null }
  const token = signToken({ userId: id, email: normalizedEmail })

  return { user, token }
}

/**
 * 用户登录
 * @returns AuthUser + token
 */
export function loginUser(email: string, password: string): { user: AuthUser; token: string } {
  const db = getDb()
  const normalizedEmail = email.toLowerCase().trim()

  const row = db.prepare('SELECT id, email, password_hash, display_name FROM users WHERE email = ?').get(normalizedEmail) as
    | { id: string; email: string; password_hash: string; display_name: string | null }
    | undefined

  if (!row) {
    throw new Error('邮箱或密码错误')
  }

  const valid = bcrypt.compareSync(password, row.password_hash)
  if (!valid) {
    throw new Error('邮箱或密码错误')
  }

  const user: AuthUser = { id: row.id, email: row.email, displayName: row.display_name }
  const token = signToken({ userId: row.id, email: row.email })

  return { user, token }
}

/**
 * 根据 userId 获取用户信息
 */
export function getUserById(userId: string): AuthUser | null {
  const db = getDb()
  const row = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(userId) as
    | { id: string; email: string; display_name: string | null }
    | undefined

  if (!row) return null
  return { id: row.id, email: row.email, displayName: row.display_name }
}

/**
 * 签发 JWT
 */
function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/**
 * 验证 JWT 并返回 payload
 * @returns JwtPayload 或 null（无效/过期）
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    return { userId: decoded.userId, email: decoded.email }
  } catch {
    return null
  }
}

/**
 * 从请求头提取并验证 token
 * @returns userId 或 null
 */
export function extractUserId(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const payload = verifyToken(token)
  return payload?.userId ?? null
}
