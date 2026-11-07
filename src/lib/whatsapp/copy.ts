/**
 * Todos os textos do bot ficam aqui, para o time editar sem mexer no fluxo.
 * Limites do WhatsApp: título de linha da lista até 24 caracteres, descrição até 72,
 * botão de resposta até 20, texto do botão da lista até 20.
 */

export interface CopyCategory {
  number: number;
  name: string;
  channelUrl: string | null;
}

export const CONSENT_VERSION = "v1";
export const CONSENT_TEXT = "Ao escolher, você aceita receber ofertas. Para sair, mande SAIR.";

export const LIST_BUTTON = "Ver categorias";
export const ALL_ROW_TITLE = "Todas";
export const BUTTON_ADD = "Adicionar categoria";
export const BUTTON_DONE = "Pronto";

const BELL_LINE = "Abra cada canal e toque no sino 🔔 no topo para receber na hora.";
const MISSING_LINK = "(link em breve)";

const channelLine = (c: { name: string; channelUrl: string | null }) => `• ${c.name}: ${c.channelUrl ?? MISSING_LINK}`;

export const rowTitle = (c: CopyCategory) => `${c.number}. ${c.name}`.slice(0, 24);

/** msg 1: boas-vindas + consentimento + lista. */
export const welcomeBody = () =>
  ["Oi! 👋 Aqui você escolhe as categorias de ofertas que quer receber.", CONSENT_TEXT, "Pode responder com os números, ex.: 1, 3, 5"].join("\n\n");

/** msg 2: link do Geral (só no primeiro envio) + um link por canal escolhido. */
export const linksBody = (input: { general: { name: string; channelUrl: string | null } | null; chosen: CopyCategory[] }) => {
  const lines: string[] = ["Seus canais:"];
  if (input.general) lines.push(channelLine(input.general));
  for (const c of input.chosen) lines.push(channelLine(c));
  lines.push("", BELL_LINE);
  return lines.join("\n");
};

/** msg 3: lista sem as categorias já escolhidas. */
export const addMoreBody = () => "Qual categoria você quer adicionar?";

/** msg 4: resumo + comandos. */
export const summaryBody = (names: string[]) =>
  [`Tudo certo! Suas categorias: ${names.length ? names.join(", ") : "nenhuma"}.`, commandsText()].join("\n\n");

export const commandsText = () =>
  [
    "Comandos (é só mandar a palavra):",
    "CATEGORIAS – ver e mudar suas categorias",
    "PAUSAR – pausar os avisos",
    "SAIR – sair e apagar seus dados",
    "AJUDA – ver esta lista",
  ].join("\n");

export const toggleBody = () => "Toque numa categoria para adicionar ou tirar.";
export const toggleRowDescription = (selected: boolean) =>
  selected ? "✅ Escolhida · toque para tirar" : "Toque para adicionar";

export const toggledBody = (input: { added: CopyCategory[]; removed: CopyCategory[] }) => {
  const lines: string[] = [];
  if (input.added.length) {
    lines.push("Adicionada:");
    for (const c of input.added) lines.push(channelLine(c));
    lines.push("", BELL_LINE);
  }
  if (input.removed.length) {
    if (lines.length) lines.push("");
    lines.push(`Removida: ${input.removed.map((c) => c.name).join(", ")}.`);
    lines.push("Para parar de ver as ofertas dela, abra o canal e toque em Deixar de seguir.");
  }
  return lines.join("\n");
};

export const pausedBody = () =>
  [
    "Pausado. ✋",
    "Para não receber notificações, abra cada canal, toque no nome dele e ative Silenciar.",
    "Quando quiser voltar, é só tirar o silêncio.",
  ].join("\n");

export const goodbyeBody = () =>
  [
    "Pronto, seus dados foram apagados.",
    "Para deixar de ver as ofertas, abra cada canal e toque em Deixar de seguir.",
    "Se quiser voltar, é só mandar QUERO.",
  ].join("\n");

export const helpBody = () => commandsText();
