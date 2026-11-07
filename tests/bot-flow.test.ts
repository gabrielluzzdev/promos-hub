import { beforeEach, describe, expect, it } from "vitest";
import { handleInbound } from "@/lib/bot/engine";
import { CONSENT_TEXT } from "@/lib/whatsapp/copy";
import { conversation, FakeWhatsApp, MemoryBotStore } from "./helpers/fake-bot";

let store: MemoryBotStore;
let wa: FakeWhatsApp;
const deps = () => ({ store, wa });
const types = () => wa.sent.map((m) => m.type);

beforeEach(() => {
  store = new MemoryBotStore();
  wa = new FakeWhatsApp();
});

describe("fluxo de entrada do bot", () => {
  it("caminho feliz com um toque: lista, links, resumo (3 mensagens)", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    expect(types()).toEqual(["list"]);
    const welcome = wa.sent[0]!;
    expect(welcome.body).toContain(CONSENT_TEXT);
    expect(welcome.type === "list" && welcome.rows.map((r) => r.title)).toEqual([
      "1. Tecnologia e PCs",
      "2. Games",
      "3. Casa e Decoração",
      "4. Moda e Calçados",
      "5. Livros e Papelaria",
      "6. Beleza e Cuidados",
      "7. Todas",
    ]);
    expect(store.users.size).toBe(0); // só cria quando escolhe

    await handleInbound(c.list("cat:c-games"), deps());
    expect(types()).toEqual(["list", "buttons"]);
    const links = wa.sent[1]!;
    expect(links.body).toContain("https://wa.me/ch/geral");
    expect(links.body).toContain("https://wa.me/ch/games");
    expect(links.body).not.toContain("https://wa.me/ch/tec");
    expect(links.body).toContain("toque no sino 🔔");
    expect(links.type === "buttons" && links.buttons.map((b) => b.title)).toEqual(["Adicionar categoria", "Pronto"]);
    expect(store.consents).toEqual([{ userId: "u1", version: "v1", text: CONSENT_TEXT }]);

    await handleInbound(c.button("btn:done"), deps());
    expect(types()).toEqual(["list", "buttons", "text"]);
    expect(wa.sent[2]!.body).toContain("Suas categorias: Games");
    expect(wa.sent[2]!.body).toContain("CATEGORIAS");
    expect(store.log.filter((l) => l.direction === "out")).toHaveLength(3);
  });

  it("aceita números digitados: '1,3,5'", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.text("1,3,5"), deps());
    expect(types()).toEqual(["list", "buttons"]);
    expect([...store.prefs.get("u1")!].sort()).toEqual(["c-casa", "c-livros", "c-tec"]);
    const body = wa.sent[1]!.body;
    expect(body).toContain("ch/tec");
    expect(body).toContain("ch/casa");
    expect(body).toContain("ch/livros");
  });

  it.each(["1 3 5", "1, 3 e 5", " 1;3;5 "])("interpreta '%s' como 1, 3 e 5", async (typed) => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.text(typed), deps());
    expect([...store.prefs.get("u1")!].sort()).toEqual(["c-casa", "c-livros", "c-tec"]);
  });

  it("'todas' escolhe as 6 categorias", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.text("Todas"), deps());
    expect(store.prefs.get("u1")!.size).toBe(6);
  });

  it("'Adicionar categoria' duas vezes: lista só o que falta e msg 2 só com links novos", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.list("cat:c-games"), deps());
    await handleInbound(c.button("btn:add"), deps());
    const firstAdd = wa.sent[2]!;
    expect(firstAdd.type).toBe("list");
    expect(firstAdd.type === "list" && firstAdd.rows.map((r) => r.id)).not.toContain("cat:c-games");
    expect(firstAdd.type === "list" && firstAdd.rows).toHaveLength(5);

    await handleInbound(c.list("cat:c-tec"), deps());
    const secondLinks = wa.sent[3]!;
    expect(secondLinks.body).toContain("ch/tec");
    expect(secondLinks.body).not.toContain("ch/games");
    expect(secondLinks.body).not.toContain("ch/geral");

    await handleInbound(c.button("btn:add"), deps());
    const secondAdd = wa.sent[4]!;
    expect(secondAdd.type === "list" && secondAdd.rows).toHaveLength(4);

    await handleInbound(c.list("cat:c-moda"), deps());
    await handleInbound(c.button("btn:done"), deps());

    expect(types()).toEqual(["list", "buttons", "list", "buttons", "list", "buttons", "text"]);
    expect(wa.sent[6]!.body).toContain("Tecnologia e PCs, Games, Moda e Calçados");
  });

  it("SAIR apaga a pessoa, registra a saída anônima e confirma", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.list("cat:c-games"), deps());
    await handleInbound(c.button("btn:done"), deps());
    await handleInbound(c.text("sair"), deps());

    expect(types()).toEqual(["list", "buttons", "text", "text"]);
    expect(wa.sent[3]!.body).toContain("seus dados foram apagados");
    expect(store.users.size).toBe(0);
    expect(store.prefs.size).toBe(0);
    expect(store.sessions.size).toBe(0);
    expect(store.consents).toHaveLength(0);
    expect(store.optouts).toEqual(["command"]);
    expect(store.log.every((l) => l.userId === null)).toBe(true);
  });

  it("texto desconhecido de quem já está cadastrado vai para a caixa, sem resposta", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.list("cat:c-games"), deps());
    await handleInbound(c.button("btn:done"), deps());
    const before = wa.sent.length;

    await handleInbound(c.text("vocês têm cupom da Amazon?"), deps());
    expect(wa.sent.length).toBe(before);
    expect(store.inbox).toEqual([
      { userId: "u1", waMessageId: expect.any(String), text: "vocês têm cupom da Amazon?" },
    ]);
  });

  it("texto desconhecido de número novo recebe a lista de boas-vindas", async () => {
    const c = conversation();
    await handleInbound(c.text("bom dia"), deps());
    expect(types()).toEqual(["list"]);
    expect(store.inbox).toHaveLength(0);
  });

  it("webhook repetido (mesmo wa_message_id) é processado uma vez só", async () => {
    const c = conversation();
    const first = c.text("quero");
    await handleInbound(first, deps());
    await handleInbound(first, deps());
    expect(types()).toEqual(["list"]);
    expect(store.log.filter((l) => l.direction === "in")).toHaveLength(1);
  });

  it("comandos ignoram maiúsculas e acentos", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.list("cat:c-games"), deps());
    await handleInbound(c.text("  Ajúda! "), deps());
    expect(wa.sent.at(-1)!.body).toContain("SAIR");
    await handleInbound(c.text("pausar"), deps());
    expect(store.users.get("u1")!.status).toBe("paused");
  });

  it("CATEGORIAS marca as escolhidas e tocar alterna", async () => {
    const c = conversation();
    await handleInbound(c.text("quero"), deps());
    await handleInbound(c.list("cat:c-games"), deps());
    await handleInbound(c.text("CATEGORIAS"), deps());
    const list = wa.sent.at(-1)!;
    expect(list.type).toBe("list");
    const games = list.type === "list" ? list.rows.find((r) => r.id === "cat:c-games") : undefined;
    expect(games?.description).toContain("Escolhida");

    await handleInbound(c.list("cat:c-games"), deps());
    expect(store.prefs.get("u1")!.has("c-games")).toBe(false);
    expect(wa.sent.at(-1)!.body).toContain("Removida: Games");

    await handleInbound(c.list("cat:c-beleza"), deps());
    expect(store.prefs.get("u1")!.has("c-beleza")).toBe(true);
    expect(wa.sent.at(-1)!.body).toContain("ch/beleza");
  });

  it("entrada por anúncio guarda a origem e o ctwa_clid", async () => {
    const c = conversation();
    await handleInbound({ ...c.text("quero"), referral: { ctwaClid: "clid-1" } }, deps());
    await handleInbound({ ...c.list("cat:c-games"), referral: { ctwaClid: "clid-1" } }, deps());
    const user = [...store.users.values()][0]!;
    expect(user.source).toBe("ad");
    expect(user.ctwaClid).toBe("clid-1");
  });
});
