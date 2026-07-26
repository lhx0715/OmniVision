/**
 * 用户认证路由
 * POST /api/auth/register — 注册
 * POST /api/auth/login    — 登录
 * GET  /api/auth/me       — 获取当前用户信息
 */
import { Router, type Request, type Response } from 'express'
import { registerUser, loginUser, getUserById, extractUserId } from '../services/authService.js'

const router = Router()

/**
 * POST /api/auth/register
 * Body: { email, password, displayName? }
 */
router.post('/register', (req: Request, res: Response): void => {
  const { email, password, displayName } = req.body ?? {}

  if (!email || typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ success: false, error: '邮箱不能为空' })
    return
  }
  if (!password || typeof password !== 'string') {
    res.status(400).json({ success: false, error: '密码不能为空' })
    return
  }

  // 简单邮箱格式校验
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, error: '邮箱格式不正确' })
    return
  }

  try {
    const { user, token } = registerUser(email, password, displayName)
    res.json({ success: true, user, token })
  } catch (err) {
    const message = (err as Error).message
    const status = message.includes('已注册') ? 409 : 400
    res.status(status).json({ success: false, error: message })
  }
})

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body ?? {}

  if (!email || !password) {
    res.status(400).json({ success: false, error: '邮箱和密码不能为空' })
    return
  }

  try {
    const { user, token } = loginUser(email, password)
    res.json({ success: true, user, token })
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message })
  }
})

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>
 */
router.get('/me', (req: Request, res: Response): void => {
  const userId = extractUserId(req.headers.authorization)

  if (!userId) {
    res.status(401).json({ success: false, error: '未登录' })
    return
  }

  const user = getUserById(userId)
  if (!user) {
    res.status(401).json({ success: false, error: '用户不存在' })
    return
  }

  res.json({ success: true, user })
})

export default router
