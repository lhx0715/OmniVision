/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { prisma } from './db.js'
import authRoutes from './routes/auth.js'
import searchRoutes from './routes/search.js'
import clarifyRoutes from './routes/clarify.js'
import expandRoutes from './routes/expand.js'
import askRoutes from './routes/ask.js'
import compareRoutes from './routes/compare.js'
import libraryRoutes from './routes/library.js'
import graphRoutes from './routes/graph.js'
import exploreRoutes from './routes/explore.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()



const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/clarify', clarifyRoutes)
app.use('/api/expand', expandRoutes)
app.use('/api/ask', askRoutes)
app.use('/api/compare', compareRoutes)
app.use('/api/library', libraryRoutes)
app.use('/api/graph', graphRoutes)
app.use('/api/explore', exploreRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[ERROR]', error.stack || error.message)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
