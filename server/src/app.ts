import { ENVIRONMENT } from '@/core/config'
import { initializeDI } from '@/di/bindings'
import { fail } from '@/shared/utils/response'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import fastify from 'fastify'
import fs from 'fs'
import path from 'path'
import 'reflect-metadata'

;(async () => {
  // Inject dependencies
  initializeDI()

  // Fastify server instance
  const app = fastify({ logger: ENVIRONMENT === 'development' })

  app.register(fastifyCookie)
  app.register(fastifyCors, {
    origin: true,
    credentials: true,
  })

  // Serve static files (e.g., compiled frontend)
  app.register(fastifyStatic, {
    root: path.join(__dirname, 'wwwroot'),
    prefix: '/',
  })

  // Dynamic module route loading
  const modulesPath: string = path.join(__dirname, 'modules')
  const modules: string[] = fs.readdirSync(modulesPath)

  for (const moduleName of modules) {
    const routesPath: string = path.join(modulesPath, moduleName, 'routes')
    if (
      fs.existsSync(`${routesPath}.ts`) ||
      fs.existsSync(`${routesPath}.js`)
    ) {
      const routes = await import(routesPath)
      app.register(routes.default, {
        prefix: '/api',
      })
    }
  }

  // Not found handler
  app.setNotFoundHandler((req, res) => {
    if (req.url.startsWith('/api')) {
      return fail(res, 'Not Found', 404)
    }

    return res.sendFile('index.html')
  })

  // Default error handler
  app.setErrorHandler((error: any, req, res) => {
    const status: number = error.statusCode ?? 500
    const message: string =
      status >= 500 ? 'Internal Server Error' : error.message

    return fail(res, message, status, error)
  })

  // Server initialization
  // ToDo: move to server.ts
  const host: string = '0.0.0.0'
  const port: number = Number(process.env.PORT)

  app.listen({ host, port }, (err, address) => {
    if (err) {
      app.log.error(err)
      process.exit(1)
    }

    app.log.info(`Running in ${address}`)
  })
})()
