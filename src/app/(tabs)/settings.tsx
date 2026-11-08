import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View, type AlertButton } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScreenScroll } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GITHUB_RELEASES_URL } from '@/config/app';
import { useFinance } from '@/context/FinanceContext';
import { useTheme } from '@/context/ThemeContext';
import {
  clearAllData,
  exportBackup,
  importBackup,
  importTransactionsCsv,
} from '@/db/backup';
import { pickTextFile, shareTextFile } from '@/services/dataTransfer';
import {
  checkForUpdates,
  getCurrentVersion,
  openRelease,
  type UpdateInfo,
} from '@/services/updates';
import { spacing } from '@/theme';
import type { ThemePreference } from '@/types/models';
import {
  buildTransactionsCsv,
  parseBackup,
  parseTransactionsCsv,
  serializeBackup,
} from '@/utils/backup';
import { todayISO } from '@/utils/format';

type BusyAction = 'export-json' | 'export-csv' | 'import' | 'clear' | 'update' | null;

function showInfo(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function showError(error: unknown, title = 'Não foi possível concluir') {
  const message = error instanceof Error ? error.message : 'Tente novamente.';
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel: string,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function SettingsScreen() {
  const { colors, preference, setPreference, refreshPreference } = useTheme();
  const { categories, transactions, reload } = useFinance();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [updateStatus, setUpdateStatus] = useState('');

  const handleExportJson = async () => {
    setBusy('export-json');
    try {
      const payload = await exportBackup();
      await shareTextFile({
        filename: `controle-de-gastos-backup-${todayISO()}.json`,
        content: serializeBackup(payload),
        mimeType: 'application/json',
        dialogTitle: 'Salvar backup dos dados',
        uti: 'public.json',
      });
    } catch (error) {
      showError(error, 'Falha ao exportar o backup');
    } finally {
      setBusy(null);
    }
  };

  const handleExportCsv = async () => {
    setBusy('export-csv');
    try {
      const payload = await exportBackup();
      await shareTextFile({
        filename: `controle-de-gastos-lancamentos-${todayISO()}.csv`,
        content: buildTransactionsCsv(payload.transactions),
        mimeType: 'text/csv',
        dialogTitle: 'Salvar planilha de lançamentos',
        uti: 'public.comma-separated-values-text',
      });
    } catch (error) {
      showError(error, 'Falha ao exportar a planilha');
    } finally {
      setBusy(null);
    }
  };

  const runImport = async () => {
    setBusy('import');
    try {
      const picked = await pickTextFile();
      if (!picked) return;

      const name = picked.name.toLocaleLowerCase('pt-BR');
      const isJson =
        name.endsWith('.json') ||
        picked.mimeType === 'application/json' ||
        picked.mimeType === 'text/json';
      const isCsv =
        name.endsWith('.csv') ||
        picked.mimeType === 'text/csv' ||
        picked.mimeType === 'text/comma-separated-values';

      if (isJson) {
        const payload = parseBackup(picked.content);
        const result = await importBackup(payload);
        await reload();
        await refreshPreference();
        showInfo(
          'Backup restaurado',
          `${result.categories} categorias e ${result.transactions} lançamentos importados.`,
        );
        return;
      }

      if (isCsv) {
        const rows = parseTransactionsCsv(picked.content);
        const result = await importTransactionsCsv(rows);
        await reload();
        showInfo(
          'Lançamentos importados',
          `${result.transactions} lançamentos importados. ${result.categories} categoria(s) criada(s).`,
        );
        return;
      }

      throw new Error('Escolha um arquivo .json (backup completo) ou .csv (lançamentos).');
    } catch (error) {
      showError(error, 'Falha ao importar');
    } finally {
      setBusy(null);
    }
  };

  const handleImport = () => {
    confirmAction(
      'Importar dados?',
      'O arquivo substituirá os dados atuais. Recomendamos exportar um backup antes. Deseja continuar?',
      () => {
        void runImport();
      },
      'Importar',
    );
  };

  const runClear = async () => {
    setBusy('clear');
    try {
      await clearAllData();
      await reload();
      showInfo(
        'Dados apagados',
        'Os lançamentos e categorias foram removidos. As categorias padrão foram recriadas.',
      );
    } catch (error) {
      showError(error, 'Falha ao apagar os dados');
    } finally {
      setBusy(null);
    }
  };

  const handleClear = () => {
    confirmAction(
      'Apagar todos os dados?',
      'Isso remove todos os lançamentos e categorias e restaura as categorias padrão. O tema é mantido. Recomendamos exportar um backup antes.',
      () => {
        confirmAction(
          'Tem certeza?',
          'Esta ação não pode ser desfeita.',
          () => {
            void runClear();
          },
          'Apagar definitivamente',
        );
      },
      'Continuar',
    );
  };

  const showUpdateAlert = (info: UpdateInfo) => {
    if (Platform.OS === 'web') {
      const message = `Versão ${info.version} disponível.\n\n${
        info.notes || 'Abra a página de releases para baixar a nova versão.'
      }`;
      if (window.confirm(`${message}\n\nAbrir a página da release?`)) {
        void openRelease(info).catch((error) => showError(error, 'Falha ao abrir a release'));
      }
      return;
    }

    const buttons: AlertButton[] = [
      { text: 'Depois', style: 'cancel' },
      {
        text: 'Ver release',
        onPress: () => {
          void openRelease(info).catch((error) => showError(error, 'Falha ao abrir a release'));
        },
      },
    ];

    if (Platform.OS === 'android' && info.apkUrl) {
      buttons.push({
        text: 'Baixar APK',
        onPress: () => {
          void openRelease(info, true).catch((error) => showError(error, 'Falha ao abrir o APK'));
        },
      });
    }

    Alert.alert(
      `Atualização disponível: ${info.version}`,
      info.notes
        ? info.notes.slice(0, 800)
        : 'Toque em "Ver release" para abrir a página de download.',
      buttons,
    );
  };

  const handleCheckUpdates = async () => {
    setBusy('update');
    setUpdateStatus('');
    try {
      const info = await checkForUpdates();
      if (!info) {
        const message = `Você já está na versão mais recente (${getCurrentVersion()}).`;
        setUpdateStatus(message);
        showInfo('Tudo atualizado', message);
        return;
      }
      setUpdateStatus(`Versão ${info.version} disponível.`);
      showUpdateAlert(info);
    } catch (error) {
      setUpdateStatus('Não foi possível verificar agora.');
      showError(error, 'Falha ao verificar atualizações');
    } finally {
      setBusy(null);
    }
  };

  const handleOpenReleases = () => {
    void Linking.openURL(GITHUB_RELEASES_URL).catch((error) =>
      showError(error, 'Falha ao abrir o GitHub'),
    );
  };

  return (
    <ScreenScroll>
      <AppText variant="title">Ajustes</AppText>

      <Card style={styles.card}>
        <View style={styles.cardTitle}>
          <Ionicons name="color-palette-outline" size={18} color={colors.primary} />
          <AppText variant="subtitle">Aparência</AppText>
        </View>
        <AppText variant="caption">Escolha como o aplicativo deve exibir as cores.</AppText>
        <SegmentedControl<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ]}
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardTitle}>
          <Ionicons name="server-outline" size={18} color={colors.primary} />
          <AppText variant="subtitle">Dados e backup</AppText>
        </View>
        <AppText variant="caption">
          Seus dados ficam apenas neste aparelho. Exporte um backup antes de trocar de celular
          ou apagar tudo.
        </AppText>
        <View style={styles.actions}>
          <Button
            label={busy === 'export-json' ? 'Exportando...' : 'Exportar backup (JSON)'}
            icon="download-outline"
            variant="secondary"
            fullWidth
            disabled={busy !== null}
            onPress={handleExportJson}
          />
          <Button
            label={busy === 'export-csv' ? 'Exportando...' : 'Exportar planilha (CSV)'}
            icon="document-text-outline"
            variant="secondary"
            fullWidth
            disabled={busy !== null}
            onPress={handleExportCsv}
          />
          <Button
            label={busy === 'import' ? 'Importando...' : 'Importar dados'}
            icon="cloud-upload-outline"
            variant="secondary"
            fullWidth
            disabled={busy !== null}
            onPress={handleImport}
          />
          <Button
            label={busy === 'clear' ? 'Apagando...' : 'Apagar todos os dados'}
            icon="trash-outline"
            variant="danger"
            fullWidth
            disabled={busy !== null}
            onPress={handleClear}
          />
        </View>
        <AppText variant="caption">
          O JSON restaura categorias, lançamentos e preferências. O CSV contém apenas os
          lançamentos e pode ser aberto no Excel.
        </AppText>
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardTitle}>
          <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
          <AppText variant="subtitle">Atualizações</AppText>
        </View>
        <InfoRow label="Versão instalada" value={getCurrentVersion()} last />
        <Button
          label={busy === 'update' ? 'Verificando...' : 'Verificar atualizações'}
          icon="refresh-outline"
          fullWidth
          disabled={busy !== null}
          onPress={handleCheckUpdates}
        />
        {updateStatus ? (
          <AppText variant="caption" center>
            {updateStatus}
          </AppText>
        ) : null}
        <Button
          label="Abrir releases no GitHub"
          icon="logo-github"
          variant="ghost"
          fullWidth
          onPress={handleOpenReleases}
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardTitle}>
          <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
          <AppText variant="subtitle">Meus dados</AppText>
        </View>
        <InfoRow label="Categorias cadastradas" value={String(categories.length)} />
        <InfoRow label="Lançamentos no mês" value={String(transactions.length)} />
        <InfoRow label="Armazenamento" value="Local (SQLite) • Offline" last />
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardTitle}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <AppText variant="subtitle">Sobre o aplicativo</AppText>
        </View>
        <AppText variant="body">
          Controle de Gastos é um aplicativo offline-first para registrar receitas e despesas
          do dia a dia e acompanhar o orçamento da família.
        </AppText>
        <AppText variant="caption">
          Versão {getCurrentVersion()} • Dados 100% locais
        </AppText>
      </Card>
    </ScreenScroll>
  );
}

function InfoRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.infoRow,
        { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
      ]}>
      <AppText variant="body" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actions: { gap: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
});
