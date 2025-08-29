// a.js
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import ws from 'ws' // Node WS polyfill

import * as jwt from 'lib0/crypto/jwt'
import * as ecdsa from 'lib0/crypto/ecdsa'
import * as json from 'lib0/json'

const authPrivateKey = await ecdsa.importKeyJwk(json.parse(`private_key_here`))
// Create a test token with a test user ID
// lib0's getUnixTime() returns milliseconds, not seconds like standard JWT
const now = Date.now() // Use milliseconds directly
const payload = {
    yuserid: 'test-user-12345',
    exp: now + (24 * 60 * 60 * 1000), // expires in 24 hours (in milliseconds)
    iat: now, // issued at (in milliseconds)
    nbf: now - (60 * 1000) // not before (1 minute ago in milliseconds)
}

console.log('Token issued at:', new Date(now).toISOString())
console.log('Token expires at:', new Date(payload.exp).toISOString())

const token = await jwt.encodeJwt(authPrivateKey, payload)
console.log('Generated token:', token.substring(0, 50) + '...')

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