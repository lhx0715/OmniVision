/**
 * 探索图谱 store（PRD-02）
 *
 * 管理会话状态、增量并图、回溯步数。
 * 与 omnivision store 隔离，不复用其状态。
 */
import { create } from 'zustand'
import { authFetch } from './auth'

// ===== 类型 =====

export interface ExpNode {
  id: string
  label: string
  entityType: string | null
  createdByStep: number
  x: number | null
  y: number | null
  meta: string | null
}

export interface ExpEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relation: string
  createdByStep: number
}

export interface ExpStep {
  id: string
  stepIndex: number
  targetNodeId: string | null
  targetLabel: string | null
  question: string
  answerSummary: string | null
  addedNodeIds: string[]
  addedEdgeIds: string[]
  sources: { title: string; url: string }[]
  createdAt: string
}

export interface ExpSession {
  id: string
  title: string
  seedLabel: string
  seedEntityType: string | null
  seedFrom: string | null
  status: 'active' | 'archived'
  stepCount: number
  nodeCount: number
  createdAt: string
  updatedAt: string
}

type AskStage = 'planning' | 'searching' | 'extracting' | 'merging' | 'done' | null

interface ExploreStore {
  // 会话列表
  sessions: ExpSession[]
  sessionsLoading: boolean

  // 当前会话
  currentSession: ExpSession | null
  nodes: ExpNode[]
  edges: ExpEdge[]
  steps: ExpStep[]

  // 交互状态
  selectedNodeId: string | null
  backtrackStep: number | null // null = 显示全部；数字 = 只显示 <= 该步
  askStage: AskStage
  askLoading: boolean
  lastAnswerSummary: string | null
  lastSources: { title: string; url: string }[]
  error: string | null

  // Actions
  loadSessions: () => Promise<void>
  createSession: (opts: { title?: string; seedLabel: string; seedEntityType?: string | null; seedFrom?: string }) => Promise<ExpSession | null>
  loadSession: (sessionId: string) => Promise<void>
  updateSession: (sessionId: string, opts: { title?: string; status?: 'active' | 'archived' }) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  deleteStep: (stepIndex: number) => Promise<void>

  setSelectedNode: (nodeId: string | null) => void
  setBacktrackStep: (step: number | null) => void
  setAskStage: (stage: AskStage) => void
  setError: (err: string | null) => void
  reset: () => void

  // SSE 追问（增量并图）
  askRelation: (sessionId: string, targetNodeId: string, question: string) => Promise<void>

  // 增量并图（SSE 事件回调用）
  addNode: (node: ExpNode) => void
  addEdge: (edge: ExpEdge) => void
}

