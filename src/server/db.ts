import { prisma, uuid } from './prisma.js'

export { prisma, uuid }

export function getDb() {
  return prisma
}
