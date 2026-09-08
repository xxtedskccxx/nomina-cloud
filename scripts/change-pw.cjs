const { resolve } = require('path');
const { auth } = require(resolve(__dirname, '../apps/api/dist/auth/auth.js'));
const { prisma } = require(resolve(__dirname, '../packages/database/dist/index.js'));

async function change() {
  const user = await prisma.user.findFirst({ where: { email: 'empleado@test.com' } });
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }
  
  // Try setPassword with 12345678
  try {
    await auth.api.setPassword({
      body: {
        userId: user.id,
        newPassword: '12345678'
      }
    });
    console.log('PASSWORD_12345678_SUCCESS');
  } catch (e) {
    console.error('setPassword error:', e);
  }
  process.exit(0);
}
change();
