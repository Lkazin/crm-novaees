import test from "node:test";
import assert from "node:assert/strict";
import { isInsideContainer, normalizeLocalServiceUrl } from "./runtime-url";

test("detecta container pelo sentinela /.dockerenv", () => {
  // Nao afirma true/false: o mesmo arquivo roda no host (tsx) e no container
  // (build). O que importa e que a deteccao NAO dependa de DOCKER_CONTAINER,
  // que nunca e definida no compose.
  assert.equal(typeof isInsideContainer(), "boolean");
  const hadEnv = process.env.DOCKER_CONTAINER;
  try {
    process.env.DOCKER_CONTAINER = "true";
    assert.equal(isInsideContainer(), true);
  } finally {
    if (hadEnv === undefined) delete process.env.DOCKER_CONTAINER;
    else process.env.DOCKER_CONTAINER = hadEnv;
  }
});

test("dentro do container NAO reescreve host.docker.internal", () => {
  // Foi exatamente aqui que o QR Code parou de aparecer: a condicao antiga
  // (`win32 || !process.env.DOCKER_CONTAINER`) era sempre true dentro do
  // container, a URL virava 127.0.0.1:8080 e a Evolution ficava inalcancavel.
  if (process.platform !== "win32" || isInsideContainer()) {
    assert.equal(
      normalizeLocalServiceUrl("http://host.docker.internal:8080", "http://127.0.0.1:8080"),
      "http://host.docker.internal:8080"
    );
  }
});

test("remove barra final e usa o fallback quando a env esta vazia", () => {
  assert.equal(normalizeLocalServiceUrl(undefined, "http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.equal(normalizeLocalServiceUrl("", "http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.equal(normalizeLocalServiceUrl("http://x:8080/", "http://127.0.0.1:8080"), "http://x:8080");
});

test("fora do container no Windows, host.docker.internal vira 127.0.0.1", () => {
  // Este e o cenario de `next dev` rodando no host: ali host.docker.internal
  // nao resolve e o servico escuta em 127.0.0.1.
  if (process.platform !== "win32" || isInsideContainer()) return;
  assert.equal(
    normalizeLocalServiceUrl("http://host.docker.internal:8080", "http://127.0.0.1:8080"),
    "http://127.0.0.1:8080"
  );
});

test("mantem URL publica intacta", () => {
  assert.equal(
    normalizeLocalServiceUrl("https://evo.exemplo.com/", "http://127.0.0.1:8080"),
    "https://evo.exemplo.com"
  );
});
