import type { LegalData, Contract } from '@/types'

let _id = 1
function contract(c: Omit<Contract, 'id'>): Contract {
  return { id: 'ctr-' + (_id++), ...c }
}

export const MASCOLO_LEGAL: LegalData = {
  contracts: [
    contract({ title: 'Distribution Agreement — Defected Records', type: 'recording', status: 'signed', counterparty: 'Defected Records Ltd', value: 0, currency: 'GBP', signedDate: '2024-03-15', expiryDate: '2027-03-14', createdAt: '2024-03-01', notes: '3-year deal, 80/20 master split in favor of artist after recoup' }),
    contract({ title: 'Publishing Admin — Kobalt', type: 'publishing', status: 'signed', counterparty: 'Kobalt Music Publishing', value: 0, currency: 'USD', signedDate: '2023-09-01', expiryDate: '2026-08-31', createdAt: '2023-08-10', flagged: true, notes: 'Expiring Aug 2026 — renewal negotiation needed' }),
    contract({ title: 'Brand Partnership — Pioneer DJ', type: 'brand', status: 'signed', counterparty: 'Pioneer DJ Corporation', value: 45000, currency: 'USD', signedDate: '2026-01-10', expiryDate: '2026-12-31', createdAt: '2025-12-01' }),
    contract({ title: 'Sync License — HBO "Euphoria S3"', type: 'sync', status: 'signed', counterparty: 'HBO / Warner Media', value: 22000, currency: 'USD', signedDate: '2026-02-20', createdAt: '2026-01-15' }),
    contract({ title: 'Sync License — Nike Campaign', type: 'sync', status: 'negotiation', counterparty: 'Nike Inc / Wieden+Kennedy', value: 85000, currency: 'USD', createdAt: '2026-07-01', notes: 'Term sheet received; negotiating exclusivity window' }),
    contract({ title: 'Touring Agreement — WME', type: 'touring', status: 'signed', counterparty: 'William Morris Endeavor', value: 0, currency: 'USD', signedDate: '2024-06-01', expiryDate: '2026-05-31', createdAt: '2024-05-01', flagged: true, notes: 'EXPIRED — renegotiation underway' }),
    contract({ title: 'NDA — Collab with [Redacted]', type: 'nda', status: 'signed', counterparty: 'Confidential', signedDate: '2026-05-01', expiryDate: '2027-05-01', createdAt: '2026-04-28' }),
    contract({ title: 'Sample Clearance — "Reverie"', type: 'other', status: 'review', counterparty: 'Warner Chappell Music', value: 5000, currency: 'USD', createdAt: '2026-06-10', notes: 'Sampling a 1978 Motown recording — awaiting master clearance' }),
  ],
}

export const NIMINO_LEGAL: LegalData = {
  contracts: [
    contract({ title: 'Label Deal — Mom + Pop Music', type: 'recording', status: 'signed', counterparty: 'Mom + Pop Music LLC', value: 0, currency: 'USD', signedDate: '2025-11-15', expiryDate: '2028-11-14', createdAt: '2025-10-01', notes: '2-album deal, 75/25 split post-recoup' }),
    contract({ title: 'Sync — TikTok Creator Fund Integration', type: 'sync', status: 'signed', counterparty: 'TikTok Inc / ByteDance', value: 18000, currency: 'USD', signedDate: '2026-03-01', expiryDate: '2026-08-31', createdAt: '2026-02-10' }),
    contract({ title: 'Brand — Spotify Radar Artist', type: 'brand', status: 'signed', counterparty: 'Spotify AB', value: 12000, currency: 'USD', signedDate: '2026-04-01', expiryDate: '2026-09-30', createdAt: '2026-03-15' }),
    contract({ title: 'Publishing — Independent (self-admin)', type: 'publishing', status: 'signed', counterparty: 'Self / ASCAP', value: 0, currency: 'USD', signedDate: '2024-01-01', createdAt: '2024-01-01' }),
    contract({ title: 'Merchandise — Printful Drop Agreement', type: 'merch', status: 'review', counterparty: 'Printful Inc', value: 0, currency: 'USD', createdAt: '2026-07-10', notes: 'Reviewing rev share terms before signing' }),
    contract({ title: 'NDA — Management Expansion', type: 'nda', status: 'signed', counterparty: 'Confidential', signedDate: '2026-06-01', createdAt: '2026-05-28' }),
  ],
}

export const SIERRA_LEGAL: LegalData = {
  contracts: [
    contract({ title: 'Development Deal — Republic Records', type: 'recording', status: 'draft', counterparty: 'Republic Records / UMG', value: 0, currency: 'USD', createdAt: '2026-07-20', flagged: true, notes: '2-album option deal under review — DO NOT SIGN without counsel review of reversion clause' }),
    contract({ title: 'Sync — Apple TV+ "Surface S2"', type: 'sync', status: 'signed', counterparty: 'Apple Inc', value: 15000, currency: 'USD', signedDate: '2026-05-10', createdAt: '2026-04-20' }),
    contract({ title: 'Publishing Admin — Songtrust', type: 'publishing', status: 'signed', counterparty: 'Downtown / Songtrust', value: 0, currency: 'USD', signedDate: '2025-02-01', expiryDate: '2027-01-31', createdAt: '2025-01-15' }),
    contract({ title: 'Brand — Levi\'s "Music for Change" Campaign', type: 'brand', status: 'negotiation', counterparty: 'Levi Strauss & Co', value: 35000, currency: 'USD', createdAt: '2026-07-01', notes: 'They want 18-month exclusivity on denim category — pushing back to 6 months' }),
    contract({ title: 'Merch — Global Merchandising Services', type: 'merch', status: 'signed', counterparty: 'GMS Inc', value: 0, currency: 'USD', signedDate: '2026-06-01', expiryDate: '2028-05-31', createdAt: '2026-05-01' }),
    contract({ title: 'NDA — Festival Headline Offer 2027', type: 'nda', status: 'signed', counterparty: 'Confidential', signedDate: '2026-07-15', createdAt: '2026-07-14' }),
  ],
}

export const EMPTY_LEGAL: LegalData = { contracts: [] }
