# 🚀 Como lançar uma nova versão

Este projeto publica uma **release no GitHub** e gera o **APK Android** automaticamente
sempre que uma tag no formato `v*` é enviada para o repositório.

O fluxo é:

```text
git tag v1.1.0  ──►  GitHub Actions  ──►  EAS Build (APK)
                         │
                         └──►  GitHub Release (tag + notas + APK anexado)
```

O APK anexado é o mesmo arquivo que o app baixa em **Ajustes → Verificar atualizações**
no Android. As notas da release também aparecem nessa tela.

O workflow fica em [`.github/workflows/release.yml`](.github/workflows/release.yml).

---

## 1. Configuração inicial (fazer uma vez)

### 1.1. Repositório no GitHub

O projeto precisa estar em um repositório do GitHub com o GitHub Actions habilitado.

Confirme também que o repositório usado pelo app está correto em
[`src/config/app.ts`](src/config/app.ts) (ou defina `EXPO_PUBLIC_GITHUB_REPO=owner/repo`).
É esse repositório que a tela de atualizações consulta.

### 1.2. Token do Expo (secret `EXPO_TOKEN`)

O build roda nos servidores do **EAS Build**, então o GitHub precisa de um token da sua
conta Expo:

1. Acesse <https://expo.dev/settings/access-tokens>.
2. Clique em **Create token**, dê um nome (ex.: `github-actions`) e copie o valor.
3. No GitHub, abra **Settings → Secrets and variables → Actions**.
4. Clique em **New repository secret**.
5. Nome: `EXPO_TOKEN`  
   Valor: o token copiado.

> ⚠️ O token pertence à conta que é dona do projeto no EAS. Se o build falhar com erro de
> permissão, confira se o `projectId` em `app.json` pertence a essa conta.

### 1.3. Permissão de escrita do GitHub Actions

Em **Settings → Actions → General → Workflow permissions**, selecione
**Read and write permissions** e salve. O workflow já declara `contents: write`, mas a
configuração do repositório precisa permitir que o `GITHUB_TOKEN` publique releases.

### 1.4. EAS configurado

O projeto já tem `eas.json` e `projectId` em `app.json`. Se precisar refazer o vínculo:

```bash
npx eas-cli@latest init
```

> ℹ️ O workflow usa o profile **`preview`**, que gera um **APK** instalável. Esse profile não
> tem `autoIncrement`, então o `versionCode` do Android pode se repetir entre releases. Isso
> não impede a instalação por cima de uma versão anterior, mas se você quiser um `versionCode`
> novo a cada release, adicione `"autoIncrement": true` ao profile `preview` no `eas.json`.

---

## 2. Checklist para lançar uma versão

Sempre faça o lançamento a partir da branch principal (`main`), com o código já testado.

### Passo 1 — Defina a versão (opcional)

A versão do build é definida pela **tag**: antes de compilar, o workflow atualiza o
`app.json` no runner com a versão da tag. Portanto, **não é obrigatório** editar o
`app.json` a cada release.

Ainda assim, é recomendado commitar a versão para o repositório ficar coerente com a tag.
Edite [`app.json`](app.json):

```json
{
  "expo": {
    "version": "1.1.0"
  }
}
```

Se quiser, atualize também [`package.json`](package.json) — o workflow não usa esse valor,
mas ajuda a manter os dois iguais.

> ⚠️ O workflow altera o `app.json` apenas no runner, não no seu commit. O EAS inclui
> alterações não commitadas por padrão (`cli.requireCommit` não está definido no
> `eas.json`). Se você ativar `requireCommit: true`, commite a versão antes de criar a tag,
> porque o build passará a usar apenas o commit.

Use **SemVer** (`MAIOR.MENOR.CORREÇÃO`):

| Mudança | Exemplo | Quando usar |
| ------- | ------- | ----------- |
| MAIOR | `2.0.0` | Mudanças incompatíveis / grande reformulação |
| MENOR | `1.1.0` | Novas funcionalidades compatíveis |
| CORREÇÃO | `1.1.1` | Correções de bugs |

### Passo 2 — Teste localmente

```bash
npm ci
npm run typecheck
```

Se mexeu em algo nativo ou em dependências, vale gerar um build de teste:

```bash
npx eas-cli@latest build --platform android --profile preview
```

### Passo 3 — Commit e push

```bash
git add .
git commit -m "chore: release v1.1.0"
git push origin main
```

### Passo 4 — Crie e envie a tag

