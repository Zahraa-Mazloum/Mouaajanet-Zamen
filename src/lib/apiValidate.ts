// src/lib/apiValidate.ts


import { NextResponse } from 'next/server'
import { ZodSchema } from 'zod'
import { badRequest } from './apiResponse'

export async function validateBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<T | NextResponse> {
  let raw: unknown

  try {
    raw = await request.json()
  } catch {
    return badRequest('Request body is not valid JSON')
  }

  const result = schema.safeParse(raw)

  if (!result.success) {
    const details = result.error.issues.map(e => ({
      field:   e.path.join('.'),
      message: e.message,
    }))

    return badRequest('Validation failed', details)
  }

  return result.data
}


export function validateQuery<T>(
  request: Request,
  schema: ZodSchema<T>
): T | NextResponse {
  const url = new URL(request.url)
  const raw = Object.fromEntries(url.searchParams.entries())

  const result = schema.safeParse(raw)

  if (!result.success) {
    const details = result.error.issues.map(e => ({
      field:   e.path.join('.'),
      message: e.message,
    }))
    return badRequest('Invalid query parameters', details)
  }

  return result.data
}