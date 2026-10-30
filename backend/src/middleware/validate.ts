import type { NextFunction, Request, Response } from 'express'
import { ZodError, type ZodTypeAny } from 'zod'
import { badRequest } from '../lib/errors.js'

type Schemas = {
  body?: ZodTypeAny
  query?: ZodTypeAny
  params?: ZodTypeAny
}

export const validate = (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body)
    if (schemas.query) req.query = schemas.query.parse(req.query) as Request['query']
    if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params']
    return next()
  } catch (error) {
    if (error instanceof ZodError) {
      return next(
        badRequest(
          'Données invalides.',
          error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
        ),
      )
    }
    return next(error)
  }
}
