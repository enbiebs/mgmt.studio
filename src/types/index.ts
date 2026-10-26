// ──────────────────────────────────────────────────────────
//  Studio · Types
//  Every piece of data in the app is described here.
//  When you add Supabase later, these types map to your tables.
// ──────────────────────────────────────────────────────────

export type Stage = 'track' | 'mix' | 'master' | 'done'
export type ShowStatus = 'confirmed' | 'hold' | 'cancelled'
export type Currency = 'USD' | 'GBP' | 'EUR'

export interface BankAccount {
  id: string
  name: string
  officialName?: string
  mask?: string
  type?: string
  subtype?: string
  currency?: Currency
  currentBalance?: number
  availableBalance?: number
  institutionName?: string
}

export interface BankTransaction {
  id: string
  accountId: string
  date: string
  name: string
  merchantName?: string
  amount: number
  currency?: Currency
  category?: string
  pending: boolean
  catalogWorkId?: string   // → CatalogWork — manually confirmed as income for this song
  invoiceId?: string       // → Invoice — manually confirmed as payment for this invoice
}
export type RegStatus = 'ok' | 'warn' | 'no' | 'q'
export type PostType = 'reel' | 'story' | 'post' | 'video' | 'tiktok' | 'shorts' | 'spotify-clip' | 'tweet' | 'laylo'

// 'lead-single' / 'single' drive release-planning priority; 'album-cut' is the default.
export type TrackPriority = 'lead-single' | 'single' | 'album-cut'

export interface Track {
  id: string
  num: number
  title: string
  stage: Stage
  version: number
  touched: string        // human-readable e.g. "3d", "now"
  notes?: string
  priority?: TrackPriority
  owner?: string          // who has the ball right now, e.g. "Alex — mixing", "Awaiting artist approval"
  dueDate?: string        // ISO date the current stage is targeted to wrap by
  labelCopy?: TrackLabelCopy
  releaseDate?: string
  lyrics?: string
  mixerBrief?: string
  rounds?: TrackRound[]    // uploaded audio versions, each with its own timestamped review thread
  credits?: TrackCredit[]
}

// ── Track audio review (rounds, timestamped notes, credits) ─────
export interface TrackNoteReply {
  id: string
  author: string
  text: string
  createdAt: string
}

export interface TrackNote {
  id: string
  timestamp: number   // seconds into the round's audio
  author: string
  text: string
  resolved: boolean
  replies: TrackNoteReply[]
  createdAt: string
}

/**
 * Where a version stands with the artist: "awaiting" once management asks, then the artist's own answer. The answer can only be written by
 * the artist's login (the database refuses anything else), and `by`, `at` and `note` are theirs.
 */
export interface RoundApproval {
  status: 'awaiting' | 'approved' | 'changes'
  askedAt?: string       // ISO time the request was sent
  by?: string            // who answered
  at?: string            // ISO time of the answer
  note?: string          // what they said
}

export interface TrackRound {
  id: string
  label: string        // "V3", "Working V2", "mix ref"
  stage: Stage          // pipeline stage this round belongs to, for badge coloring
  audioPath?: string     // storage path in the 'track-audio' bucket
  duration?: number      // seconds, cached from the audio file
  notes: TrackNote[]
  createdAt: string
  approval?: RoundApproval
}

export interface TrackCredit {
  id: string
  name: string
  role: string          // "Producer", "Songwriter", "Mixer", etc.
  split: number          // percentage
}

export type ReleaseType = 'single' | 'ep' | 'album'

export interface Album {
  id: string
  title: string
  type?: ReleaseType   // missing on older records — treat as 'album'
  releaseDate?: string
  tracks: Track[]
  labelCopy?: ReleaseLabelCopy
  checklist?: ChecklistItem[]
  stakeholders?: ReleaseStakeholder[]
}

// ── People — the one shared directory every part of the app links to ──
// A person exists once per client, no matter how many hats they wear —
// the same "Dana Wells" record is what both a Crew entry and a Release
// Stakeholder entry point to, instead of each typing her name and email
// separately (and drifting out of sync, e.g. two different email
// addresses for the same person in two different places). Update her
// info once, here, and it's correct everywhere she's linked.
export interface Person {
  id: string
  name: string
  email?: string
  phone?: string
  org?: string
  title?: string                // free-text job title or role, typed by hand ("Tour Manager", "Stylist")
  notes?: string
  activity?: PersonActivity[]   // running comms log — what's been said/sent to this person
}

// A lightweight in-app comms log entry — not a real email/SMS send, just a
// timestamped record so anyone on the team can see what this person's
// already been told without re-asking.
export interface PersonActivity {
  id: string
  date: string     // ISO date "2026-08-14"
  text: string
}

// ── Release stakeholders — the real cast around a release beyond the roster ──
// Roles reflect who actually shows up on a release thread: your own team,
// the label's day-to-day contact vs. its legal/business-affairs desk (who
// issue waivers when a feature is signed elsewhere), the featured artist's
// own rep, that artist's label legal team, the publisher/PRO, and video.
export type StakeholderRole =
  | 'management' | 'label-am' | 'label-legal' | 'label-marketing'
  | 'featured-artist-rep' | 'featured-artist-label' | 'publisher' | 'video' | 'distributor' | 'other'

