import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db.js'

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

export async function registerUser(email: string, password: string, displayName?: string): Promise<{ user: AuthUser; token: string }> {
  const normalizedEmail = email.toLowerCase().trim()

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    throw new Error('该邮箱已注册')
  }

  if (password.length < 6) {
    throw new Error('密码长度至少 6 位')
  }

  const passwordHash = bcrypt.hashSync(password, 10)

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      displayName: displayName?.trim() || null,
    },
  })

  const token = signToken({ userId: user.id, email: user.email })

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    token,
  }
}

export async function loginUser(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const normalizedEmail = email.toLowerCase().trim()

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (!user) {
    throw new Error('邮箱或密码错误')
  }

  const valid = bcrypt.compareSync(password, user.passwordHash)
  if (!valid) {
    throw new Error('邮箱或密码错误')
  }

  const token = signToken({ userId: user.id, email: user.email })

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    token,
  }
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  return { id: user.id, email: user.email, displayName: user.displayName }
}

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    return { userId: decoded.userId, email: decoded.email }
  } catch {
    return null
  }
}

export function extractUserId(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const payload = verifyToken(token)
  return payload?.userId ?? null
}
