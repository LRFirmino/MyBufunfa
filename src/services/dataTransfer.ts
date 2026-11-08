import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export interface ShareTextFileOptions {
  filename: string;
  content: string;
  mimeType: string;
  dialogTitle: string;
  /** UTI do iOS (ex.: `public.json`). */
  uti?: string;
}

export interface PickedTextFile {
  name: string;
  content: string;
  mimeType: string | null;
}

/**
 * Salva um texto em um arquivo temporário e abre o compartilhamento nativo.
 * Na web, dispara o download direto pelo navegador.
 */
export async function shareTextFile({
  filename,
  content,
  mimeType,
  dialogTitle,
  uti,
}: ShareTextFileOptions): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('O compartilhamento não está disponível neste dispositivo.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle,
    UTI: uti,
  });
}

/** Abre o seletor de arquivos e devolve o conteúdo textual do arquivo escolhido. */
export async function pickTextFile(): Promise<PickedTextFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/json',
      'text/json',
      'text/csv',
      'text/comma-separated-values',
      'text/plain',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  let content: string;

  if (Platform.OS === 'web') {
    if (asset.file) {
      content = await asset.file.text();
    } else {
      const response = await fetch(asset.uri);
      content = await response.text();
    }
  } else {
    content = await new File(asset.uri).text();
  }

  return {
    name: asset.name,
    content,
    mimeType: asset.mimeType ?? null,
  };
}