export interface ReleaseStakeholder {
  id: string
  personId: string        // → Person
  role: StakeholderRole
  notes?: string
}

// ── Label copy — release metadata required before delivery to DSPs/label ──
export interface TrackLabelCopy {
  isrc?: string
  writers?: string        // songwriter credits
  producers?: string
  publisher?: string
  pro?: string             // performance rights org, e.g. "ASCAP"
  explicit?: boolean
  duration?: string        // "3:24"
  language?: string
}

export interface ReleaseLabelCopy {
  upc?: string
  label?: string           // record label / imprint
  primaryArtist?: string
  genre?: string
  copyrightP?: string      // ℗ line
  copyrightC?: string      // © line
}

// ── Release checklist — per-release delivery milestones ──
// Item set and phase grouping reflect the real path a release takes from
// rights clearance through audio delivery to DSP/social marketing — labels
// route masters to DSPs against pitching deadlines (not the release date),
// re-cut social clips whenever the master changes, and gate CML/library
// clearance on splits being finalized.
export type ChecklistItemKey =
  | 'splits' | 'samples' | 'labelcopy'
  | 'masters' | 'stems' | 'extended' | 'archived' | 'metadata'
  | 'isrc' | 'upc' | 'artwork' | 'releasedate' | 'copyright'
  | 'officialsound' | 'cml' | 'dsppitch' | 'lyrics' | 'presave'

export type ChecklistPhase = 'Rights & Credits' | 'Audio Delivery' | 'Release Assets' | 'Social & DSP Marketing'

export interface ChecklistItem {
  key: ChecklistItemKey
  label: string
  phase: ChecklistPhase
  done: boolean
  note?: string
}

export interface Show {
  id: string
  date: string           // ISO: "2026-08-14"
  city: string
  venue: string
  time: string           // "20:00"
  status: ShowStatus
  notes?: string
  guarantee?: number
  deposit?: number
  received?: number      // how much of the fee has actually arrived (recorded by hand; the cash forecast counts only what is still to come)
  currency?: Currency
  tourOfferId?: string   // → TourOffer this show was confirmed from, if any
  viaAgency?: boolean               // booked through a booking agency, not directly
  agencyName?: string
  agencyCommissionPct?: number      // agency's cut, only deducted when viaAgency
  managementCommissionPct?: number  // management's cut, only deducted when viaAgency
  invoiceId?: string      // → Invoice generated to track this show's receivable, if any
  driveUrl?: string       // link to this show's folder in Drive (or wherever the team keeps its files)
  runId?: string          // → Run this show belongs to (one run per show)
  historyOnly?: boolean   // already happened; kept for fee comparisons, never raises to-dos (no "settlement missing" etc.)
}

export interface Post {
  id: string
  date: string           // ISO: "2026-08-14"
  title: string
  time: string           // "10:00am"
  type: PostType
  releaseId?: string      // album this post was auto-generated for
  auto?: boolean          // true if generated by the release rollout template
}

export interface RoyaltyStream {
  id: string
  name: string           // "BMI", "Defected Records", etc.
  type: string           // "Performance", "Master", etc.
  amount: number
  currency: Currency
  period: string         // "Dec 2025 statement"
}

export interface Deposit {
  id: string
  name: string
  date: string
  amount: number
  currency: Currency
  mgmt: number           // percentage as decimal, e.g. 0.10 = 10%
  lawyer: number
  taxes: number
  done: boolean
  invoiceId?: string     // → Invoice this deposit pays, if any. The P&L counts the deposit and leaves that invoice out, so the money is counted once
}

export interface CatalogWork {
  id: string
  title: string
  ipi?: string
  writers: string
  amount: number
  currency: Currency
  bmi: RegStatus
  mlc: RegStatus
  sx: RegStatus
  ppl: RegStatus
}

// ── Artist profile (open details; the private ones live only on the server) ──
export interface TravelPrefs {
  legalName?:  string    // exactly as it appears on their ID, for bookings
  homeAirport?: string
  seat?:       string
  hotelPrefs?: string
  roomType?:   string
  dietary?:    string
  requests?:   string
}
export interface ProfileContact {
  id:       string
  role:     string        // "Agent", "Business manager", "Lawyer"...
  personId?: string       // → Person in the artist's directory (their email and phone live there)
  firm?:    string
  notes?:   string
}
export interface ArtistProfile {
  legalName?:       string
  phone?:           string
  email?:           string
  altEmail?:        string
  website?:         string
  businessName?:    string
  businessAddress?: string
  bioShort?:        string
  bioLong?:         string
  notes?:           string
  social?:          Partial<Record<'instagram' | 'tiktok' | 'twitter' | 'youtube' | 'facebook' | 'spotify' | 'appleMusic' | 'soundcloud' | 'bandcamp' | 'other', string>>
  sizes?:           Partial<Record<'shirt' | 'jacket' | 'jeans' | 'pants' | 'shoe', string>>
  travel?:          TravelPrefs                      // the artist's own
  party?:           string[]                         // people who travel with the artist (ids in the directory)
  partyTravel?:     Record<string, TravelPrefs>      // their open travel preferences, by person id
  contacts?:        ProfileContact[]   // retired: titles now live on each person on the Team page (nothing reads or writes this any more)
  drive?:           Partial<Record<'root' | 'agreements' | 'music' | 'touring' | 'content' | 'promoterMedia' | 'deals' | 'finance', string>>   // links to the artist's Drive folders
}

