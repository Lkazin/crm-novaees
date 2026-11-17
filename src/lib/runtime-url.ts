import { existsSync } from "node:fs";

/**
 * Detecta se o processo roda dentro de um container Docker/Podman.
 *
 * `DOCKER_CONTAINER` nunca e definida no docker-compose deste projeto, entao
 * qualquer checagem baseada so nela da `false` dentro do container. A prova
 * confiavel e o arquivo sentinela: /.dockerenv (Docker) ou /run/.containerenv
 * (Podman).
 */
export function isInsideContainer(): boolean {
  if ((process.env.DOCKER_CONTAINER ?? "").trim() === "true") return true;
  try {
    return existsSync("/.dockerenv") || existsSync("/run/.containerenv");
  } catch {
    return false;
  }
}

/**
 * Normaliza uma URL de servico local vinda do ambiente.
 *
 * `host.docker.internal` e o nome correto DENTRO do container. Fora dele
 * (rodando `next dev` no Windows, por exemplo) esse nome nao resolve, e ali o
 * servico escuta em 127.0.0.1.
 *
 * A condicao anterior era `win32 || !process.env.DOCKER_CONTAINER`: como
 * DOCKER_CONTAINER nunca e definida, o segundo termo era sempre true e a URL
 * era reescrita para 127.0.0.1 DENTRO do container, onde 127.0.0.1 e o proprio
 * container. Resultado: "evolution_unavailable" (503) e nenhum QR Code.
 */
export function normalizeLocalServiceUrl(rawUrl: string | undefined, fallback: string): string {
  // `??` nao cobre string vazia: se a env estiver definida como "", a URL sairia
  // vazia e o fetch falharia em silencio. O fallback vale para ausente E vazia.
  const source = (rawUrl ?? "").trim() || fallback;
  let url = source.replace(/\/$/, "");
  if (url.includes("host.docker.internal") && process.platform === "win32" && !isInsideContainer()) {
    url = url.replace("host.docker.internal", "127.0.0.1");
  }
  return url;
}