export const useExploreStore = create<ExploreStore>((set, get) => ({
  sessions: [],
  sessionsLoading: false,
  currentSession: null,
  nodes: [],
  edges: [],
  steps: [],
  selectedNodeId: null,
  backtrackStep: null,
  askStage: null,
  askLoading: false,
  lastAnswerSummary: null,
  lastSources: [],
  error: null,

  loadSessions: async () => {
    set({ sessionsLoading: true, error: null })
    try {
      const res = await authFetch('/api/explore/sessions')
      if (res.ok) {
        const data = await res.json()
        set({ sessions: data.sessions || [], sessionsLoading: false })
      } else {
        set({ sessionsLoading: false, error: '加载会话列表失败' })
      }
    } catch {
      set({ sessionsLoading: false, error: '网络异常' })
    }
  },

  createSession: async (opts) => {
    try {
      const res = await authFetch('/api/explore/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      if (res.ok) {
        const data = await res.json()
        const session = data.session as ExpSession
        set((s) => ({ sessions: [session, ...s.sessions] }))
        return session
      }
      set({ error: '创建会话失败' })
      return null
    } catch {
      set({ error: '网络异常' })
      return null
    }
  },

  loadSession: async (sessionId) => {
    set({ error: null })
    try {
      const res = await authFetch(`/api/explore/sessions/${sessionId}`)
      if (res.ok) {
        const data = await res.json()
        set({
          currentSession: data.session,
          nodes: data.nodes || [],
          edges: data.edges || [],
          steps: data.steps || [],
          selectedNodeId: null,
          backtrackStep: null,
          lastAnswerSummary: null,
          lastSources: [],
        })
      } else {
        set({ error: '加载会话失败' })
      }
    } catch {
      set({ error: '网络异常' })
    }
  },

  updateSession: async (sessionId, opts) => {
    try {
      const res = await authFetch(`/api/explore/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      if (res.ok) {
        // 更新本地状态
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, ...opts } : sess,
          ),
          currentSession: s.currentSession?.id === sessionId
            ? { ...s.currentSession, ...opts }
            : s.currentSession,
        }))
      }
    } catch {
      set({ error: '网络异常' })
    }
  },

  deleteSession: async (sessionId) => {
    try {
      const res = await authFetch(`/api/explore/sessions/${sessionId}`, { method: 'DELETE' })
      if (res.ok) {
        set((s) => ({
          sessions: s.sessions.filter((sess) => sess.id !== sessionId),
          currentSession: s.currentSession?.id === sessionId ? null : s.currentSession,
        }))
      }
    } catch {
      set({ error: '网络异常' })
    }
  },

  deleteStep: async (stepIndex) => {
    const session = get().currentSession
    if (!session) return
    try {
      const res = await authFetch(`/api/explore/sessions/${session.id}/steps/${stepIndex}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const data = await res.json()
        set({
          nodes: data.nodes || [],
          edges: data.edges || [],
          steps: data.steps || [],
          currentSession: data.session,
          backtrackStep: null,
        })
      }
    } catch {
      set({ error: '网络异常' })
    }
  },

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setBacktrackStep: (step) => set({ backtrackStep: step }),
  setAskStage: (stage) => set({ askStage: stage }),
  setError: (err) => set({ error: err }),

  reset: () =>
    set({
      currentSession: null,
      nodes: [],
      edges: [],
      steps: [],
      selectedNodeId: null,
      backtrackStep: null,
      askStage: null,
      askLoading: false,
      lastAnswerSummary: null,
      lastSources: [],
      error: null,
    }),

  addNode: (node) =>
    set((s) => {
      if (s.nodes.some((n) => n.id === node.id)) return s
      return { nodes: [...s.nodes, node] }
    }),

  addEdge: (edge) =>
    set((s) => {
      if (s.edges.some((e) => e.id === edge.id)) return s
      return { edges: [...s.edges, edge] }
    }),

  askRelation: async (sessionId, targetNodeId, question) => {
    set({ askLoading: true, askStage: 'planning', error: null, lastAnswerSummary: null, lastSources: [] })

    try {
      const res = await authFetch(`/api/explore/sessions/${sessionId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetNodeId, question }),
      })

      if (!res.ok || !res.body) {
        set({ askLoading: false, askStage: null, error: '追问请求失败' })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // 按 SSE 双换行分割事件
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const evtStr of events) {
          const line = evtStr.trim()
          if (!line || line.startsWith(':')) continue // 注释/心跳
          if (!line.startsWith('data:')) continue
          const jsonStr = line.slice(5).trim()
          try {
            const evt = JSON.parse(jsonStr)
            handleSSEEvent(evt, set, get)
          } catch {
            /* 忽略解析失败 */
          }
        }
      }

      set({ askLoading: false })
    } catch (err) {
      set({ askLoading: false, askStage: null, error: (err as Error).message })
    }
  },
}))

// ===== SSE 事件处理 =====

function handleSSEEvent(
  evt: any,
  set: (fn: (s: ExploreStore) => Partial<ExploreStore>) => void,
  get: () => ExploreStore,
) {
  // 阶段事件
  if (evt.stage) {
    set(() => ({ askStage: evt.stage as AskStage }))
    return
  }

  // 新节点
  if (evt.newNode) {
    const n = evt.newNode
    const node: ExpNode = {
      id: n.id,
      label: n.label,
      entityType: n.entityType,
      createdByStep: n.createdByStep ?? get().steps.length + 1,
      x: null,
      y: null,
      meta: null,
    }
    get().addNode(node)
    return
  }

  // 新边
  if (evt.newEdge) {
    const e = evt.newEdge
    const edge: ExpEdge = {
      id: e.id,
      fromNodeId: e.fromId,
      toNodeId: e.toId,
      relation: e.relation,
      createdByStep: get().steps.length + 1,
    }
    get().addEdge(edge)
    return
  }

  // step 摘要 + 来源
  if (evt.stepSummary !== undefined) {
    set(() => ({
      lastAnswerSummary: evt.stepSummary,
      lastSources: evt.sources || [],
    }))
    return
  }

  // 完成事件
  if (evt.done) {
    // 重新加载会话以获取最新 steps 列表 + 计数
    const session = get().currentSession
    if (session) {
      get().loadSession(session.id)
    }
    set(() => ({ askStage: 'done', askLoading: false }))
    return
  }

  // 错误
  if (evt.error) {
    set(() => ({ error: evt.message, askStage: null, askLoading: false }))
    return
  }
}
