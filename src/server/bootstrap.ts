import type { ClientRpcMethod } from '../shared/protocol.js';

export async function readWorkspaceBootstrap(
  request: (method: ClientRpcMethod, params: unknown) => Promise<unknown>
) {
  const read = async (method: ClientRpcMethod, params: unknown) => {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        request(method, params),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Initial metadata is not ready.')), 1500);
        })
      ]);
    } finally {
      clearTimeout(timer!);
    }
  };
  const [threads, models, projects] = await Promise.allSettled([
    read('thread/list', {
      limit: 200, sortKey: 'updated_at', sortDirection: 'desc',
      useStateDbOnly: true, modelProviders: [], archived: false
    }),
    read('model/list', { limit: 100, includeHidden: false }),
    read('project/list', { limit: 200 })
  ]);
  return {
    threads: threads.status === 'fulfilled' ? threads.value : null,
    models: models.status === 'fulfilled' ? models.value : null,
    projects: projects.status === 'fulfilled' ? projects.value : null
  };
}
