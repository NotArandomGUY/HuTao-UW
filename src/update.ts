import { Env } from '.'
import { arrayBufferToBase64, base64ToArrayBuffer } from './utils/base64'

const CACHE_TIMEOUT = 300e3 // 5 min
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

  private async saveToCache(content: UpdateContent): Promise<void> {
    const { env } = this
    if (env == null) return

    const { Cache } = env

    const { v, c, s } = content
    if (v == null || c == null || s == null) return

    await Cache.put(CACHE_KEY_T, Date.now().toString())
    await Cache.put(CACHE_KEY_V, v.toString())
    await Cache.put(CACHE_KEY_C, base64ToArrayBuffer(c))
    await Cache.put(CACHE_KEY_S, base64ToArrayBuffer(s))
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
    const cacheContent = await Cache.get(CACHE_KEY_C, 'arrayBuffer')
    const cacheSign = await Cache.get(CACHE_KEY_S, 'arrayBuffer')

    if (Date.now() - cacheTime < CACHE_TIMEOUT && cacheContent != null && cacheSign != null) return cacheVersion

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
    const cacheContent = await Cache.get(CACHE_KEY_C, 'arrayBuffer')
    const cacheSign = await Cache.get(CACHE_KEY_S, 'arrayBuffer')

    if (Date.now() - cacheTime < CACHE_TIMEOUT && cacheContent != null && cacheSign != null) {
      return {
        v: cacheVersion,
        c: arrayBufferToBase64(cacheContent),
        s: arrayBufferToBase64(cacheSign)
      }
    }

    return this.fetch()
  }
}