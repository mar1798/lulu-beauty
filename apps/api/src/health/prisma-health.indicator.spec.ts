import { HealthCheckError } from '@nestjs/terminus'
import { PrismaService } from '../prisma/prisma.service'
import { PrismaHealthIndicator } from './prisma-health.indicator'

describe('PrismaHealthIndicator', () => {
  const createIndicator = (queryRaw: jest.Mock): PrismaHealthIndicator => {
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService
    return new PrismaHealthIndicator(prisma)
  }

  it('reports up when the database responds', async () => {
    const indicator = createIndicator(jest.fn().mockResolvedValue([{ result: 1 }]))

    const result = await indicator.isHealthy('database')

    expect(result.database.status).toBe('up')
  })

  it('throws HealthCheckError when the database is unreachable', async () => {
    const indicator = createIndicator(jest.fn().mockRejectedValue(new Error('connection refused')))

    await expect(indicator.isHealthy('database')).rejects.toBeInstanceOf(HealthCheckError)
  })
})
