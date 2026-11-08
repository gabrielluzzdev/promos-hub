import type { InboundMessage, WhatsAppSender } from "@/lib/whatsapp/types";
import * as copy from "@/lib/whatsapp/copy";
import { parseCommand, parsePick } from "./commands";
import type { BotCategory, BotStore, BotUser, SessionState } from "./store";

export interface BotDeps {
  store: BotStore;
  wa: WhatsAppSender;
}

const GENERAL_SLUG = "geral";
const ROW_ALL = "cat:all";
const BTN_ADD = "btn:add";
const BTN_DONE = "btn:done";

interface Catalog {
  general: BotCategory | null;
  /** Categorias escolhíveis (sem a geral), numeradas a partir de 1 na ordem. */
  choosable: (BotCategory & { number: number })[];
}

async function loadCatalog(store: BotStore): Promise<Catalog> {
  const all = await store.listCategories();
  const sorted = [...all].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    general: sorted.find((c) => c.slug === GENERAL_SLUG) ?? null,
    choosable: sorted.filter((c) => c.slug !== GENERAL_SLUG).map((c, i) => ({ ...c, number: i + 1 })),
  };
}

/** Converte uma resposta (linha da lista ou números digitados) em ids de categoria. */
interface Picked {
  ids: string[];
  /** Escolheu "Todas". */
  all: boolean;
}

function resolvePick(message: InboundMessage, catalog: Catalog): Picked | null {
  const everything = { ids: catalog.choosable.map((c) => c.id), all: true };
  if (message.kind === "list_reply" && message.replyId) {
    if (message.replyId === ROW_ALL) return everything;
    if (message.replyId.startsWith("cat:")) {
      const id = message.replyId.slice(4);
      return catalog.choosable.some((c) => c.id === id) ? { ids: [id], all: false } : null;
    }
    return null;
  }
  if (message.kind === "text" && message.text) {
    const pick = parsePick(message.text);
    if (!pick) return null;
    if (pick.kind === "all") return everything;
    if (pick.numbers.includes(catalog.choosable.length + 1)) return everything;
    const ids = pick.numbers
      .map((n) => catalog.choosable.find((c) => c.number === n)?.id)
      .filter((id): id is string => Boolean(id));
    return ids.length ? { ids, all: false } : null;
  }
  return null;
}

/**
 * Processa uma mensagem recebida. Toda resposta acontece dentro da janela de 24 h
 * aberta pela própria mensagem. Texto livre de quem já está cadastrado vai para a
 * caixa de entrada, sem resposta automática.
 */
export async function handleInbound(message: InboundMessage, deps: BotDeps): Promise<void> {
  const { store } = deps;
  if (!(await store.markProcessed(message.id))) return;

  const user = await store.findUserByWaId(message.from);
  await store.logMessage({ userId: user?.id ?? null, direction: "in", kind: message.kind, billable: false });

  const send = sender(deps, message.from, user?.id ?? null);
  const catalog = await loadCatalog(store);

  if (!user) {
    await handleUnknown(message, deps, catalog, send);
    return;
  }

  await store.touchUser(user.id, message.receivedAt);
  await handleRegistered(message, user, deps, catalog, send);
}

type Send = ReturnType<typeof sender>;

function sender(deps: BotDeps, to: string, userId: string | null) {
  const log = (kind: string) =>
    deps.store.logMessage({ userId, direction: "out", kind, billable: true });
  return {
    async text(kind: string, body: string) {
      await deps.wa.sendText(to, body);
      await log(kind);
    },
    async list(kind: string, body: string, rows: { id: string; title: string; description?: string }[]) {
      await deps.wa.sendList(to, { body, button: copy.LIST_BUTTON, rows });
      await log(kind);
    },
    async buttons(kind: string, body: string) {
      await deps.wa.sendButtons(to, {
        body,
        buttons: [
          { id: BTN_ADD, title: copy.BUTTON_ADD },
          { id: BTN_DONE, title: copy.BUTTON_DONE },
        ],
      });
      await log(kind);
    },
  };
}

async function sendWelcome(catalog: Catalog, send: Send) {
  const rows = catalog.choosable.map((c) => ({ id: `cat:${c.id}`, title: copy.rowTitle(c) }));
  rows.push({ id: ROW_ALL, title: `${catalog.choosable.length + 1}. ${copy.ALL_ROW_TITLE}` });
  await send.list("welcome_list", copy.welcomeBody(), rows);
}