// ── Accounts list: where each login is kept and how the team gets in. Never holds a password. ──
export type AccountAccess = 'platform' | 'manager' | 'artist' | 'unsorted'
export type AccountTwoFactor = 'app' | 'sms' | 'email' | 'key' | 'none' | 'unknown'
export interface ArtistAccount {
  id:           string
  platform:     string            // "Spotify for Artists", "DistroKid", "Bookings email"...
  category:     string
  label?:       string            // what it is used for
  username?:    string            // the login name or email (never the password)
  owner?:       string            // who legally owns the account: the artist, management, the label...
  access:       AccountAccess     // how the team gets in
  twoFactor:    AccountTwoFactor  // what protects it besides the password
  loginUrl?:    string            // the platform's sign-in page
  vaultUrl?:    string            // the shared entry in the team's password manager
  lastChanged?: string            // when the password was last changed (ISO date)
  notes?:       string
}

export interface Client {
  id: string
  name: string
  genre: string
  color: string          // hex color for avatar
  calendarToken?: string  // private, unguessable — enables /api/calendar/[token] ICS subscription
  setupSkipped?: string[] // first-day checklist steps that don't apply to this artist (shared by the whole team)
  photoPath?: string      // the artist's photo and logo files in the private image store (also used to refresh a changed picture); see components/ui/ArtistAvatar
  logoPath?: string
  isDemo?: boolean        // a made-up client: only its owner can see it (DB-enforced), and it's left out of alerts, forecasts and emails
  people: Person[]        // shared directory — everyone linked from Crew, Stakeholders, etc.
  songs: {
    albums: Album[]
  }
  tour: TourData
  content: {
    posts: Post[]
  }
  business: {
    royalties: { streams: RoyaltyStream[] }
    banking:   { deposits: Deposit[]; accounts: BankAccount[]; transactions: BankTransaction[] }
    catalog:   { works: CatalogWork[] }
  }
  projects:    Project[]
  artistTodos: ArtistTodo[]
  agenda?:     AgendaPoint[]    // the management side's agenda points for this artist's to-dos and projects (never the artist's own login)
  tasks?:      Task[]           // the management side's to-dos for this artist (see lib/tasks.ts); never shown to the artist's own login
  analytics:   AnalyticsData
  agentData:   AgentData
  legal:       LegalData
  finance:     ClientFinance
  accounts?:   ArtistAccount[]  // where each login is kept (no passwords)
  profile?:    ArtistProfile    // the open details; private details are never held in the app's data (see lib/profile-fields.ts)
  // Sections where this client has at least one item the viewer can load.
  // For someone with no grant for a section, an item there means it was shared
  // with them (see src/lib/item-access.ts). Computed on load, not stored.
  itemSections?: MainSection[]
}

export interface AppData {
  clients: Client[]
}

// ── Role system ─────────────────────────────────────────────
// 'manager' = full management workspace
// 'artist'  = clean artist portal (no internal ops details)
// 'agent'   = booking agent — offers, routing, settlements
// 'lawyer'  = attorney — contracts, rights, deadlines
export type UserRole = 'manager' | 'artist' | 'agent' | 'lawyer' | 'team'

// ── Projects (management-side tracking) ─────────────────────
export type ProjectStatus = 'submitted' | 'in-progress' | 'review' | 'done'
export type ProjectType   = 'release' | 'show' | 'content' | 'brand-deal' | 'merch' | 'other'
export interface Project {
  id: string
  title: string
  type: ProjectType
  status: ProjectStatus
  assigneeId?: string    // the teammate it is given to (a WorkspacePerson.userId); none = nobody yet
  dueDate?: string
  notes?: string
  createdAt: string
  fromArtist: boolean    // true = artist submitted this request
}

// ── Artist Todos ────────────────────────────────────────────
export interface ArtistTodo {
  id: string
  title: string
  done: boolean
  dueDate?: string
  createdAt: string
}

// ── Tasks (the Home to-do list) ─────────────────────────────
// A hand-written to-do that belongs to one artist and is given to one teammate. What points at a show
// or an invoice carries the link so "Open" lands in the right place; who may see it follows that link.
export type TaskLinkType = 'show' | 'offer' | 'invoice' | 'expense' | 'contract' | 'song' | 'project'
export type TaskSource = 'manual' | 'command_bar' | 'agent' | 'auto'

export interface Task {
  id: string
  title: string
  notes?: string
  dueDate?: string            // YYYY-MM-DD
  assigneeId?: string         // the login it is given to (a WorkspacePerson.userId); none = nobody yet
  link?: { type: TaskLinkType; id: string }
  autoKey?: string            // set when it was made by taking a key date ("advance:<show id>"), so it is never made twice
  source: TaskSource
  createdBy?: string
  createdAt: string           // ISO timestamp
  doneAt?: string             // ISO timestamp; set = checked off
  doneBy?: string
}

