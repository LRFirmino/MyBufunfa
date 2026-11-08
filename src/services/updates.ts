import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { GITHUB_OWNER, GITHUB_RELEASES_URL, GITHUB_REPO } from '@/config/app';

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  apkUrl: string | null;
  notes: string;
  publishedAt: string | null;
}

/** Versão instalada do app (funciona no Expo Go, dev client e build de produção). */
export function getCurrentVersion(): string {
  return Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '1.0.0';
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

/** Compara duas versões semânticas simples. Retorna > 0 se `a` for mais nova. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }
  return 0;
}

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}

/** Busca a release mais recente publicada no GitHub. */
export async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'controle-de-gastos-app',
        },
        signal: controller.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('A verificação demorou demais. Tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new Error(
      'Nenhuma release publicada (ou repositório não encontrado). Confira o repositório configurado em src/config/app.ts.',
    );
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error('Limite de consultas do GitHub atingido. Tente novamente mais tarde.');
  }
  if (!response.ok) {
    throw new Error(`O GitHub respondeu com o código ${response.status}.`);
  }

  const release = (await response.json()) as GitHubRelease;
  const version = release.tag_name?.replace(/^v/i, '').trim();
  if (!version) {
    throw new Error('A release mais recente não tem uma tag de versão.');
  }

  const apk = release.assets?.find((asset) =>
    asset.name?.toLocaleLowerCase('pt-BR').endsWith('.apk'),
  );

  return {
    version,
    releaseUrl: release.html_url ?? GITHUB_RELEASES_URL,
    apkUrl: apk?.browser_download_url ?? null,
    notes: release.body ?? '',
    publishedAt: release.published_at ?? null,
  };
}

/** Retorna a release mais nova apenas se ela for maior que a versão instalada. */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const latest = await fetchLatestRelease();
  if (!latest) return null;
  return compareVersions(latest.version, getCurrentVersion()) > 0 ? latest : null;
}

/** Abre a página da release ou, no Android, o APK anexado. */
export async function openRelease(info: UpdateInfo, preferApk = false): Promise<void> {
  const url = preferApk && info.apkUrl ? info.apkUrl : info.releaseUrl;
  await Linking.openURL(url);
}
