// src/lib/dbConnect.ts
import mongoose from 'mongoose'

// Cache the connection so we don't reconnect on every API call
interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var _mongoose: MongooseCache | undefined
}

const cached: MongooseCache = global._mongoose ?? { conn: null, promise: null }
global._mongoose = cached

export default async function dbConnect(): Promise<typeof mongoose> {
  // Already connected? Return immediately
  if (cached.conn) return cached.conn

  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('❌ MONGODB_URI missing from .env.local')

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}