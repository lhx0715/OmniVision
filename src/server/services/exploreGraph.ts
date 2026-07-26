/**
 * 探索图谱会话服务（PRD-02 FR-06/FR-07）
 *
 * 会话内 getOrCreate 节点/边（与收藏图谱 entities/relations 完全隔离），
 * 写 step 记录（回溯核心），增量并图。
 *
 * 所有操作带 session_id + user_id 双重隔离校验。
 */
import { getDb, uuid } from '../db.js'

// ===== 类型 =====

export interface ExplorationSession {
  id: string
  userId: string
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

export interface ExplorationNode {
  id: string
  sessionId: string
  label: string
  entityType: string | null
  createdByStep: number
  x: number | null
  y: number | null
  meta: string | null
  createdAt: string
}

export interface ExplorationEdge {
  id: string
  sessionId: string
  fromNodeId: string
  toNodeId: string
  relation: string
  createdByStep: number
  createdAt: string
}

export interface ExplorationStep {
  id: string
  sessionId: string
  stepIndex: number
  targetNodeId: string | null
  targetLabel: string | null
  question: string
  answerSummary: string | null
  addedNodeIds: string[] // 解析自 JSON
  addedEdgeIds: string[]
  sources: unknown[] // 解析自 JSON
  createdAt: string
}

// ===== 会话管理 =====

/**
 * 创建探索会话 + 种子节点（step 0）
 */
export function createSession(
  userId: string,
  opts: { title?: string; seedLabel: string; seedEntityType?: string | null; seedFrom?: string },
): ExplorationSession {
  const db = getDb()
  const sessionId = uuid()
  const title = opts.title?.trim() || `${opts.seedLabel}的探索`
  const seedFrom = opts.seedFrom || 'manual'

  db.transaction(() => {
    db.prepare(
      `INSERT INTO exploration_sessions (id, user_id, title, seed_label, seed_entity_type, seed_from, status, step_count, node_count)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 0, 1)`,
    ).run(sessionId, userId, title, opts.seedLabel, opts.seedEntityType ?? null, seedFrom)

    // 种子节点（step 0，居中）
    const nodeId = uuid()
    db.prepare(
      `INSERT INTO exploration_nodes (id, session_id, user_id, label, entity_type, created_by_step, x, y)
       VALUES (?, ?, ?, ?, ?, 0, 400, 300)`,
    ).run(nodeId, sessionId, userId, opts.seedLabel, opts.seedEntityType ?? null)
  })()

  return getSession(userId, sessionId)!
}

/**
 * 获取会话元信息
 */
export function getSession(userId: string, sessionId: string): ExplorationSession | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT id, user_id, title, seed_label, seed_entity_type, seed_from, status, step_count, node_count, created_at, updated_at
       FROM exploration_sessions WHERE id = ? AND user_id = ?`,
    )
    .get(sessionId, userId) as any
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    seedLabel: row.seed_label,
    seedEntityType: row.seed_entity_type,
    seedFrom: row.seed_from,
    status: row.status,
    stepCount: row.step_count,
    nodeCount: row.node_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 列出用户所有会话（图谱知识库文件夹视图）
 */
export function listSessions(userId: string): ExplorationSession[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, user_id, title, seed_label, seed_entity_type, seed_from, status, step_count, node_count, created_at, updated_at
       FROM exploration_sessions WHERE user_id = ? ORDER BY updated_at DESC`,
    )
    .all(userId) as any[]
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    seedLabel: row.seed_label,
    seedEntityType: row.seed_entity_type,
    seedFrom: row.seed_from,
    status: row.status,
    stepCount: row.step_count,
    nodeCount: row.node_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/**
 * 更新会话（改名 / 归档 / 重新激活）
 */
