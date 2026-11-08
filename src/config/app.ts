/**
 * Configurações centrais do aplicativo.
 *
 * Para trocar o repositório usado pelo "Verificar atualizações", altere
 * `GITHUB_OWNER`/`GITHUB_REPO` abaixo ou defina a variável de ambiente
 * `EXPO_PUBLIC_GITHUB_REPO` no formato `owner/repositorio`.
 */
export const APP_NAME = 'Controle de Gastos';

const repositoryFromEnv = process.env.EXPO_PUBLIC_GITHUB_REPO;

export const GITHUB_OWNER = repositoryFromEnv?.split('/')[0] || 'LRFirmino';
export const GITHUB_REPO = repositoryFromEnv?.split('/')[1] || 'mybufunfa';

export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
