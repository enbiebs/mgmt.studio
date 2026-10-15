// Server-only: who may add or change things on a client's tour.
import { requireClientAccess, type LimitName } from '@/lib/api-guard'

// Same rule as everything else that edits the tour: Tour edit access to the client AND not the
// artist's own login. Both checks are the database functions the row-level security uses.
export async function requireTourEditAccess(clientId: unknown, limit: LimitName = 'api') {
  return requireClientAccess(clientId, { section: 'tour', edit: true, limit, managementSide: true })
}

// Booking offers and show fees are Deals & fees, not Tour: same shape, a different page.
export async function requireDealsEditAccess(clientId: unknown, limit: LimitName = 'api') {
  return requireClientAccess(clientId, { section: 'deals', edit: true, limit, managementSide: true })
}