async function handleUnknown(message: InboundMessage, deps: BotDeps, catalog: Catalog, send: Send) {
  const picked = resolvePick(message, catalog);
  if (!picked) {
    await sendWelcome(catalog, send);
    return;
  }
  const pickIds = picked.ids;

  // Escolher = consentir. Só agora a pessoa existe no banco.
  const ctwaClid = message.referral?.ctwaClid ?? null;
  const user = await deps.store.createUserWithConsent({
    waId: message.from,
    source: message.referral ? "ad" : "link",
    ctwaClid,
    consentVersion: copy.CONSENT_VERSION,
    consentText: copy.CONSENT_TEXT,
    at: message.receivedAt,
  });
  await deps.store.addPreferences(user.id, pickIds);
  await deps.store.setSession(user.id, { state: "awaiting_more" });

  const sendAsUser = sender(deps, message.from, user.id);
  await sendAsUser.buttons(
    "links",
    copy.linksBody({ general: catalog.general, chosen: catalog.choosable.filter((c) => pickIds.includes(c.id)) }),
  );
}

async function handleRegistered(message: InboundMessage, user: BotUser, deps: BotDeps, catalog: Catalog, send: Send) {
  const { store } = deps;
  const session = (await store.getSession(user.id)) ?? { state: "idle" as SessionState };
  const chosen = await store.getPreferenceIds(user.id);

  // Comandos valem a qualquer momento.
  if (message.kind === "text" && message.text) {
    const command = parseCommand(message.text);
    if (command === "SAIR") {
      await store.deleteUser(user.id);
      await store.logOptout("command");
      // A pessoa já não existe: log sem vínculo.
      await sender(deps, message.from, null).text("goodbye", copy.goodbyeBody());
      return;
    }
    if (command === "PAUSAR") {
      await store.setStatus(user.id, "paused");
      await store.setSession(user.id, { state: "idle" });
      await send.text("paused", copy.pausedBody());
      return;
    }
    if (command === "AJUDA") {
      await send.text("help", copy.helpBody());
      return;
    }
    if (command === "CATEGORIAS" || command === "QUERO") {
      await sendToggleList(catalog, chosen, send);
      await store.setSession(user.id, { state: "toggling" });
      return;
    }
  }

  // Botões "Adicionar categoria" e "Pronto".
  if (message.kind === "button_reply") {
    if (message.replyId === BTN_ADD) {
      const remaining = catalog.choosable.filter((c) => !chosen.includes(c.id));
      if (remaining.length === 0) {
        await sendSummary(catalog, chosen, send);
        await store.setSession(user.id, { state: "idle" });
        return;
      }
      await send.list(
        "add_list",
        copy.addMoreBody(),
        remaining.map((c) => ({ id: `cat:${c.id}`, title: copy.rowTitle(c) })),
      );
      await store.setSession(user.id, { state: "picking_more" });
      return;
    }
    if (message.replyId === BTN_DONE) {
      await sendSummary(catalog, chosen, send);
      await store.setSession(user.id, { state: "idle" });
      return;
    }
  }

  const picked = resolvePick(message, catalog);
  const pickIds = picked?.ids ?? null;
  const typedPick = message.kind === "text";

  // Lista de CATEGORIAS: tocar alterna ("Todas" só adiciona).
  if (picked && pickIds && session.state === "toggling") {
    const added = pickIds.filter((id) => !chosen.includes(id));
    const removed = picked.all ? [] : pickIds.filter((id) => chosen.includes(id));
    if (added.length) await store.addPreferences(user.id, added);
    for (const id of removed) await store.removePreference(user.id, id);
    if (user.status === "paused" && added.length) await store.setStatus(user.id, "active");
    await send.text(
      "toggled",
      copy.toggledBody({
        added: catalog.choosable.filter((c) => added.includes(c.id)),
        removed: catalog.choosable.filter((c) => removed.includes(c.id)),
      }),
    );
    return;
  }

  // Escolha durante o cadastro (lista tocada a qualquer momento, ou números digitados durante o fluxo).
  const inSignupFlow = session.state === "awaiting_more" || session.state === "picking_more";
  if (pickIds && (!typedPick || inSignupFlow)) {
    const newIds = pickIds.filter((id) => !chosen.includes(id));
    if (newIds.length) await store.addPreferences(user.id, newIds);
    if (user.status === "paused") await store.setStatus(user.id, "active");
    await store.setSession(user.id, { state: "awaiting_more" });
    await send.buttons(
      "links",
      copy.linksBody({ general: null, chosen: catalog.choosable.filter((c) => newIds.includes(c.id)) }),
    );
    return;
  }

  // Qualquer outra coisa: caixa de entrada, sem resposta automática.
  if (message.kind === "text" && message.text) {
    await store.saveInbox({
      userId: user.id,
      waMessageId: message.id,
      text: message.text,
      receivedAt: message.receivedAt,
    });
  }
}

async function sendSummary(catalog: Catalog, chosen: string[], send: Send) {
  const names = catalog.choosable.filter((c) => chosen.includes(c.id)).map((c) => c.name);
  await send.text("summary", copy.summaryBody(names));
}

async function sendToggleList(catalog: Catalog, chosen: string[], send: Send) {
  await send.list(
    "categories_list",
    copy.toggleBody(),
    catalog.choosable.map((c) => ({
      id: `cat:${c.id}`,
      title: copy.rowTitle(c),
      description: copy.toggleRowDescription(chosen.includes(c.id)),
    })),
  );
}
