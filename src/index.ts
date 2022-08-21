import Update, { UpdateApiResponse, UpdateApiRetcode } from './update'

export interface Env {
	Cache: KVNamespace
	HOST_URL: string
}

const update = new Update()

async function handleRequest(req: Request, rsp: UpdateApiResponse, env: Env) {
	const { pathname } = new URL(req.url)

	update.setEnv(env)

	switch (pathname) {
		case '/version': {
			const version = await update.getVersion()
			if (version == null) {
				rsp.code = UpdateApiRetcode.NO_DATA
				rsp.msg = 'No data'
				break
			}
			rsp.data = { v: version }
			break
		}
		case '/get': {
			const content = await update.getContent()
			if (content == null) {
				rsp.code = UpdateApiRetcode.NO_DATA
				rsp.msg = 'No data'
				break
			}
			rsp.data = content
			break
		}
		default: {
			rsp.code = UpdateApiRetcode.UNKNOWN
			rsp.msg = 'API Not found'
			rsp.data = { pathname }
		}
	}
}

export default {
	async fetch(
		req: Request,
		env: Env,
		_ctx: ExecutionContext
	): Promise<Response> {
		const rsp: UpdateApiResponse = {
			code: UpdateApiRetcode.SUCC,
			msg: 'OK'
		}

		try {
			await handleRequest(req, rsp, env)
		} catch (err) {
			rsp.code = UpdateApiRetcode.UNKNOWN
			rsp.msg = (<Error>err).message
			rsp.data = undefined
		}

		return new Response(JSON.stringify(rsp), { headers: { 'content-type': 'application/json' } })
	}
}