/** A teammate on the management side, and which artists they can open (from the database, by the server). */
export interface WorkspacePerson {
  memberId: string
  userId: string
  label: string
  role: UserRole
  allClients: boolean
  clientIds: string[]
  /** True until this login has signed in for the first time (an invitation nobody has accepted yet). */
  invited?: boolean
  /** The directory person (their card on the Team page) this login belongs to, if any. */
  personId?: string
  /** Their login email, lower-case. Only a manager is given it; it is how a login and a team card are recognised as the same person. */
  email?: string
}

// ── Agenda (talking points / steps around one to-do or project) ──
export type AgendaItemType = 'task' | 'project'
export interface AgendaPoint {
  id: string
  itemType: AgendaItemType
  itemId: string
  text: string
  done: boolean
  position: number
}

// ── Analytics ───────────────────────────────────────────────
export interface DataPoint { date: string; value: number }

export interface PlatformFollowers {
  spotify:   number
  instagram: number
  tiktok:    number
  youtube:   number
  facebook:  number
  twitter:   number
}

export interface StreamingMetrics {
  monthlyListeners:      number
  monthlyListenersDelta: number   // absolute change vs last month
  monthlyListenersPct:   number   // % change
  dailyStreams:          DataPoint[]
  dspBreakdown: { name: string; streams: number; pct: number }[]
  totalStreams:          number
  saveEstimate:          number
  playlistCount:         number
  playlistCountDelta:    number
}

export interface PlaylistEntry {
  id:        string
  trackTitle: string
  name:      string
  platform:  string
  followers: number
  position:  number
  dateAdded: string
  type:      'editorial' | 'algorithmic' | 'user'
  curator:   string
  movement:  'up' | 'down' | 'new' | 'same'
  movementAmt: number
}

export interface SocialPlatform {
  platform:       string
  icon:           string
  followers:      number
  followersDelta: number
  engagementRate: number
  weeklyGrowth:   DataPoint[]
  topPost?:       string
}

export interface TikTokData {
  sounds:       number
  ugcVideos:    number
  totalViews:   number
  weeklyTrend:  DataPoint[]
  topCreators: { handle: string; videos: number; views: number }[]
  geoSpread:   { country: string; pct: number }[]
  chartPeak:   number
}

export interface AudienceData {
  topCountries: { name: string; code: string; pct: number }[]
  topCities:    { name: string; country: string; pct: number }[]
  age: { range: string; pct: number }[]
  gender: { label: string; pct: number }[]
}

export interface ChartEntry {
  id:         string
  platform:   string
  chartName:  string
  country:    string
  position:   number
  peak:       number
  entered:    string
  movement:   'up' | 'down' | 'new' | 'same'
  movementAmt: number
}

export interface AnalyticsData {
  chartmetricScore:    number
  chartmetricScoreDelta: number
  momentumScore:       number
  followers:           PlatformFollowers
  followersDelta:      PlatformFollowers
  streaming:           StreamingMetrics
  playlists:           PlaylistEntry[]
  social:              SocialPlatform[]
  tiktok:              TikTokData
  audience:            AudienceData
  charts:              ChartEntry[]
  shazamDaily:         DataPoint[]
  shazamTotal:         number
}

// ── Section / view routing ──────────────────────────────────
export type MainSection  = 'overview' | 'today' | 'calendar' | 'profile' | 'songs' | 'tour' | 'deals' | 'content' | 'finance' | 'projects' | 'analytics' | 'team' | 'legal' | 'activity'
export type SongsSub     = 'tracks' | 'labelcopy' | 'checklist' | 'status'
export type ContentSub   = 'manage' | 'studio' | 'lab'
export type BizSub       = 'royalties' | 'banking' | 'catalog' | 'pl' | 'invoices' | 'payments' | 'forecast'
export type TourSub      = 'tour' | 'stage-plot' | 'advance' | 'daysheet' | 'crew' | 'guests' | 'travel' | 'offers' | 'budget' | 'settlements'
export type AnalyticsSub = 'overview' | 'streaming' | 'playlists' | 'social' | 'tiktok' | 'audience' | 'charts'
export type LegalSub     = 'pipeline' | 'alerts' | 'register' | 'templates'

// ── Tour Management — Advance System ────────────────────────
export type AdvanceStatus = 'draft' | 'sent' | 'in-progress' | 'complete'

export interface AdvanceContact {
  id:     string
  role:   string   // "Production Manager", "Hospitality", "Security", etc.
  name:   string
  phone?: string
  email?: string
  notes?: string
}

export interface AdvanceSchedule {
  busCall?:       string   // e.g. "08:00"
  lobbyCall?:     string
  loadIn?:        string
  lineCheck?:     string
  soundcheck?:    string
  artistSoundcheck?: string
  doorsOpen?:     string
  supportOn?:     string
  supportOff?:    string
  headlineOn?:    string
  curfew?:        string
  loadOut?:       string
  departureTime?: string
  notes?:         string
}

export interface AdvanceProduction {
  stageWidth?:    string   // "40ft"
  stageDepth?:    string
  roofHeight?:    string
  fohPosition?:   string
  monPosition?:   string
  powerSupply?:   string
  localCrewCount?: string
  backlineNotes?: string
  riserCount?:    string
  merchandiseLocation?: string
  notes?:         string
}

