export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  MERCHANT_INVITE_CODE: string
}

export type Ctx = { Bindings: Env; Variables: { commit: string | null; merchantId: string | null } }
