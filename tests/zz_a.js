// a.js
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import ws from 'ws' // Node WS polyfill

// Fetch token from the auth server
console.log('Fetching token from auth server...')
let token
try {
  const response = await fetch('https://web-deckbuilding-yredis.fly.dev/auth/token')
  if (!response.ok) {
    throw new Error(`Failed to fetch token: ${response.status} ${response.statusText}`)
  }
  token = await response.text()
  console.log('Successfully fetched token:', token.substring(0, 50) + '...')
} catch (error) {
  console.error('Error fetching token:', error)
  process.exit(1)
}

const room = 'smoketest-' + Math.random().toString(36).slice(2, 8)
console.log('ROOM:', room)

const doc = new Y.Doc()
// Generate a test token (you'll need to replace this with a fresh token)

const provider = new WebsocketProvider(
  'wss://web-deckbuilding-yredis.fly.dev', room, doc, { 
    WebSocketPolyfill: ws,
    params: { yauth: token }
  }
)

const ymap = doc.getMap('state')
ymap.observeDeep(() => console.log('A sees:', ymap.toJSON()))

provider.on('status', e => console.log('A status:', e.status)) // connected/disconnected
provider.on('sync',   isSynced => console.log('A sync:', isSynced))

// when connected, set a value and bump a counter
provider.on('status', e => {
  if (e.status === 'connected') {
    const n = (ymap.get('counter') ?? 0) + 1
    ymap.set('counter', n)
    ymap.set('note', 'hello from A')
  }
})