export interface AdvanceHospitality {
  hotel?:               string
  hotelAddress?:        string
  hotelPhone?:          string
  hotelConfirmation?:   string
  checkIn?:             string
  checkOut?:            string
  roomCount?:           string
  roomNotes?:           string   // room assignments
  dressingRooms?:       string
  dressingRoomNotes?:   string
  cateringCompany?:     string
  mealTimes?:           string
  dietaryNotes?:        string
  runnerName?:          string
  runnerPhone?:         string
  notes?:               string
}

export interface AdvanceLogistics {
  parkingInstructions?: string
  busParking?:          string
  loadingDockAddress?:  string
  loadingDockNotes?:    string
  nearestAirport?:      string
  distanceToAirport?:   string
  groundTransport?:     string
  flights?:             string
  notes?:               string
}

export interface ShowAdvance {
  id:          string
  showId:      string    // links to existing Show.id
  status:      AdvanceStatus
  sentAt?:     string
  completedAt?: string
  // Core sections
  schedule:    AdvanceSchedule
  production:  AdvanceProduction
  hospitality: AdvanceHospitality
  logistics:   AdvanceLogistics
  contacts:    AdvanceContact[]
  // Extras
  wifi?:          string
  wifiPassword?:  string
  weatherNotes?:  string
  guestListCap?:  string
  guestListNotes?: string
  generalNotes?:  string
}

// ── Crew Management ─────────────────────────────────────────
export type CrewRole = 'tour-manager' | 'production-manager' | 'foh' | 'monitors' | 'lighting' | 'video' | 'backline' | 'merch' | 'security' | 'driver' | 'artist' | 'other'

export interface CrewMember {
  id:              string
  personId:        string   // → Person
  role:            CrewRole
  passport?:       string   // passport expiry only (no full number)
  emergencyName?:  string
  emergencyPhone?: string
  notes?:          string
}

// ── Guest List ───────────────────────────────────────────────
export type GuestListCategory = 'artist' | 'vip' | 'label' | 'management' | 'media' | 'family' | 'promo' | 'sponsor'

export interface GuestListEntry {
  id:         string
  showId:     string
  name:       string
  qty:        number
  category:   GuestListCategory
  checkedIn:  boolean
  credential?: string
  notes?:     string
}

// ── Travel Booking ───────────────────────────────────────────
export type TravelStatus = 'needed' | 'pending' | 'booked' | 'cancelled'

// One segment of a flight booking — a nonstop hop between two airports.
// A connecting itinerary is 2+ legs on the same TravelFlight, in order.
export interface FlightLeg {
  id:            string
  airline?:      string
  flightNumber?: string
  from?:         string         // "JFK"
  fromCity?:     string         // "New York"
  to?:           string         // "LHR"
  toCity?:       string         // "London"
  departure?:    string         // "2026-08-22T07:30"
  arrival?:      string         // "2026-08-23T07:15"
  duration?:     string         // "7h 15m"
  cabin?:        string         // "Economy" | "Business" | "First"
}

export interface TravelFlight {
  id:                string
  showIds?:          string[]       // → Show — zero (a promo trip/day off), one, or several (one flight covering a festival weekend)
  runId?:             string         // → Run — cost shared across all of that run's shows (when no specific shows are linked)
  kind:              'flight'
  status:            TravelStatus
  traveler:          string         // "Full Party" | individual name
  personIds?:        string[]       // → Person — who from Team this booking actually covers
  legs:              FlightLeg[]    // always >= 1; 2+ means a connection
  seats?:            string         // seat numbers or count
  confirmationCode?: string
  cost?:             number
  currency?:         Currency
  notes?:            string
}

export interface TravelHotel {
  id:                string
  showIds?:          string[]       // → Show — zero, one, or several (see TravelFlight)
  runId?:             string         // → Run — cost shared across all of that run's shows (when no specific shows are linked)
  kind:              'hotel'
  status:            TravelStatus
  personIds?:        string[]       // → Person — who from Team this booking actually covers
  name?:             string
  address?:          string
  phone?:            string
  checkIn?:          string         // ISO date "2026-08-22"
  checkOut?:         string
  roomCount?:        number
  roomType?:         string         // "King" | "Double" | "Suite"
  confirmationCode?: string
  cost?:             number
  currency?:         Currency
  notes?:            string
}

export interface TravelGround {
  id:                string
  showIds?:          string[]       // → Show — zero, one, or several (see TravelFlight)
  runId?:             string         // → Run — cost shared across all of that run's shows (when no specific shows are linked)
  kind:              'ground'
  status:            TravelStatus
  personIds?:        string[]       // → Person — who from Team this booking actually covers
  type:              'rental-car' | 'transfer' | 'train' | 'bus'
  provider?:         string
  from?:             string
  to?:               string
  pickupTime?:       string         // "2026-08-22T16:45"
  confirmationCode?: string
  vehicleType?:      string         // "Sprinter Van" | "Sedan" | "SUV"
  cost?:             number
  currency?:         Currency
  notes?:            string
}

export type TravelItem = TravelFlight | TravelHotel | TravelGround

