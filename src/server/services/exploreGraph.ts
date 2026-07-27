import { prisma, uuid } from '../db.js'

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
  addedNodeIds: string[]
  addedEdgeIds: string[]
  sources: unknown[]
  createdAt: string
}

export async function createSession(
  userId: string,
  opts: { title?: string; seedLabel: string; seedEntityType?: string | null; seedFrom?: string },
): Promise<ExplorationSession> {
  const sessionId = uuid()
  const title = opts.title?.trim() || `${opts.seedLabel}的探索`
  const seedFrom = opts.seedFrom || 'manual'

  await prisma.$transaction([
    prisma.explorationSession.create({
      data: {
        id: sessionId,
        userId,
        title,
        seedLabel: opts.seedLabel,
        seedEntityType: opts.seedEntityType ?? null,
        seedFrom,
        status: 'active',
        stepCount: 0,
        nodeCount: 1,
      },
    }),
    prisma.explorationNode.create({
      data: {
        id: uuid(),
        sessionId,
        userId,
        label: opts.seedLabel,
        entityType: opts.seedEntityType ?? null,
        createdByStep: 0,
        x: 400,
        y: 300,
      },
    }),
  ])

  return (await getSession(userId, sessionId))!
}

export async function getSession(userId: string, sessionId: string): Promise<ExplorationSession | null> {
  const row = await prisma.explorationSession.findUnique({
    where: { id: sessionId, userId },
  })
  if (!row) return null
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    seedLabel: row.seedLabel,
    seedEntityType: row.seedEntityType,
    seedFrom: row.seedFrom,
    status: row.status as 'active' | 'archived',
    stepCount: row.stepCount,
    nodeCount: row.nodeCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listSessions(userId: string): Promise<ExplorationSession[]> {
  const rows = await prisma.explorationSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    title: row.title,
    seedLabel: row.seedLabel,
    seedEntityType: row.seedEntityType,
    seedFrom: row.seedFrom,
    status: row.status as 'active' | 'archived',
    stepCount: row.stepCount,
    nodeCount: row.nodeCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function updateSession(
  userId: string,
  sessionId: string,
  opts: { title?: string; status?: 'active' | 'archived' },
): Promise<boolean> {
  const data: Record<string, unknown> = {}
  if (opts.title !== undefined) data.title = opts.title.trim()
  if (opts.status !== undefined) data.status = opts.status
  data.updatedAt = new Date()

  if (Object.keys(data).length === 1) return false

  const result = await prisma.explorationSession.updateMany({
    where: { id: sessionId, userId },
    data,
  })
  return result.count > 0
}

export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await prisma.explorationSession.deleteMany({
    where: { id: sessionId, userId },
  })
  return result.count > 0
}

export async function getSessionGraph(userId: string, sessionId: string): Promise<{
  session: ExplorationSession | null
  nodes: ExplorationNode[]
  edges: ExplorationEdge[]
  steps: ExplorationStep[]
}> {
  const session = await getSession(userId, sessionId)
  if (!session) return { session: null, nodes: [], edges: [], steps: [] }

  const [nodes, edges, steps] = await Promise.all([
    prisma.explorationNode.findMany({
      where: { sessionId, userId },
      orderBy: [{ createdByStep: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.explorationEdge.findMany({
      where: { sessionId, userId },
      orderBy: [{ createdByStep: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.explorationStep.findMany({
      where: { sessionId, userId },
      orderBy: { stepIndex: 'asc' },
    }),
  ])

  return {
    session,
    nodes: nodes.map((n) => ({
      id: n.id,
      sessionId: n.sessionId,
      label: n.label,
      entityType: n.entityType,
      createdByStep: n.createdByStep,
      x: n.x ?? null,
      y: n.y ?? null,
      meta: n.meta ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      relation: e.relation,
      createdByStep: e.createdByStep,
      createdAt: e.createdAt.toISOString(),
    })),
    steps: steps.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      stepIndex: s.stepIndex,
      targetNodeId: s.targetNodeId ?? null,
      targetLabel: s.targetLabel ?? null,
      question: s.question,
      answerSummary: s.answerSummary ?? null,
      addedNodeIds: safeParseArray(s.addedNodeIds),
      addedEdgeIds: safeParseArray(s.addedEdgeIds),
      sources: safeParseArray(s.sources),
      createdAt: s.createdAt.toISOString(),
    })),
  }
}

export async function getOrCreateNode(
  userId: string,
  sessionId: string,
  label: string,
  entityType: string | null,
  step: number,
): Promise<{ id: string; isNew: boolean }> {
  const existing = await prisma.explorationNode.findUnique({
    where: { sessionId_label: { sessionId, label } },
  })
  if (existing) return { id: existing.id, isNew: false }

  const id = uuid()
  await prisma.explorationNode.create({
    data: {
      id,
      sessionId,
      userId,
      label,
      entityType,
      createdByStep: step,
    },
  })
  return { id, isNew: true }
}

export async function getOrCreateEdge(
  userId: string,
  sessionId: string,
  fromNodeId: string,
  toNodeId: string,
  relation: string,
  step: number,
): Promise<{ id: string; isNew: boolean }> {
  const existing = await prisma.explorationEdge.findUnique({
    where: { sessionId_fromNodeId_toNodeId_relation: { sessionId, fromNodeId, toNodeId, relation } },
  })
  if (existing) return { id: existing.id, isNew: false }

  const id = uuid()
  await prisma.explorationEdge.create({
    data: {
      id,
      sessionId,
      userId,
      fromNodeId,
      toNodeId,
      relation,
      createdByStep: step,
    },
  })
  return { id, isNew: true }
}

export async function writeStep(
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
): Promise<ExplorationStep> {
  const stepId = uuid()

  await prisma.$transaction([
    prisma.explorationStep.create({
      data: {
        id: stepId,
        sessionId,
        userId,
        stepIndex: opts.stepIndex,
        targetNodeId: opts.targetNodeId ?? null,
        targetLabel: opts.targetLabel ?? null,
        question: opts.question,
        answerSummary: opts.answerSummary,
        addedNodeIds: JSON.stringify(opts.addedNodeIds),
        addedEdgeIds: JSON.stringify(opts.addedEdgeIds),
        sources: JSON.stringify(opts.sources),
      },
    }),
    prisma.explorationSession.update({
      where: { id: sessionId },
      data: {
        stepCount: opts.stepIndex,
        updatedAt: new Date(),
      },
    }),
  ])

  const nodeCount = await prisma.explorationNode.count({ where: { sessionId } })
  await prisma.explorationSession.update({
    where: { id: sessionId },
    data: { nodeCount },
  })

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

export async function deleteStep(userId: string, sessionId: string, stepIndex: number): Promise<boolean> {
  await prisma.$transaction([
    prisma.explorationEdge.deleteMany({
      where: { sessionId, createdByStep: stepIndex },
    }),
    prisma.explorationNode.deleteMany({
      where: { sessionId, createdByStep: stepIndex },
    }),
    prisma.explorationStep.deleteMany({
      where: { sessionId, stepIndex },
    }),
  ])

  const [maxStep, nodeCount] = await Promise.all([
    prisma.explorationStep.aggregate({
      where: { sessionId },
      _max: { stepIndex: true },
    }),
    prisma.explorationNode.count({ where: { sessionId } }),
  ])

  await prisma.explorationSession.update({
    where: { id: sessionId },
    data: {
      stepCount: maxStep._max.stepIndex ?? 0,
      nodeCount,
      updatedAt: new Date(),
    },
  })

  return true
}

function safeParseArray(json: string | null | undefined): any[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
