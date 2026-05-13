// src/lib/apiResponse.ts

import { NextResponse } from 'next/server'

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ApiSuccess<T> {
  success: true
  data: T
  meta?: PaginationMeta
}

export interface ApiError {
  success: false
  error: string
  code?: string          
  details?: unknown     
}


export function ok<T>(data: T, meta?: PaginationMeta, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data, meta }, { status })
}

export function created<T>(data: T) {
  return ok(data, undefined, 201)
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

export function badRequest(error: string, details?: unknown) {
  return NextResponse.json<ApiError>(
    { success: false, error, code: 'BAD_REQUEST', details: isDev() ? details : undefined },
    { status: 400 }
  )
}

export function unauthorized(error = 'You must be signed in') {
  return NextResponse.json<ApiError>(
    { success: false, error, code: 'UNAUTHORIZED' },
    { status: 401 }
  )
}

export function forbidden(error = 'You do not have permission to do this') {
  return NextResponse.json<ApiError>(
    { success: false, error, code: 'FORBIDDEN' },
    { status: 403 }
  )
}

export function notFound(resource = 'Resource') {
  return NextResponse.json<ApiError>(
    { success: false, error: `${resource} not found`, code: 'NOT_FOUND' },
    { status: 404 }
  )
}

export function conflict(error: string) {
  return NextResponse.json<ApiError>(
    { success: false, error, code: 'CONFLICT' },
    { status: 409 }
  )
}

export function serverError(error: unknown) {
  console.error('[API Error]', error)
  return NextResponse.json<ApiError>(
    {
      success: false,
      error: 'An unexpected error occurred',
      code: 'INTERNAL_SERVER_ERROR',
      details: isDev() ? String(error) : undefined,
    },
    { status: 500 }
  )
}

export function parsePagination(request: Request) {
  const url = new URL(request.url)
  const page  = Math.max(1, Number(url.searchParams.get('page')  ?? 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))
  const skip  = (page - 1) * limit
  return { page, limit, skip }
}

export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit)
  return { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
}

function isDev() {
  return process.env.NODE_ENV === 'development'
}