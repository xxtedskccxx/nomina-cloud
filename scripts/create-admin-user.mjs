import net from 'node:net'

function ensureProxy() {
  const server = net.createServer(src => {
    const dst = net.connect(5433, '::1');
    src.pipe(dst);
    dst.pipe(src);
    src.on('error', () => {});
    dst.on('error', () => {});
  });
  return new Promise((resolve) => {
    server.listen(5433, '127.0.0.1', () => resolve(server));
    server.on('error', () => resolve(null));
  });
}

import { auth } from '../apps/api/dist/auth/auth.js'
import { prisma } from '../packages/database/dist/index.js'

async function createAdmin() {
  const proxyServer = await ensureProxy();
  const email = process.argv[2] || 'admin@nomina.com'
  const username = process.argv[3] || 'admin'
  const password = process.argv[4] || 'Admin1234!'
  const name = process.argv[5] || 'Administrador'

  console.log(`Creando/actualizando usuario ADMIN: ${email} (${username})...`)

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] }
  })

  if (existingUser) {
    console.log(`El usuario ya existe (ID: ${existingUser.id}). Actualizando a ADMIN...`)
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: 'ADMIN',
        name,
        username,
        displayUsername: username
      }
    })
  } else {
    const result = await auth.api.createUser({
      body: {
        email,
        name,
        password,
        role: 'ADMIN',
        data: {
          username,
          displayUsername: username
        }
      }
    })
    console.log(`Usuario creado exitosamente:`, result.user.email)
  }

  console.log('-------------------------------------------')
  console.log('CREDENTIALS_READY')
  console.log(`EMAIL=${email}`)
  console.log(`USERNAME=${username}`)
  console.log(`PASSWORD=${password}`)
  console.log('-------------------------------------------')
}

createAdmin().catch(console.error).finally(() => prisma.$disconnect())
