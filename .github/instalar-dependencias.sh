#!/usr/bin/env bash
# Instala as dependências no GitHub Actions (agente.yml e testes.yml) sem baixar o binário do ffmpeg-static.
#
# Por quê: o script de instalação do ffmpeg-static baixa o ffmpeg de um release do GitHub; quando esse download
# falha, o `npm ci` inteiro falha e a rodada do agente se perde (05/11/2026, "Failed to download ffmpeg b6.1.1").
# No Actions esse binário nem é usado: agente/ferramentas/binarios.mjs usa o ffmpeg do sistema (apt) quando ele
# está no PATH. No PC, `npm install`/`npm ci` normais continuam baixando o ffmpeg-static, como antes.
#
# Como: `npm ci --ignore-scripts` (nenhum script de instalação roda) e depois `npm rebuild esbuild`, o único outro
# pacote com script que importa (msedge-tts tem o script desligado em "allowScripts"). Se um dia entrar outro
# pacote com script de instalação, ele precisa ser acrescentado no rebuild abaixo.
#
# Nova tentativa: até 3 vezes, com espera de 20 s e 40 s, só para falha que pode ser passageira (rede, registro do
# npm fora). Erro permanente (lockfile que não bate com o package.json, pacote ou versão que não existe, engine
# incompatível) falha na hora, com a mensagem do npm.
set -uo pipefail

PERMANENTE='npm (error|ERR!) code (EUSAGE|ETARGET|E404|EBADENGINE|ERESOLVE|ENOTSUP|EJSONPARSE)'
log="$(mktemp)"

for tentativa in 1 2 3; do
  if npm ci --ignore-scripts --no-audit --no-fund 2> "$log"; then
    cat "$log" >&2
    npm rebuild esbuild
    exit $?
  fi
  cat "$log" >&2
  if grep -Eq "$PERMANENTE" "$log"; then
    echo "::error::npm ci falhou por um erro que não se resolve tentando de novo (veja a mensagem acima)."
    exit 1
  fi
  if [ "$tentativa" -lt 3 ]; then
    echo "::warning::npm ci falhou (tentativa $tentativa de 3). Tentando de novo em $((tentativa * 20)) s."
    sleep $((tentativa * 20))
  fi
done

echo "::error::npm ci falhou 3 vezes seguidas. Veja as mensagens acima."
exit 1
