import type { Role } from '@payroll/contracts'

export interface SeedUserIdentity {
  email: string
  name: string
  password: string
  username: string
  role: Role
}

export interface SeedUser {
  id: string
  email: string
  name: string
  username: string | null
  role: string | null
}

interface SeedDatabase {
  findUserByEmail(email: string): Promise<SeedUser | null>
  updateUser(
    id: string,
    data: {
      name: string
      username: string
      displayUsername: string
      role: Role
    },
  ): Promise<SeedUser>
}

interface SeedAuthApi {
  createUser(identity: SeedUserIdentity): Promise<SeedUser>
}

export interface SeedDependencies {
  database: SeedDatabase
  authApi: SeedAuthApi
}

export async function ensureDevelopmentUser(
  dependencies: SeedDependencies,
  identity: SeedUserIdentity,
): Promise<SeedUser> {
  const existingUser = await dependencies.database.findUserByEmail(identity.email)

  if (existingUser) {
    return dependencies.database.updateUser(existingUser.id, {
      name: identity.name,
      username: identity.username,
      displayUsername: identity.username,
      role: identity.role,
    })
  }

  return dependencies.authApi.createUser(identity)
}
