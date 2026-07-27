import { Router, type Request, type Response } from 'express'
import { registerUser, loginUser, getUserById, extractUserId } from '../services/authService.js'

const router = Router()

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password, displayName } = req.body ?? {}

  if (!email || typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ success: false, error: '邮箱不能为空' })
    return
  }
  if (!password || typeof password !== 'string') {
    res.status(400).json({ success: false, error: '密码不能为空' })
    return
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, error: '邮箱格式不正确' })
    return
  }

  try {
    const { user, token } = await registerUser(email, password, displayName)
    res.json({ success: true, user, token })
  } catch (err) {
    const message = (err as Error).message
    const status = message.includes('已注册') ? 409 : 400
    res.status(status).json({ success: false, error: message })
  }
})

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {}

  if (!email || !password) {
    res.status(400).json({ success: false, error: '邮箱和密码不能为空' })
    return
  }

  try {
    const { user, token } = await loginUser(email, password)
    res.json({ success: true, user, token })
  } catch (err) {
    res.status(401).json({ success: false, error: (err as Error).message })
  }
})

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const userId = extractUserId(req.headers.authorization)

  if (!userId) {
    res.status(401).json({ success: false, error: '未登录' })
    return
  }

  // 必须 try/catch：Express 4 不会自动捕获 async 路由的 rejection，
  // 否则 Prisma 连接错误会冒泡为 unhandledRejection 导致进程崩溃。
  try {
    const user = await getUserById(userId)
    if (!user) {
      res.status(401).json({ success: false, error: '用户不存在' })
      return
    }
    res.json({ success: true, user })
  } catch (err) {
    console.error('[auth/me] query failed:', (err as Error).message)
    res.status(500).json({ success: false, error: '数据库暂时不可用，请稍后重试' })
  }
})

export default router