Use uma **tag anotada** (o GitHub Actions dispara no push da tag):

```bash
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

Também funciona enviar tudo de uma vez:

```bash
git push origin main --follow-tags
```

> 💡 `--follow-tags` envia apenas tags anotadas. Por isso prefira `git tag -a`.

### Passo 5 — Acompanhe o workflow

1. Abra o repositório no GitHub.
2. Vá em **Actions → Release**.
3. O job **Compilar APK e publicar release** vai:
   - sincronizar a versão do `app.json` com a tag;
   - rodar `npm ci` e `npm run typecheck`;
   - compilar o APK no EAS (`profile: preview`);
   - baixar o APK;
   - criar a release com o APK anexado.

Quando terminar, a release estará em **Releases** com o arquivo
`mybufunfa-v1.1.0.apk`.

### Passo 6 — Confira a release (opcional)

- As notas são geradas automaticamente a partir dos commits desde a release anterior.
  Se quiser, edite a descrição da release no GitHub — o app exibe esse texto.
- Marque a release como **latest** (o GitHub faz isso automaticamente para releases
  publicadas que não são pré-release).
- Abra o app em **Ajustes → Verificar atualizações** para confirmar que a nova versão
  aparece.

---

## 3. Versões de teste (pré-release)

Tags com hífen são publicadas como **pré-release** e **não** aparecem em
`/releases/latest`, ou seja, o app não vai oferecê-las como atualização:

```bash
git tag -a v1.2.0-beta.1 -m "Beta 1.2.0"
git push origin v1.2.0-beta.1
```

Nesse caso, o workflow define a **versão base** (`1.2.0`) no `app.json`, sem o sufixo
`-beta.1`. Não é preciso editar manualmente.

Isso é útil para testar o workflow sem afetar quem usa a versão estável.

---

## 4. Se algo der errado

### O workflow falhou antes do build

Corrija o problema, faça commit e **recrie a tag**:

```bash
# apaga a tag local
git tag -d v1.1.0

# apaga a tag remota
git push origin :refs/tags/v1.1.0

# depois de corrigir e commitar
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

### O workflow falhou durante/depois do build

Se for um problema passageiro (fila do EAS, rede etc.), use **Re-run jobs** na própria
execução do Actions. Se o código precisar mudar, recrie a tag como acima.

Se a release já tiver sido criada e você só quer reenviar o APK, o workflow já trata isso:
em uma nova execução ele usa `gh release upload --clobber` para substituir o arquivo.

### A tag tem formato inválido

O workflow aceita tags no formato `v1.2.3` ou `v1.2.3-beta.1`. Se a parte numérica não
estiver no formato `X.Y.Z`, o build falha com:

```text
Tag inválida: v1.2. Use o formato v1.2.3 ou v1.2.3-beta.1.
```

Crie a tag no formato correto.

---

## 5. Problemas comuns

| Problema | Causa provável | Solução |
| -------- | -------------- | ------- |
| `EXPO_TOKEN` inválido / 401 | Secret ausente, expirado ou de outra conta | Gere outro token em expo.dev e atualize o secret |
| `eas.json` reclama da versão do EAS CLI | `cli.version` exige uma versão mais nova | O workflow usa `eas-version: latest`; se persistir, ajuste `cli.version` no `eas.json` |
| Build falha por configuração nativa | Dependência ou plugin incompatível | Rode `npx expo-doctor` e teste um build local |
| Release não é criada | Falta permissão de escrita | Confira **Settings → Actions → General → Workflow permissions** |
| App não encontra a atualização | Repositório errado em `src/config/app.ts` | Ajuste `GITHUB_OWNER`/`GITHUB_REPO` ou `EXPO_PUBLIC_GITHUB_REPO` |
| APK não aparece na release | Asset não foi baixado/enviado | Veja os logs dos passos **Obter URL do APK** e **Baixar APK** |

---

## 6. Build manual (alternativa)

Se precisar gerar um APK sem passar pelo GitHub Actions:

```bash
npx eas-cli@latest build --platform android --profile preview
```

Depois baixe o APK pelo link exibido no terminal e anexe manualmente em uma release
criada no GitHub. O nome do arquivo pode ser qualquer um terminado em `.apk` — o app
procura o primeiro asset com essa extensão.

> ℹ️ O workflow compila apenas **Android (APK)**. Builds de iOS exigem credenciais da
> Apple e podem ser adicionados depois como um job separado.
