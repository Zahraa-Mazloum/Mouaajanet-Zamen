// src/lib/db.ts
import { MongoClient, ServerApiVersion } from 'mongodb'

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('❌ MONGODB_URI missing from .env.local')

const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
}

let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  // In dev: reuse the same connection across hot-reloads
  // Without this: every file save opens a NEW connection → DB crashes
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  // In production: one connection per serverless instance
  const client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export default clientPromise