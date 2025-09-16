// b.js
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

const room = 'smoketest-3fptu7' // TODO: get from a.js output
console.log('ROOM:', room)

const doc = new Y.Doc()
const provider = new WebsocketProvider(
  'wss://web-deckbuilding-yredis.fly.dev', room, doc, { 
    WebSocketPolyfill: ws,
    params: { yauth: token }
  }
)

const ymap = doc.getMap('state')
ymap.observeDeep(() => console.log('B sees:', ymap.toJSON()))
provider.on('status', e => console.log('B status:', e.status))
provider.on('sync',   isSynced => {
  console.log('B sync:', isSynced)
  if (isSynced) {
    const n = (ymap.get('counter') ?? 0) + 1
    ymap.set('counter', n)
    ymap.set('note', 'hello from B')
  }
})