export function updateSession(
  userId: string,
  sessionId: string,
  opts: { title?: string; status?: 'active' | 'archived' },
): boolean {
  const db = getDb()
  const sets: string[] = []
  const params: any[] = []
  if (opts.title !== undefined) {
    sets.push('title = ?')
    params.push(opts.title.trim())
  }
  if (opts.status !== undefined) {
    sets.push('status = ?')
    params.push(opts.status)
  }
  if (sets.length === 0) return false
  sets.push("updated_at = datetime('now')")
  params.push(sessionId, userId)
  const result = db.prepare(`UPDATE exploration_sessions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...params)
  return result.changes > 0
}

/**
 * 删除会话（级联删节点/边/步）
 */
export function deleteSession(userId: string, sessionId: string): boolean {
  const db = getDb()
  const result = db
    .prepare('DELETE FROM exploration_sessions WHERE id = ? AND user_id = ?')
    .run(sessionId, userId)
  return result.changes > 0
}

// ===== 图谱数据查询 =====

/**
 * 获取会话完整图（nodes + edges + steps）
 */
export function getSessionGraph(userId: string, sessionId: string): {
  session: ExplorationSession | null
  nodes: ExplorationNode[]
  edges: ExplorationEdge[]
  steps: ExplorationStep[]
} {
  const session = getSession(userId, sessionId)
  if (!session) return { session: null, nodes: [], edges: [], steps: [] }

  const db = getDb()

  const nodeRows = db
    .prepare(
      `SELECT id, session_id, label, entity_type, created_by_step, x, y, meta, created_at
       FROM exploration_nodes WHERE session_id = ? AND user_id = ? ORDER BY created_by_step, created_at`,
    )
    .all(sessionId, userId) as any[]
  const nodes: ExplorationNode[] = nodeRows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    label: r.label,
    entityType: r.entity_type,
    createdByStep: r.created_by_step,
    x: r.x,
    y: r.y,
    meta: r.meta,
    createdAt: r.created_at,
  }))

  const edgeRows = db
    .prepare(
      `SELECT id, session_id, from_node_id, to_node_id, relation, created_by_step, created_at
       FROM exploration_edges WHERE session_id = ? AND user_id = ? ORDER BY created_by_step, created_at`,
    )
    .all(sessionId, userId) as any[]
  const edges: ExplorationEdge[] = edgeRows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    fromNodeId: r.from_node_id,
    toNodeId: r.to_node_id,
    relation: r.relation,
    createdByStep: r.created_by_step,
    createdAt: r.created_at,
  }))

  const stepRows = db
    .prepare(
      `SELECT id, session_id, step_index, target_node_id, target_label, question, answer_summary, added_node_ids, added_edge_ids, sources, created_at
       FROM exploration_steps WHERE session_id = ? AND user_id = ? ORDER BY step_index`,
    )
    .all(sessionId, userId) as any[]
  const steps: ExplorationStep[] = stepRows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    stepIndex: r.step_index,
    targetNodeId: r.target_node_id,
    targetLabel: r.target_label,
    question: r.question,
    answerSummary: r.answer_summary,
    addedNodeIds: safeParseArray(r.added_node_ids),
    addedEdgeIds: safeParseArray(r.added_edge_ids),
    sources: safeParseArray(r.sources),
    createdAt: r.created_at,
  }))

  return { session, nodes, edges, steps }
}

// ===== 会话内 getOrCreate（同名合并）=====

/**
 * 会话内 getOrCreate 节点。
 * 同名合并（UNIQUE(session_id, label)）。
 * @returns { id, isNew }
 */
export function getOrCreateNode(
  userId: string,
  sessionId: string,
  label: string,
  entityType: string | null,
  step: number,
): { id: string; isNew: boolean } {
  const db = getDb()
  const existing = db
    .prepare('SELECT id FROM exploration_nodes WHERE session_id = ? AND label = ?')
    .get(sessionId, label) as { id: string } | undefined
  if (existing) return { id: existing.id, isNew: false }

  const id = uuid()
  db.prepare(
    `INSERT INTO exploration_nodes (id, session_id, user_id, label, entity_type, created_by_step, x, y)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
  ).run(id, sessionId, userId, label, entityType, step)
  return { id, isNew: true }
}

/**
 * 会话内 getOrCreate 边。
 * 相同 from-to-relation 合并（UNIQUE 约束）。
 * @returns { id, isNew }
 */
