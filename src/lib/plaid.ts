// Server-only Plaid client. Never import this from a 'use client' component —
// it reads the Plaid secret key, which must never reach the browser.
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const env = process.env.PLAID_ENV === 'production' ? 'production'
  : process.env.PLAID_ENV === 'development' ? 'development'
  : 'sandbox'

const configuration = new Configuration({
  basePath: PlaidEnvironments[env],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': env === 'production'
        ? process.env.PLAID_PRODUCTION_SECRET!
        : env === 'development'
        ? process.env.PLAID_DEVELOPMENT_SECRET!
        : process.env.PLAID_SANDBOX_SECRET!,
    },
  },
})

export const plaidClient = new PlaidApi(configuration)
