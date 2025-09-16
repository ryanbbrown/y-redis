import * as uws from 'uws'
import * as env from 'lib0/environment'
import * as logging from 'lib0/logging'
import * as error from 'lib0/error'
import * as jwt from 'lib0/crypto/jwt'
import * as ecdsa from 'lib0/crypto/ecdsa'
import * as json from 'lib0/json'
import { registerYWebsocketServer } from '../src/ws.js'
import * as promise from 'lib0/promise'

const wsServerPublicKey = await ecdsa.importKeyJwk(json.parse(env.ensureConf('auth-public-key')))
// const wsServerPrivateKey = await ecdsa.importKeyJwk(json.parse(env.ensureConf('auth-private-key')))

class YWebsocketServer {
  /**
   * @param {uws.TemplatedApp} app
   */
  constructor (app) {
    this.app = app
  }

  async destroy () {
    this.app.close()
  }
}

/**
 * @param {Object} opts
 * @param {number} opts.port
 * @param {import('./storage.js').AbstractStorage} opts.store
 * @param {string} [opts.redisPrefix]
 * @param {string} opts.checkPermCallbackUrl
 * @param {(room:string,docname:string,client:import('./api.js').Api)=>void} [opts.initDocCallback] -
 * this is called when a doc is accessed, but it doesn't exist. You could populate the doc here.
 * However, this function could be called several times, until some content exists. So you need to
 * handle concurrent calls.
 */
export const createYWebsocketServer = async ({
  redisPrefix = 'y',
  port,
  store,
  checkPermCallbackUrl,
  initDocCallback = () => {}
}) => {
  console.log('[y-redis] Starting WebSocket server on port', port)
  checkPermCallbackUrl += checkPermCallbackUrl.slice(-1) !== '/' ? '/' : ''
  const app = uws.App({})
  
  // Add auth token endpoint that proxies to auth server
  app.get('/auth/token', async (res, req) => {
    console.log('[y-redis] Auth token request received')
    res.onAborted(() => {
      console.log('[y-redis] Auth token request aborted')
    })
    try {
      const response = await fetch('http://127.0.0.1:5173/auth/token')
      const token = await response.text()
      res.cork(() => {
        res.writeStatus('200 OK')
        res.writeHeader('Content-Type', 'text/plain')
        res.end(token)
      })
    } catch (error) {
      console.error('[y-redis] Error fetching auth token:', error)
      res.cork(() => {
        res.writeStatus('500 Internal Server Error')
        res.end('Error generating token')
      })
    }
  })

  // Add a basic HTTP route for debugging
  app.get('/*', (res, req) => {
    console.log('[y-redis] HTTP request received:', req.getUrl())
    res.writeStatus('200 OK').end('Y-Redis WebSocket Server - Use WebSocket connection')
  })
  
  await registerYWebsocketServer(app, '/:room', store, async (req) => {
    console.log('[y-redis] WebSocket auth check for room:', req.getParameter(0))
    const room = req.getParameter(0)
    const headerWsProtocol = req.getHeader('sec-websocket-protocol')
    const [, , token] = /(^|,)yauth-(((?!,).)*)/.exec(headerWsProtocol) ?? [null, null, req.getQuery('yauth')]
    if (token == null) {
      throw new Error('Missing Token')
    }
    // verify that the user has a valid token
    console.log('[y-redis] Verifying JWT token at server time:', new Date().toISOString())
    console.log('[y-redis] Server timestamp:', Math.floor(Date.now() / 1000))
    const { payload: userToken } = await jwt.verifyJwt(wsServerPublicKey, token)
    if (userToken.yuserid == null) {
      throw new Error('Missing userid in user token!')
    }
    const permUrl = new URL(`${room}/${userToken.yuserid}`, checkPermCallbackUrl)
    try {
      const perm = await fetch(permUrl).then(req => req.json())
      return { hasWriteAccess: perm.yaccess === 'rw', room, userid: perm.yuserid || '' }
    } catch (e) {
      console.error('Failed to pull permissions from', { permUrl })
      throw e
    }
  }, { redisPrefix, initDocCallback })

  await promise.create((resolve, reject) => {
    app.listen('0.0.0.0', port, (token) => {
      if (token) {
        console.log('[y-redis] Listening to port', port)
        logging.print(logging.GREEN, '[y-redis] Listening to port ', port)
        resolve()
      } else {
        const err = error.create('[y-redis] Failed to lisen to port ' + port)
        reject(err)
        throw err
      }
    })
  })
  return new YWebsocketServer(app)
}