export function getOrCreateEdge(
  userId: string,
  sessionId: string,
  fromNodeId: string,
  toNodeId: string,
  relation: string,
  step: number,
): { id: string; isNew: boolean } {
  const db = getDb()
  const existing = db
    .prepare(
      'SELECT id FROM exploration_edges WHERE session_id = ? AND from_node_id = ? AND to_node_id = ? AND relation = ?',
    )
    .get(sessionId, fromNodeId, toNodeId, relation) as { id: string } | undefined
  if (existing) return { id: existing.id, isNew: false }

  const id = uuid()
  db.prepare(
    `INSERT INTO exploration_edges (id, session_id, user_id, from_node_id, to_node_id, relation, created_by_step)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, sessionId, userId, fromNodeId, toNodeId, relation, step)
  return { id, isNew: true }
}

// ===== Step 记录 =====

/**
 * 写 step 记录 + 更新会话计数。
 * 在 relationDiscovery 完成后调用，事务保证一致性。
 */
export function writeStep(
  userId: string,
  sessionId: string,
  opts: {
    stepIndex: number
    targetNodeId: string | null
    targetLabel: string | null
    question: string
    answerSummary: string
    addedNodeIds: string[]
    addedEdgeIds: string[]
    sources: unknown[]
  },
): ExplorationStep {
  const db = getDb()
  const stepId = uuid()

  db.transaction(() => {
    db.prepare(
      `INSERT INTO exploration_steps (id, session_id, user_id, step_index, target_node_id, target_label, question, answer_summary, added_node_ids, added_edge_ids, sources)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      stepId,
      sessionId,
      userId,
      opts.stepIndex,
      opts.targetNodeId,
      opts.targetLabel,
      opts.question,
      opts.answerSummary,
      JSON.stringify(opts.addedNodeIds),
      JSON.stringify(opts.addedEdgeIds),
      JSON.stringify(opts.sources),
    )

    // 更新会话计数
    db.prepare(
      `UPDATE exploration_sessions SET step_count = ?, node_count = (SELECT COUNT(*) FROM exploration_nodes WHERE session_id = ?), updated_at = datetime('now') WHERE id = ?`,
    ).run(opts.stepIndex, sessionId, sessionId)
  })()

  return {
    id: stepId,
    sessionId,
    stepIndex: opts.stepIndex,
    targetNodeId: opts.targetNodeId,
    targetLabel: opts.targetLabel,
    question: opts.question,
    answerSummary: opts.answerSummary,
    addedNodeIds: opts.addedNodeIds,
    addedEdgeIds: opts.addedEdgeIds,
    sources: opts.sources,
    createdAt: new Date().toISOString(),
  }
}

/**
 * 回退删除第 k 步（级联删该步新增的节点/边 + step 记录）
 */
export function deleteStep(userId: string, sessionId: string, stepIndex: number): boolean {
  const db = getDb()
  const result = db.transaction(() => {
    // 删除该步新增的边
    db.prepare(
      'DELETE FROM exploration_edges WHERE session_id = ? AND created_by_step = ?',
    ).run(sessionId, stepIndex)
    // 删除该步新增的节点（但种子节点 step=0 不删）
    if (stepIndex > 0) {
      db.prepare(
        'DELETE FROM exploration_nodes WHERE session_id = ? AND created_by_step = ?',
      ).run(sessionId, stepIndex)
    }
    // 删除 step 记录
    const r = db
      .prepare('DELETE FROM exploration_steps WHERE session_id = ? AND step_index = ?')
      .run(sessionId, stepIndex)

    // 更新会话计数
    db.prepare(
      `UPDATE exploration_sessions SET step_count = (SELECT COALESCE(MAX(step_index), 0) FROM exploration_steps WHERE session_id = ?), node_count = (SELECT COUNT(*) FROM exploration_nodes WHERE session_id = ?), updated_at = datetime('now') WHERE id = ?`,
    ).run(sessionId, sessionId, sessionId)
    return r.changes > 0
  })()
  return result
}

// ===== 辅助 =====

function safeParseArray(json: string | null): any[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
