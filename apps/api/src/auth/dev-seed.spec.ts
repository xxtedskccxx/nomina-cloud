import { jest } from '@jest/globals'
import { UserRole } from '@payroll/contracts'
import { ensureDevelopmentUser } from './dev-seed.js'
import type { SeedUser, SeedUserIdentity } from './dev-seed.js'

const identity: SeedUserIdentity = {
  email: 'seed.admin@example.test',
  name: 'Seed Admin',
  password: 'development-only-password',
  username: 'seed_admin',
  role: UserRole.ADMIN,
}

const persistedUser: SeedUser = {
  id: 'seed-user-id',
  email: identity.email,
  name: identity.name,
  username: identity.username,
  role: identity.role,
}

describe('ensureDevelopmentUser', () => {
  it('creates a user through Better Auth when the email is absent', async () => {
    const findUserByEmail = jest.fn<() => Promise<SeedUser | null>>()
    const updateUser = jest.fn<() => Promise<SeedUser>>()
    const createUser = jest.fn<() => Promise<SeedUser>>()
    findUserByEmail.mockResolvedValue(null)
    createUser.mockResolvedValue(persistedUser)
    const database = {
      findUserByEmail,
      updateUser,
    }
    const authApi = {
      createUser,
    }

    const result = await ensureDevelopmentUser({ database, authApi }, identity)

    expect(result).toEqual(persistedUser)
    expect(authApi.createUser).toHaveBeenCalledWith(identity)
    expect(database.updateUser).not.toHaveBeenCalled()
  })

  it('updates the existing development user without creating a duplicate', async () => {
    const findUserByEmail = jest.fn<() => Promise<SeedUser | null>>()
    const updateUser = jest.fn<() => Promise<SeedUser>>()
    const createUser = jest.fn<() => Promise<SeedUser>>()
    findUserByEmail.mockResolvedValue({ ...persistedUser, role: UserRole.EMPLOYEE })
    updateUser.mockResolvedValue(persistedUser)
    const database = {
      findUserByEmail,
      updateUser,
    }
    const authApi = {
      createUser,
    }

    const result = await ensureDevelopmentUser({ database, authApi }, identity)

    expect(result).toEqual(persistedUser)
    expect(database.updateUser).toHaveBeenCalledWith(persistedUser.id, {
      name: identity.name,
      username: identity.username,
      displayUsername: identity.username,
      role: identity.role,
    })
    expect(authApi.createUser).not.toHaveBeenCalled()
  })
})
