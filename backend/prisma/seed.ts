import { PrismaClient, StaffRole, type ProductType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const hash = (password: string) => bcrypt.hash(password, 12)

// Users to create after cleanup (email = role@allotogo.test, password = RoleAlloTogo2026!, mustChangePassword=false)
const NEW_USERS = [
  { role: 'COMMERCIAL', email: 'commercial@allotogo.test', name: 'Agent Commercial', password: 'CommercialAlloTogo2026!' },
  { role: 'ADMIN', email: 'admin1@allotogo.test', name: 'Admin 1', password: 'Admin1AlloTogo2026!' },
  { role: 'ADMIN', email: 'admin2@allotogo.test', name: 'Admin 2', password: 'Admin2AlloTogo2026!' },
  { role: 'ADMIN', email: 'admin3@allotogo.test', name: 'Admin 3', password: 'Admin3AlloTogo2026!' },
  { role: 'ADMIN', email: 'admin4@allotogo.test', name: 'Admin 4', password: 'Admin4AlloTogo2026!' },
  { role: 'ADMIN', email: 'admin5@allotogo.test', name: 'Admin 5', password: 'Admin5AlloTogo2026!' },
  { role: 'TECHNICIAN', email: 'technicien1@allotogo.test', name: 'Technicien 1', password: 'Technicien1AlloTogo2026!' },
  { role: 'TECHNICIAN', email: 'technicien2@allotogo.test', name: 'Technicien 2', password: 'Technicien2AlloTogo2026!' },
  { role: 'TECHNICIAN', email: 'technicien3@allotogo.test', name: 'Technicien 3', password: 'Technicien3AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur1@allotogo.test', name: 'Livreur 1', password: 'Livreur1AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur2@allotogo.test', name: 'Livreur 2', password: 'Livreur2AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur3@allotogo.test', name: 'Livreur 3', password: 'Livreur3AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur4@allotogo.test', name: 'Livreur 4', password: 'Livreur4AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur5@allotogo.test', name: 'Livreur 5', password: 'Livreur5AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur6@allotogo.test', name: 'Livreur 6', password: 'Livreur6AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur7@allotogo.test', name: 'Livreur 7', password: 'Livreur7AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur8@allotogo.test', name: 'Livreur 8', password: 'Livreur8AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur9@allotogo.test', name: 'Livreur 9', password: 'Livreur9AlloTogo2026!' },
  { role: 'DELIVERY', email: 'livreur10@allotogo.test', name: 'Livreur 10', password: 'Livreur10AlloTogo2026!' },
]

async function deleteAllUsersExceptDirector() {
  const allUsers = await prisma.user.findMany()
  for (const user of allUsers) {
    if (user.email !== 'directeur@allotogo.test') {
      await prisma.user.delete({ where: { id: user.id } })
    }
  }
}

async function userExists(email: string) {
  const existing = await prisma.user.findFirst({ where: { email } })
  return !!existing
}

async function createNewUsers() {
  for (const userData of NEW_USERS) {
    if (userData.email === 'directeur@allotogo.test') continue

    // Skip if user already exists (idempotent re-runs)
    if (await userExists(userData.email)) {
      console.log(`User ${userData.email} already exists, skipping creation.`)
      continue
    }

    const [firstName, ...lastNameParts] = userData.name.split(' ')
    const passwordHash = await hash(userData.password)
    const lastName = lastNameParts.join(' ') || null
    await prisma.user.create({
      data: {
        email: userData.email,
        passwordHash,
        mustChangePassword: false,
        role: userData.role as StaffRole,
        active: true,
        firstName,
        lastName,
        name: userData.name,
      },
    })
  }
}

// Execute cleanup and user creation at seed start
await deleteAllUsersExceptDirector()
await createNewUsers()

async function main() {
  // Execute user cleanup and creation
  await deleteAllUsersExceptDirector()
  await createNewUsers()
  console.log('Seed completed')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
