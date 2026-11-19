import { ResearchLab } from './lib/lab.js';
import { registerResearchTools } from './lib/tools.js';

export const name = 'sci-sideband';
export const ENDPOINT = 'sci-sideband/call';
export const ROUTE_PATH = `/api/${ENDPOINT}`;

const BAD_REQUEST = 'gateway/bad-request';
const INTERNAL = 'internal';

function note(ctx, level, message) {
  const text = `sci-sideband: ${message}`;
  try {
    if (ctx && ctx.logger && typeof ctx.logger[level] === 'function') {
      ctx.logger[level](text);
      return;
    }
  } catch {
    /* logger unavailable */
  }
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

function carry(rpcId, result) {
  return { type: 'server-response', rpcId, result };
}

function fail(rpcId, code, message, details) {
  return carry(rpcId, { ok: false, error: { code, message, details: details || {} } });
}

function rpcIdOf(body) {
  return body && typeof body.rpcId === 'string' && body.rpcId ? body.rpcId : 'invalid-request';
}

async function envelopeResult(lab, body) {
  if (!body || typeof body !== 'object' || body.type !== 'client-request') {
    return fail(rpcIdOf(body), BAD_REQUEST, 'invalid client-request message');
  }
  if (body.method !== ENDPOINT) {
    return fail(rpcIdOf(body), BAD_REQUEST, `method does not match endpoint ${ENDPOINT}`);
  }
  try {
    const result = await lab.handle(body.payload);
    return carry(body.rpcId, result);
  } catch (error) {
    return fail(body.rpcId, INTERNAL, String((error && error.message) || error));
  }
}

function pick(ctx, name) {
  try {
    if (ctx && typeof ctx.get === 'function') {
      const value = ctx.get(name);
      if (value) return value;
    }
    if (ctx && ctx[name]) return ctx[name];
  } catch {
    /* service not ready */
  }
  return undefined;
}

export function apply(ctx, config = {}) {
  const lab = new ResearchLab(ctx, config);
  lab.ready().catch((error) => note(ctx, 'error', `数据存储初始化失败：${(error && error.message) || error}`));

  let toolsRegistered = false;
  let routeRegistered = false;

  const registerTools = (tools) => {
    if (toolsRegistered) return;
    toolsRegistered = true;
    try {
      const dispose = registerResearchTools(tools, lab, ctx.logger);
      ctx.effect(() => dispose, 'sci-sideband tools');
    } catch (error) {
      note(ctx, 'warn', `工具注册失败：${(error && error.message) || error}`);
    }
  };

  const registerRoute = (connection) => {
    if (routeRegistered) return;
    routeRegistered = true;
    const registry = connection && connection.fetch;
    if (!registry || typeof registry.register !== 'function') {
      note(ctx, 'warn', `当前载体没有 connection.fetch.register，面板端点 ${ROUTE_PATH} 未注册`);
      return;
    }
    const route = {
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json(fail('invalid-request', BAD_REQUEST, 'body is not JSON'));
        }
        return Response.json(await envelopeResult(lab, body));
      },
    };
    try {
      ctx.effect(() => registry.register(route), `sci-sideband — ${ROUTE_PATH}`);
      note(ctx, 'info', `面板数据端点已注册：${ROUTE_PATH}`);
    } catch (error) {
      note(ctx, 'error', `面板端点注册失败：${(error && error.message) || error}`);
    }
  };

  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (serviceCtx) => {
      const tools = pick(serviceCtx, 'tools') || pick(ctx, 'tools');
      if (!tools || typeof tools.register !== 'function') {
        note(ctx, 'warn', 'tools 服务不可用，research_* 工具未注册');
        return;
      }
      registerTools(tools);
    });
    ctx.inject(['connection'], (serviceCtx) => {
      const connection = pick(serviceCtx, 'connection') || pick(ctx, 'connection');
      if (connection) registerRoute(connection);
    });
  } else {
    const tools = pick(ctx, 'tools');
    if (tools && typeof tools.register === 'function') registerTools(tools);
    const connection = pick(ctx, 'connection');
    if (connection) registerRoute(connection);
  }

  note(ctx, 'info', `科研探索边带已启动，数据目录 ${lab.dir}`);
}