// ── Venue (reusable across shows at the same room) ──────────
// Field names deliberately mirror AdvanceProduction/Hospitality/Logistics
// above so saving/loading a venue is a straight field-by-field copy.
export interface Venue {
  id:                   string
  name:                 string
  city:                 string
  address?:             string
  wifi?:                string
  wifiPassword?:        string
  stageWidth?:          string
  stageDepth?:          string
  roofHeight?:          string
  fohPosition?:         string
  monPosition?:         string
  powerSupply?:         string
  riserCount?:          string
  merchandiseLocation?: string
  dressingRooms?:       string
  dressingRoomNotes?:   string
  cateringCompany?:     string
  parkingInstructions?: string
  busParking?:          string
  loadingDockAddress?:  string
  loadingDockNotes?:    string
  nearestAirport?:      string
  distanceToAirport?:   string
  contacts?:            AdvanceContact[]
  notes?:               string
  createdAt:            string
}

// ── Tour Data (extended) ─────────────────────────────────────
export interface TourData {
  shows:      Show[]
  advances:   ShowAdvance[]
  crew:       CrewMember[]
  guestList:  GuestListEntry[]
  travel:     TravelItem[]
  venues:     Venue[]
  runs:       Run[]
  offerSheets?: OfferSheet[]   // management with Tour + Finance access, and the artist's own login
}

// ── Agent / Booking ─────────────────────────────────────────
export type OfferStatus = 'inquiry' | 'hold' | 'confirmed' | 'cancelled' | 'settled'

// Everything an offer says beyond venue / date / guarantee. All optional: an offer only
// carries the terms that were actually quoted.
export interface OfferBonus   { atTickets: number; amount: number }        // "$750 if 850 tickets sell"
export interface OfferPayment { when: string; pct: number }                // "30 days out" - 25
export interface OfferTerms {
  // The show
  capacity?:         number
  ageLimit?:         string          // All ages / 18+ / 21+
  venueType?:        string          // "Converted warehouse"
  billing?:          string          // Headline / Direct support / Support / Festival set
  doors?:            string          // "21:00"
  setStart?:         string          // "00:30"  (12:30 AM)
  setLengthMin?:     number
  // Money beyond the guarantee
  bonuses?:          OfferBonus[]
  groundTransport?:  number          // contributed by the promoter
  hotel?:            number
  airfare?:          number
  merchArtistPct?:   number          // the artist's share of merch
  merchSoldBy?:      'artist' | 'venue'
  // Terms
  production?:       string          // "House production and backline only"
  hospitality?:      string          // "No meal or hospitality buyouts"
  payments?:         OfferPayment[]  // schedule, percentages add up to 100
  radiusMiles?:      number          // radius clause: no shows within this many miles ...
  radiusDaysAfter?:  number          // ... from confirmation until this many days after the show
  // For deciding
  routingNotes?:     string          // "Cancun is the next day, 7:30 PM set"
  alternativeDates?: string          // "December is open except 12/14"
  respondBy?:        string          // ISO date: the buyer wants an answer by then
}

export interface TourOffer {
  id:         string
  venue:      string
  city:       string
  country:    string
  date:       string        // ISO "2026-10-15"
  promoter:   string
  guarantee:  number        // in USD
  door?:      number        // door split %
  buyout?:    number        // hospitality/production buyout
  status:     OfferStatus
  notes?:     string
  settledAt?: string
  netPayout?: number        // after splits
  showId?:    string        // → Show created when this offer was confirmed
  viaAgency?: boolean               // booked through a booking agency, not directly
  agencyName?: string
  agencyCommissionPct?: number      // agency's cut, only deducted when viaAgency
  managementCommissionPct?: number  // management's cut, only deducted when viaAgency
  terms?: OfferTerms
}

// ── Legal / Contracts ───────────────────────────────────────
export type ContractStatus = 'draft' | 'review' | 'negotiation' | 'signed' | 'expired' | 'terminated'
export type ContractType   = 'management' | 'recording' | 'publishing' | 'sync' | 'brand' | 'touring' | 'nda' | 'merch' | 'other'

/** A copy of the contract itself (a PDF or Word file), kept in private storage: "signed copy", "v2 from lawyer". */
export interface ContractFile {
  id:      string
  path:    string      // where it is stored: "<clientId>/<id>.pdf"
  name:    string      // the name it was uploaded with
  label:   string
  addedAt: string      // ISO date
}

export interface Contract {
  id:           string
  title:        string
  type:         ContractType
  status:       ContractStatus
  counterparty: string
  value?:       number
  currency?:    Currency
  signedDate?:  string
  expiryDate?:  string          // when the current term ends; for an automatically renewing contract, when the FIRST term ended
  notes?:       string
  createdAt:    string
  flagged?:     boolean    // attorney has flagged for review
  autoRenews?:  boolean    // renews by itself at the end of each term unless someone gives notice
  renewalMonths?: number   // how long each automatic renewal runs (12 when not said)
  noticeDays?:  number     // days of written notice needed before the term ends to stop it renewing or to end it
  terms?:       Record<string, string>   // the key terms for this kind of contract (see lib/contract-terms.ts)
  files?:       ContractFile[]
  reminderEmails?: string[]   // outside people (a lawyer, an assistant) emailed as the contract's key dates come up; they need no login
}

// ── Finance / Business Manager Replacement ──────────────────
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'
export type ExpenseCategory = 'travel' | 'recording' | 'marketing' | 'legal' | 'management' | 'equipment' | 'meals' | 'other'
export type RevenueStream   = 'touring' | 'streaming' | 'sync' | 'brand' | 'merch' | 'other'

