import "dotenv/config"
import { PrismaClient, StaffRole, type Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const hash = (password: string) => bcrypt.hash(password, 12)

type SeedUser = {
  role: StaffRole
  email: string
  name: string
  password: string
}

const DEMO_USERS: SeedUser[] = [
  {
    role: StaffRole.COMMERCIAL,
    email: "commercial@allotogo.test",
    name: "Agent Commercial",
    password: "CommercialAlloTogo2026!",
  },
  {
    role: StaffRole.ADMIN,
    email: "admin1@allotogo.test",
    name: "Admin 1",
    password: "Admin1AlloTogo2026!",
  },
  {
    role: StaffRole.ADMIN,
    email: "admin2@allotogo.test",
    name: "Admin 2",
    password: "Admin2AlloTogo2026!",
  },
  {
    role: StaffRole.ADMIN,
    email: "admin3@allotogo.test",
    name: "Admin 3",
    password: "Admin3AlloTogo2026!",
  },
  {
    role: StaffRole.ADMIN,
    email: "admin4@allotogo.test",
    name: "Admin 4",
    password: "Admin4AlloTogo2026!",
  },
  {
    role: StaffRole.ADMIN,
    email: "admin5@allotogo.test",
    name: "Admin 5",
    password: "Admin5AlloTogo2026!",
  },
  {
    role: StaffRole.TECHNICIAN,
    email: "technicien1@allotogo.test",
    name: "Technicien 1",
    password: "Technicien1AlloTogo2026!",
  },
  {
    role: StaffRole.TECHNICIAN,
    email: "technicien2@allotogo.test",
    name: "Technicien 2",
    password: "Technicien2AlloTogo2026!",
  },
  {
    role: StaffRole.TECHNICIAN,
    email: "technicien3@allotogo.test",
    name: "Technicien 3",
    password: "Technicien3AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur1@allotogo.test",
    name: "Livreur 1",
    password: "Livreur1AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur2@allotogo.test",
    name: "Livreur 2",
    password: "Livreur2AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur3@allotogo.test",
    name: "Livreur 3",
    password: "Livreur3AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur4@allotogo.test",
    name: "Livreur 4",
    password: "Livreur4AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur5@allotogo.test",
    name: "Livreur 5",
    password: "Livreur5AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur6@allotogo.test",
    name: "Livreur 6",
    password: "Livreur6AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur7@allotogo.test",
    name: "Livreur 7",
    password: "Livreur7AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur8@allotogo.test",
    name: "Livreur 8",
    password: "Livreur8AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur9@allotogo.test",
    name: "Livreur 9",
    password: "Livreur9AlloTogo2026!",
  },
  {
    role: StaffRole.DELIVERY,
    email: "livreur10@allotogo.test",
    name: "Livreur 10",
    password: "Livreur10AlloTogo2026!",
  },
]

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} est obligatoire pour le bootstrap des comptes.`)
  }
  return value
}

async function createUsers(users: SeedUser[]) {
  const data: Prisma.UserCreateManyInput[] = await Promise.all(
    users.map(async (userData) => {
      const [firstName, ...lastNameParts] = userData.name.split(" ")
      const passwordHash = await hash(userData.password)
      const lastName = lastNameParts.join(" ") || null
      return {
        email: userData.email.trim().toLowerCase(),
        passwordHash,
        mustChangePassword: false,
        role: userData.role,
        active: true,
        firstName,
        lastName,
        name: userData.name,
      }
    }),
  )
  const result = await prisma.user.createMany({ data, skipDuplicates: true })
  console.log(
    `Comptes créés : ${result.count} ; comptes déjà présents ignorés.`,
  )
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const bootstrapOnly = args.has("--bootstrap") || args.has("--accounts-only")
  const adminEmail = requiredEnv("SEED_ADMIN_EMAIL").toLowerCase()
  const itAdminEmail = requiredEnv("SEED_IT_ADMIN_EMAIL").toLowerCase()

  if (adminEmail === itAdminEmail) {
    throw new Error(
      "SEED_ADMIN_EMAIL et SEED_IT_ADMIN_EMAIL doivent être différents.",
    )
  }

  const adminAccounts = [
    {
      role: StaffRole.DIRECTOR,
      email: adminEmail,
      name: process.env.SEED_ADMIN_NAME?.trim() || "Directeur Allo Togo",
      password: requiredEnv("SEED_ADMIN_PASSWORD"),
    },
    {
      role: StaffRole.ADMIN,
      email: itAdminEmail,
      name: process.env.SEED_IT_ADMIN_NAME?.trim() || "Informaticien Allo Togo",
      password: requiredEnv("SEED_IT_ADMIN_PASSWORD"),
    },
  ]

  await createUsers(adminAccounts)
  if (
    !bootstrapOnly &&
    process.env.NODE_ENV !== "production" &&
    process.env.SEED_DEMO_STAFF !== "false"
  ) {
    await createUsers(DEMO_USERS)
  }
  console.log("Seed completed")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
