const express = require("express");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const clientDistPath = path.resolve(__dirname, "../../../client/dist/client");
const serverEntryMjsPath = path.resolve(
  __dirname,
  "../../../client/dist/server/entry-server.mjs",
);
const serverEntryJsPath = path.resolve(
  __dirname,
  "../../../client/dist/server/entry-server.js",
);
const clientIndexPath = path.join(clientDistPath, "index.html");

const serverEntryPath = fs.existsSync(serverEntryMjsPath)
  ? serverEntryMjsPath
  : serverEntryJsPath;

const hasFrontendBuildArtifacts =
  fs.existsSync(clientDistPath) &&
  fs.existsSync(clientIndexPath) &&
  fs.existsSync(serverEntryPath);

const staticFrontendMiddleware = hasFrontendBuildArtifacts
  ? express.static(clientDistPath, { index: false })
  : (_req, _res, next) => next();

let cachedRendererModulePromise = null;
let cachedTemplate = null;

async function getServerRendererModule() {
  if (!cachedRendererModulePromise) {
    cachedRendererModulePromise = import(pathToFileURL(serverEntryPath).href);
  }

  return cachedRendererModulePromise;
}

function hasFileExtension(requestPath) {
  return path.extname(requestPath) !== "";
}

async function frontendSsrMiddleware(req, res, next) {
  if (!hasFrontendBuildArtifacts) {
    next();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  if (req.path.startsWith("/api")) {
    next();
    return;
  }

  if (hasFileExtension(req.path)) {
    next();
    return;
  }

  try {
    if (!cachedTemplate) {
      cachedTemplate = fs.readFileSync(clientIndexPath, "utf-8");
    }

    const rendererModule = await getServerRendererModule();
    const render = rendererModule.render;

    if (typeof render !== "function") {
      throw new Error("Brak funkcji render w SSR bundle.");
    }

    const appHtml = render(req.originalUrl || req.url || "/");
    const html = cachedTemplate.replace(
      '<div id="root"></div>',
      `<div id="root">${appHtml}</div>`,
    );

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  staticFrontendMiddleware,
  frontendSsrMiddleware,
};