export interface InvoiceLineItem {
  description: string
  quantity:    number
  rate:        number
}

export interface Invoice {
  id:         string
  number:     string        // "INV-2026-001"
  to:         string        // payee name
  toEmail?:   string
  category:   RevenueStream
  status:     InvoiceStatus
  issuedDate: string
  dueDate:    string
  paidDate?:  string
  items:      InvoiceLineItem[]
  currency:   Currency
  notes?:     string
}

// Expenses and bills are one list: a bill is just an expense with a due date,
// an attached PDF, and a link to a saved Vendor.
export interface Expense {
  id:          string
  description: string
  vendor:      string
  amount:      number
  currency:    Currency
  category:    ExpenseCategory
  date:        string
  paid:        boolean
  receipt?:    string       // URL or filename
  vendorId?:     string     // → saved Vendor, when the bill matched/created one
  dueDate?:      string     // ISO "2026-08-14"
  billNumber?:   string
  billFilePath?: string     // private storage path of the attached PDF
  vendorFlags?:  VendorField[]  // vendor details that differed from the saved vendor when this bill was confirmed
  // Cost linking (Stage 4): the specific show(s) this applies to (split evenly), or a whole run
  // (shared evenly across its shows); neither = not counted against any show.
  showIds?:      string[]
  runId?:        string
  bucket?:       BudgetBucket   // which budget line this cost counts toward
}

export type VendorField = 'address' | 'email' | 'phone' | 'taxId' | 'bank'

// Bank details are never stored in full - last 4 digits for display, plus a
// server-keyed fingerprint so a changed account is still detected.
export interface Vendor {
  id:               string
  name:             string
  address?:         string
  email?:           string
  phone?:           string
  taxId?:           string
  bankLast4?:       string
  bankFingerprint?: string
}

export interface PLMonth {
  month:    string          // "2026-01"
  revenue: {
    touring:   number
    streaming: number
    sync:      number
    brand:     number
    merch:     number
    other:     number
  }
  expenses: {
    travel:     number
    recording:  number
    marketing:  number
    legal:      number
    management: number
    equipment:  number
    meals:      number
    other:      number
  }
}

export interface ClientFinance {
  invoices:  Invoice[]
  expenses:  Expense[]
  vendors:   Vendor[]
  plMonths:  PLMonth[]
  budgets:   Budget[]
  crewRates: CrewRate[]
  settings?: FinanceSettings   // home currency + default commissions; absent = defaults
  settlements?: Settlement[]   // management side with Finance access only
}

// ── Runs & tour budgets (Stage 4) ───────────────────────────
// A run is a named group of shows ("Europe Fall 2026"); a show is in at most one.
export interface Run {
  id:   string
  name: string
}

// The budget mirrors Eli's example budget: Income → Sound & Lights → Production
// costs → Commissions → Net, every commission with its own % and its own base.
export type BudgetSection = 'income' | 'sound_lights' | 'production'
export type BudgetBucket =
  | 'guarantee' | 'overage' | 'bonus' | 'buyout' | 'sound_lights' | 'labor' | 'filming_editing' | 'social_content'
  | 'airfare' | 'hotels' | 'local_transport' | 'insurance' | 'payroll_taxes' | 'per_diems' | 'supplies'

export interface BudgetLine {
  id:            string
  section:       BudgetSection
  bucket:        BudgetBucket
  label:         string
  amount:        number
  crewMemberId?: string
  days?:         { advance: number; travel: number; show: number }   // crew lines: what the amount was worked out from
  calc?:         BudgetLineCalc                                      // travel lines: worked out from the budget's assumptions (typing over the amount clears this)
}

// A travel line that the assumptions drive: amount = gross estimate - what the promoter covers.
export interface BudgetLineCalc { basis: string; gross: number; promoterCovers: number }

// Where an estimate came from: typed by hand, the artist's own past trips, or a web search.
export type EstimateSource = 'typed' | 'history' | 'web'
export interface BudgetEstimate {
  amount:   number                                  // in the budget's currency: flight = per person round trip, hotel = per room per night, ground = the whole trip
  source:   EstimateSource
  low?:     number
  high?:    number
  note?:    string                                  // "Based on 2 of your past trips to Lisbon" / a one-line summary of the web search
  sources?: { title: string; url: string }[]        // web pages the estimate came from
  asOf?:    string                                  // ISO date the estimate was made
}
export interface BudgetAssumptions {
  travelers: number                                 // people who fly and stay (the artist and touring crew)
  rooms:     number
  from?:     string                                 // where they fly from, e.g. "Los Angeles"
  to?:       string                                 // the show city
  arrive?:   string                                 // ISO dates
  depart?:   string
  flight?:   BudgetEstimate
  hotel?:    BudgetEstimate
  ground?:   BudgetEstimate
}

export type CommissionBase = 'gross' | 'after_sound_lights' | 'after_production' | 'flat'
export interface BudgetCommission {
  id:    string
  label: string
  pct:   number
  base:  CommissionBase
  flat?: number             // used when base is 'flat'
}

// What "Original" compares against: the budget as it stood when the offer was confirmed.
export interface BudgetSnapshot {
  lines:       BudgetLine[]
  commissions: BudgetCommission[]
  currency:    Currency
  version:     number
}

