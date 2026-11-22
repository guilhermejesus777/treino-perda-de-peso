# Projeto Perda de Peso 🔥

App pessoal (PWA) com o plano **Treino ABC 3x por semana**, diário de refeições e **análise de comida por foto com IA**.

**Acesse:** https://guilhermejesus777.github.io/treino-perda-de-peso/

Funciona no navegador e pode ser instalado no celular como um aplicativo, com tela cheia e acesso offline (a análise de foto precisa de internet).

---

## Funcionalidades

- **Treinos A/B/C** (segunda, quarta e sexta) com todos os exercícios do plano original.
- **Cronômetro de descanso** com presets de 30s, 1min, 1min30 e 2min, alarme sonoro/vibração no fim — e **cronômetro livre** para medir o treino inteiro.
- Marcação exercício por exercício, progresso da semana e sequência de semanas completas.
- **Diário de refeições** com calorias, proteína, carboidrato e gordura.
- **Análise de comida por foto**: tira a foto pelo celular, a IA estima as gramas, calorias e macros, e você ajusta as gramas antes de salvar.
- **Registro de peso** com gráfico de evolução.
- Metas diárias configuráveis.
- Dados salvos no próprio aparelho (`localStorage`). Nada vai para servidores nossos.
- Instalável como app (PWA) no Android e no iPhone.

---

## Como ativar a análise por foto (1 minuto, grátis)

A análise usa a API do **Google Gemini** com uma chave sua. A chave fica salva somente no seu navegador — não fica no código nem no GitHub.

1. Acesse **https://aistudio.google.com/apikey** e entre com sua conta Google.
2. Clique em **Create API key** (criar chave) e copie a chave (começa com `AIza...`).
3. Abra o app → **Ajustes** (ícone de engrenagem) → cole em **Chave da API do Google Gemini**.
4. Salve. Pronto: em **Comida**, toque em **Tirar foto**, escolha o prato e a análise começa sozinha.

Observações:

- O plano gratuito do Gemini tem limites de uso por minuto/dia. Se aparecer “limite atingido”, aguarde e tente de novo.
- A IA só estima. Pratos com molhos, óleo escondido ou porções muito grandes podem variar bastante. Ajuste as gramas no resultado antes de salvar.
- Se quiser trocar o modelo de visão, preencha **Modelo** nos ajustes (ex.: `gemini-2.5-flash`). Vazio = escolha automática.
- A foto é enviada **direto do seu navegador para o Google**, usando a sua chave. Este site não tem servidor e não recebe nada.

---

## Instalar no celular

**Android (Chrome):** abra o site → menu ⋮ → **Instalar aplicativo** (ou “Adicionar à tela inicial”).

**iPhone/iPad (Safari):** abra o site → botão **Compartilhar** → **Adicionar à Tela de Início** → **Adicionar**.

Depois abra pelo ícone **Perda de Peso**. O app abre em tela cheia e os dados continuam salvos.

A instalação também aparece no app em **Progresso → App no celular**.

---

## Rodar/editar localmente

É um site estático puro (HTML, CSS e JS), sem build. Basta servir a pasta com qualquer servidor HTTP:

```bash
npx serve .
# ou
python -m http.server 4173
```

Depois abra `http://localhost:4173`.

> Abrir o `index.html` direto pelo `file://` não registra o service worker (PWA), mas o restante funciona.

### Estrutura

```
index.html            interface
styles.css            visual (tema escuro/laranja)
app.js                treinos, diário, IA, gráfico e PWA
manifest.webmanifest  configuração do app instalável
sw.js                 cache offline
icons/                ícones do app
.nojekyll             desativa o Jekyll no GitHub Pages
```

### Publicar uma atualização

```bash
git add .
git commit -m "minha alteração"
git push
```

O GitHub Pages publica sozinho em ~1 minuto. Se mudar `index.html`, `styles.css` ou `app.js`, **aumente a versão** no link do CSS/JS no `index.html`, na lista `ASSETS` e no `CACHE` do `sw.js` (ex.: `?v=4` → `?v=5`, `ppp-v4` → `ppp-v5`). Assim os celulares que já instalaram o app baixam a versão nova na hora.

---

## Aviso

Este app é uma ferramenta pessoal de organização. As estimativas de comida são aproximadas e o plano de treino não substitui acompanhamento médico, nutricional ou de educação física. Ajuste cargas e exercícios à sua condição.
