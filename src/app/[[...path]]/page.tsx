// This is the app entry point — it just loads the client-side app shell.
// One page answers every address of the app (/today, /company, /artists/...): the shell reads the address and opens that screen
// (see components/layout/UrlSync.tsx). The sign-in pages and the server routes have their own folders and are not caught here.
import { StudioApp } from '@/components/StudioApp'

export default function Page() {
  return <StudioApp />
}
