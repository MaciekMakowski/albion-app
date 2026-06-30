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


const actualStaticMiddleware = express.static(clientDistPath, { index: false });


const staticFrontendMiddleware = (req, res, next) => {
  // Logowanie przed przekazaniem do express.static
  console.log(`Static Middleware Wrapper: Attempting to serve static file for path: ${req.path}`);

  // Flaga, aby sprawdzić, czy express.static obsłużył żądanie
  let handledByStatic = false;
  const originalEnd = res.end; // Zachowaj oryginalną funkcję res.end
  res.end = function (...args) {
    if (res.statusCode >= 200 && res.statusCode < 300) { // Sprawdź, czy status wskazuje na sukces
        console.log(`Static Middleware Wrapper: File ${req.path} SERVED with status ${res.statusCode} and Content-Type: ${res.getHeader('Content-Type') || 'unknown'}`);
        handledByStatic = true;
    } else {
        console.log(`Static Middleware Wrapper: File ${req.path} handled, but with status ${res.statusCode}`);
    }
    originalEnd.apply(this, args); // Wywołaj oryginalne res.end
  };

  // Przekaż żądanie do właściwego express.static middleware
  actualStaticMiddleware(req, res, (err) => {
    // Ta callback jest wywoływana TYLKO jeśli express.static NIE obsłużył żądania (czyli wywołał next)
    if (!handledByStatic) { // Upewnij się, że nie został obsłużony wcześniej
        if (err) {
            console.error(`Static Middleware Wrapper: Error in express.static for path: ${req.path}`, err);
        } else {
            console.log(`Static Middleware Wrapper: File ${req.path} NOT FOUND by express.static, calling next()`);
        }
    }
    next(err); // Przekaż dalej błąd lub po prostu wywołaj next
  });
};

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
