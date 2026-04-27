import type { SearchResponse } from "../types/pinterest.js";

export interface CacheStore {
  get(key: string): Promise<SearchResponse | null>;
  set(key: string, value: SearchResponse, ttlSeconds: number): Promise<void>;
}

interface MemEntry {
  value: SearchResponse;
  expiresAt: number;
}

class MemoryCache implements CacheStore {
  private store = new Map<string, MemEntry>();

  async get(key: string): Promise<SearchResponse | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value;
  }

  async set(key: string, value: SearchResponse, ttlSeconds: number) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

class RedisCache implements CacheStore {
  private client: any;
  constructor(client: any) {
    this.client = client;
  }
  async get(key: string): Promise<SearchResponse | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SearchResponse;
    } catch {
      return null;
    }
  }
  async set(key: string, value: SearchResponse, ttlSeconds: number) {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }
}

let singleton: CacheStore | null = null;

export async function getCache(): Promise<CacheStore> {
  if (singleton) return singleton;
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const mod: any = await import("ioredis");
      const Redis: any = mod.default ?? mod.Redis ?? mod;
      const client = new Redis(url);
      singleton = new RedisCache(client);
      return singleton;
    } catch (err) {
      console.error(
        `[cache] Redis init failed, falling back to memory: ${(err as Error).message}`,
      );
    }
  }
  singleton = new MemoryCache();
  return singleton;
}

export function cacheKey(query: string, count: number, bookmark?: string) {
  return `search:${query}:${count}:${bookmark ?? "start"}`;
}