export interface Budget {
  id:          string
  offerId?:    string       // created when the offer comes in
  showId?:     string       // set when the offer is confirmed (or a show budget made directly)
  name:        string
  currency:    Currency
  status:      'draft' | 'locked'
  version:     number
  lines:       BudgetLine[]
  commissions: BudgetCommission[]
  notes?:      string
  assumptions?: BudgetAssumptions
  original?:   BudgetSnapshot
  lockedAt?:   string
  updatedAt?:  string
}

// Saved pay for a crew member, applied automatically to budgets.
export interface CrewRate {
  crewMemberId:   string
  toursWithArtist: boolean   // auto-added to every new budget
  rateUnit:       'day' | 'show'
  rateShow:       number     // per show day (or per show)
  rateAdvance?:   number     // per advance day; blank = same as the travel rate
  rateTravel?:    number     // per travel day; blank = same as the show rate
  perDiem:        number
  currency:       Currency
}

export interface FinanceSettings {
  homeCurrency:       Currency
  defaultCommissions: Omit<BudgetCommission, 'id'>[]
}

// ── Settlements (Stage 4, Part 3) ───────────────────────────
// What the promoter sends after a show: tickets, their costs, the deal math and what is
// due to the artist. Read from an uploaded statement and confirmed by the manager; it
// then supplies the real income for the settled P&L. Management side only.
export type PayoutKind =
  | 'guarantee' | 'overage' | 'bonus' | 'buyout' | 'other_income'   // money earned (income)
  | 'deposit' | 'withholding_tax' | 'deduction'                      // taken off the payout

export interface PayoutLine { label: string; amount: number; kind: PayoutKind }
export interface SettlementTicketTier { show?: string; tier: string; capacity?: number; comps?: number; sold?: number; price?: number; gross?: number }
export interface SettlementExpense { group: string; label: string; budget?: number; actual?: number; note?: string }
export interface SettlementPayment { label: string; amount: number; note?: string }

// Exchange rates (USD per one unit) frozen when the settlement is confirmed.
export interface FrozenRates { USD: 1; EUR: number; GBP: number; at: string }

export interface Settlement {
  id:           string
  showIds:      string[]
  filePath?:    string
  fileName?:    string
  eventName?:   string
  venue?:       string
  promoter?:    string
  preparedOn?:  string
  preparedBy?:  string
  currency:     Currency
  fx:           FrozenRates
  attendance?:  { sold?: number; comps?: number; capacity?: number }
  summary?:     { gross?: number; taxesAndFees?: number; netGross?: number; totalExpenses?: number; netShowReceipts?: number; promoterEarnings?: number; adjustments?: { label: string; amount: number }[] }
  deal?:        { description?: string; guarantee?: number; percentage?: number }
  boxOffice:    SettlementTicketTier[]
  expenses:     SettlementExpense[]
  payout:       PayoutLine[]
  totalDue:     number
  payments:     SettlementPayment[]
  balanceDue?:  number
  notes?:       string
  confirmedAt:  string
}

// What the reader hands the confirm screen: a settlement before it is confirmed and saved.
export type SettlementDraft = Omit<Settlement, 'id' | 'fx' | 'confirmedAt' | 'showIds'> & { showDates: string[] }

// ── Offer sheets (Stage 4, Part 2) ──────────────────────────
// What the manager sends the artist for one offer: a SNAPSHOT of the deal and
// the budget at send time. The artist taps Approve or Pass; nothing confirms
// by itself. Sending again makes the next version and supersedes the earlier ones.
export type OfferSheetStatus = 'sent' | 'approved' | 'passed' | 'superseded' | 'withdrawn'
export type OfferSheetDetail = 'full' | 'summary'

export interface OfferSheetSnapshot {
  artistName:  string
  currency:    Currency
  sentOn?:     string       // the sender's own calendar day when it was sent (YYYY-MM-DD)
  // The offer's own internal notes are deliberately never included.
  offer: {
    venue: string; city: string; country: string; date: string; promoter: string
    guarantee: number; door?: number; buyout?: number
    terms?: OfferTerms
  }
  // Always present; a summary sheet carries nothing but these (and no per-line detail).
  totals: { gross: number; soundLights: number; production: number; commissions: number; net: number }
  // Full breakdown only.
  lines?:        { section: BudgetSection; label: string; amount: number }[]
  commissions?:  { label: string; pct: number; base: CommissionBase; flat?: number; amount: number }[]
  budgetNotes?:  string
}

export interface OfferSheet {
  id:            string
  offerId:       string
  version:       number
  status:        OfferSheetStatus
  detail:        OfferSheetDetail
  message?:      string
  snapshot:      OfferSheetSnapshot
  sentAt:        string
  respondedAt?:  string
  responseNote?: string
}

export interface AgentData {
  offers: TourOffer[]
}

export interface LegalData {
  contracts: Contract[]
}

// Shared across every client in the workspace — boilerplate document
// language (NDA, split agreement, etc.) rather than a per-client record.
export interface LegalTemplateClause {
  id:    string
  title: string
  body:  string
}

export interface LegalTemplate {
  id:          string
  key:         string   // stable slug, e.g. 'nda' — used to re-seed defaults without duplicating
  name:        string
  description?: string
  clauses:     LegalTemplateClause[]
  updatedAt:   string
}
