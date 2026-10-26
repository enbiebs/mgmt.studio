// What a phone reads when someone adds the app to their home screen: its name, icon and colours. It opens full screen, like an app.
// (There is no offline mode: it still needs a connection, as the website does.)
import type { MetadataRoute } from 'next'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: PRODUCT_TAGLINE,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfaf7',   // the page colour (--color-canvas in globals.css), shown while it opens
    theme_color: '#fbfaf7',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
