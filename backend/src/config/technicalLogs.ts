import { createReadStream, createWriteStream, mkdirSync } from "node:fs"
import { readdir, unlink } from "node:fs/promises"
import { createInterface } from "node:readline"
import { join, resolve } from "node:path"
import { Writable } from "node:stream"

export const technicalLogRetentionDays = 30
export const technicalLogDirectory = resolve(process.cwd(), "logs")

mkdirSync(technicalLogDirectory, { recursive: true })

export type TechnicalLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal"

export type TechnicalLogEntry = {
  id: string
  time: string
  level: TechnicalLogLevel
  message: string
  details: Record<string, unknown>
}

const levelLabels: Record<number, TechnicalLogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
}

const logFilePattern = /^application-(\d{4}-\d{2}-\d{2})\.log$/
const dateFromLog = (line: string) => {
  try {
    const record = JSON.parse(line) as { time?: unknown }
    const time = typeof record.time === "number" ? record.time : Date.now()
    return new Date(time).toISOString().slice(0, 10)
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

class DailyTechnicalLogStream extends Writable {
  private currentDate: string | null = null
  private destination: ReturnType<typeof createWriteStream> | null = null
  private reportedErrors = new WeakSet<Error>()

  constructor() {
    super({ decodeStrings: true })
  }

  private openDestination(date: string) {
    const destination = createWriteStream(
      join(technicalLogDirectory, `application-${date}.log`),
      {
        flags: "a",
        mode: 0o600,
      },
    )
    destination.on("error", (error) => {
      this.handleDestinationError(destination, error)
    })
    this.currentDate = date
    this.destination = destination
    return destination
  }

  private handleDestinationError(
    destination: ReturnType<typeof createWriteStream>,
    error: Error,
  ) {
    if (this.destination === destination) {
      this.destination = null
      this.currentDate = null
    }
    if (this.reportedErrors.has(error)) return
    this.reportedErrors.add(error)
    process.stderr.write(
      `Échec d’écriture du journal technique : ${error.message}\n`,
    )
  }

  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    const line = chunk.toString("utf8")
    const date = dateFromLog(line)
    const write = (destination: ReturnType<typeof createWriteStream>) => {
      try {
        destination.write(chunk, (error) => {
          if (error) this.handleDestinationError(destination, error)
          callback()
        })
      } catch (error) {
        this.handleDestinationError(
          destination,
          error instanceof Error ? error : new Error(String(error)),
        )
        callback()
      }
    }

    if (date === this.currentDate && this.destination) {
      write(this.destination)
      return
    }

    const previous = this.destination
    if (!previous) {
      write(this.openDestination(date))
      return
    }

    this.destination = null
    previous.end(() => write(this.openDestination(date)))
  }

  _final(callback: (error?: Error | null) => void) {
    if (!this.destination) {
      callback()
      return
    }
    this.destination.end(callback)
    this.destination = null
  }
}

export const technicalLogStream = new DailyTechnicalLogStream()

export const pruneTechnicalLogs = async (now = new Date()) => {
  const cutoff = new Date(now)
  cutoff.setUTCHours(0, 0, 0, 0)
  cutoff.setUTCDate(cutoff.getUTCDate() - (technicalLogRetentionDays - 1))
  const files = await readdir(technicalLogDirectory)
  await Promise.all(
    files.map(async (file) => {
      const match = logFilePattern.exec(file)
      if (!match || new Date(`${match[1]}T00:00:00.000Z`) >= cutoff) return
      await unlink(join(technicalLogDirectory, file))
    }),
  )
}

const parseTechnicalLog = (
  line: string,
  fileDate: string,
  lineNumber: number,
): TechnicalLogEntry | null => {
  try {
    const record = JSON.parse(line) as Record<string, unknown>
    const timestamp = typeof record.time === "number" ? record.time : NaN
    const level =
      typeof record.level === "number" ? levelLabels[record.level] : undefined
    if (!Number.isFinite(timestamp) || !level) return null

    const { time: _time, level: _level, msg, ...details } = record
    return {
      id: `${fileDate}:${lineNumber}`,
      time: new Date(timestamp).toISOString(),
      level,
      message: typeof msg === "string" ? msg : "Événement technique",
      details,
    }
  } catch {
    return null
  }
}

export const listTechnicalLogs = async (query: {
  from?: string
  to?: string
  level?: TechnicalLogLevel
  page: number
  pageSize: number
}) => {
  const files = (await readdir(technicalLogDirectory))
    .map((file) => ({ file, date: logFilePattern.exec(file)?.[1] }))
    .filter((entry): entry is { file: string date: string } =>
      Boolean(entry.date),
    )
    .sort((left, right) => right.date.localeCompare(left.date))

  const from = query.from
    ? new Date(query.from).getTime()
    : Number.NEGATIVE_INFINITY
  const to = query.to ? new Date(query.to).getTime() : Number.POSITIVE_INFINITY
  const requiredEntries = query.page * query.pageSize
  const latestEntries: TechnicalLogEntry[] = []
  let total = 0

  for (const { file, date } of files) {
    const input = createReadStream(join(technicalLogDirectory, file), {
      encoding: "utf8",
    })
    const lines = createInterface({ input, crlfDelay: Infinity })
    let lineNumber = 0
    for await (const line of lines) {
      lineNumber += 1
      const entry = parseTechnicalLog(line, date, lineNumber)
      if (!entry) continue
      const timestamp = new Date(entry.time).getTime()
      if (
        timestamp < from ||
        timestamp > to ||
        (query.level && entry.level !== query.level)
      )
        continue
      total += 1
      latestEntries.push(entry)
      latestEntries.sort((left, right) => right.time.localeCompare(left.time))
      if (latestEntries.length > requiredEntries) latestEntries.pop()
    }
  }

  const offset = (query.page - 1) * query.pageSize
  return {
    data: latestEntries.slice(offset, offset + query.pageSize),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}
