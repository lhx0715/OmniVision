/**
 * 意图确认端点
 * POST /api/clarify
 * 返回澄清选项
 */
import { Router, type Request, type Response } from 'express'
import { getClarifyOptions } from '../services/intentRouter.js'

const router = Router()

/**
 * POST /api/clarify
 * 接收 { query }，返回 { options: ClarifyOption[] }
 */
router.post('/', (req: Request, res: Response): void => {
  const query = typeof req.body?.query === 'string' ? req.body.query : ''

  if (!query.trim()) {
    res.status(400).json({ success: false, error: 'query 不能为空' })
    return
  }

  const options = getClarifyOptions(query)
  res.status(200).json({ options })
})

export default router
