import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI?.trim() || "";
const isLocal = uri.includes("localhost") || uri.includes("127.0.0.1");

const options = {
  serverApi: { version: "1" as const, strict: false, deprecationErrors: false },
  serverSelectionTimeoutMS: 8_000,
  connectTimeoutMS: 8_000,
  socketTimeoutMS: 30_000,
  maxPoolSize: 10,
  maxIdleTimeMS: 30_000,
  retryReads: true,
  retryWrites: true,
  ...(isLocal ? {} : { tls: true }),
};

type MongoGlobals = typeof globalThis & {
  _mceMongoClient?: MongoClient;
  _mceMongoClientPromise?: Promise<MongoClient>;
};

const mongoGlobals = globalThis as MongoGlobals;

function isConnected(client: MongoClient | undefined): client is MongoClient {
  return Boolean(client?.topology?.isConnected());
}

async function connectWithRetry(): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not configured");

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const client = new MongoClient(uri, options);
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.close().catch(() => undefined);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function getMongoClient(): Promise<MongoClient> {
  if (isConnected(mongoGlobals._mceMongoClient)) {
    return Promise.resolve(mongoGlobals._mceMongoClient);
  }

  if (!mongoGlobals._mceMongoClientPromise) {
    mongoGlobals._mceMongoClientPromise = connectWithRetry()
      .then((client) => {
        mongoGlobals._mceMongoClient = client;
        return client;
      })
      .catch((error) => {
        // Do not leave a rejected promise cached. A later request can recover
        // from a transient Atlas/TLS/network failure on the same warm worker.
        mongoGlobals._mceMongoClientPromise = undefined;
        throw error;
      });
  }

  return mongoGlobals._mceMongoClientPromise;
}

/** Kept promise-like for existing modules while making connection failures retryable. */
const clientPromise = {
  then: (...args: Parameters<Promise<MongoClient>["then"]>) => getMongoClient().then(...args),
  catch: (...args: Parameters<Promise<MongoClient>["catch"]>) => getMongoClient().catch(...args),
  finally: (...args: Parameters<Promise<MongoClient>["finally"]>) => getMongoClient().finally(...args),
} as unknown as Promise<MongoClient>;

export default clientPromise;
