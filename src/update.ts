import { Env } from '.'

const CACHE_TIMEOUT = 300e3 // 5 min
const CACHE_CHUNK = 26214400
const CACHE_KEY_T = 'time'
const CACHE_KEY_V = 'version'
const CACHE_KEY_C = 'content'
const CACHE_KEY_S = 'sign'

export enum UpdateApiRetcode {
  UNKNOWN = -1,
  SUCC = 0,
  NO_DATA = 1
}

export interface UpdateApiResponse {
  code: UpdateApiRetcode
  msg: string
  data?: { pathname: string } | UpdateContent
}

export interface UpdateContent {
  v: number
  c?: string
  s?: string
}

export default class Update {
  env: Env | null

  constructor() {
    this.env = null
  }

  private concatBuffer(buf1: ArrayBuffer, buf2: ArrayBuffer): ArrayBuffer {
    const tmp = new Uint8Array(buf1.byteLength + buf2.byteLength)
    tmp.set(new Uint8Array(buf1), 0)
    tmp.set(new Uint8Array(buf2), buf1.byteLength)
    return tmp.buffer
  }

  private async putString(kv: KVNamespace, key: string, value: string): Promise<void> {
    await this.clearString(kv, key)

    const chunks = Math.ceil(value.length / CACHE_CHUNK)
    await kv.put(`${key}_s`, chunks.toString())

    for (let i = 0; i < chunks; i++) await kv.put(`${key}_c${i}`, value.slice(i * CACHE_CHUNK, (i + 1) * CACHE_CHUNK))
  }

  private async getString(kv: KVNamespace, key: string): Promise<string | null> {
    const chunks = Number(await kv.get(`${key}_s`, 'text'))

    let buf = ''
    for (let i = 0; i < chunks; i++) {
      const chunk = await kv.get(`${key}_c${i}`, 'text')
      if (chunk == null) return null
      buf += chunk
    }

    return buf
  }

  private async clearString(kv: KVNamespace, key: string): Promise<void> {
    const chunks = Number(await kv.get(`${key}_s`, 'text'))
    if (chunks <= 0) return

    for (let i = 0; i < chunks; i++) await kv.delete(`${key}_c${i}`)

    await kv.delete(`${key}_s`)
  }

  private async saveToCache(content: UpdateContent): Promise<void> {
    const { env } = this
    if (env == null) return

    const { Cache } = env

    const { v, c, s } = content
    if (v == null) return

    await Cache.put(CACHE_KEY_T, Date.now().toString())
    await Cache.put(CACHE_KEY_V, v.toString())

    if (c == null || s == null) return

    await this.putString(Cache, CACHE_KEY_C, c)
    await this.putString(Cache, CACHE_KEY_S, s)
  }

  private async fetch(): Promise<UpdateContent | null> {
    const { env } = this
    if (env == null) return null

    const { HOST_URL } = env

    const rsp = await fetch(`${HOST_URL}/get`)
    if (rsp.status !== 200) return null

    const { code, msg, data } = await rsp.json()
    if (code !== UpdateApiRetcode.SUCC || data == null) throw new Error(msg)

    const { v, c, s } = <UpdateContent>data
    if (v == null || c == null || s == null) throw new Error('Invalid data')

    await this.saveToCache(<UpdateContent>data)
    return <UpdateContent>data
  }

  private async fetchVersion(): Promise<number | null> {
    const { env } = this
    if (env == null) return null

    const { HOST_URL } = env

    const rsp = await fetch(`${HOST_URL}/version`)
    if (rsp.status !== 200) return null

    const { code, msg, data } = await rsp.json()
    if (code !== UpdateApiRetcode.SUCC || data == null) throw new Error(msg)

    const { v } = <UpdateContent>data
    if (v == null) throw new Error('Invalid data')

    await this.saveToCache(<UpdateContent>data)
    return v
  }

  setEnv(env: Env) {
    if (this.env === env) return
    this.env = env
  }

  async getVersion(): Promise<number | null> {
    const { env } = this

    let content: UpdateContent | null
    if (env == null) {
      content = await this.fetch()
      if (content == null) return null
      return content.v
    }

    const { Cache } = env

    const cacheTime = Number(await Cache.get(CACHE_KEY_T, 'text'))
    const cacheVersion = Number(await Cache.get(CACHE_KEY_V, 'text'))
    const cacheContent = await this.getString(Cache, CACHE_KEY_C)
    const cacheSign = await this.getString(Cache, CACHE_KEY_S)

    if (
      cacheContent != null &&
      cacheSign != null &&
      (Date.now() - cacheTime < CACHE_TIMEOUT || await this.fetchVersion() === cacheVersion)
    ) return cacheVersion

    content = await this.fetch()
    if (content == null) return null
    return content.v
  }

  async getContent(): Promise<UpdateContent | null> {
    const { env } = this

    if (env == null) return this.fetch()

    const { Cache } = env

    const cacheTime = Number(await Cache.get(CACHE_KEY_T, 'text'))
    const cacheVersion = Number(await Cache.get(CACHE_KEY_V, 'text'))
    const cacheContent = await this.getString(Cache, CACHE_KEY_C)
    const cacheSign = await this.getString(Cache, CACHE_KEY_S)

    if (
      cacheContent != null &&
      cacheSign != null &&
      (Date.now() - cacheTime < CACHE_TIMEOUT || await this.fetchVersion() === cacheVersion)
    ) {
      return {
        v: cacheVersion,
        c: cacheContent,
        s: cacheSign
      }
    }

    return this.fetch()
  }
}