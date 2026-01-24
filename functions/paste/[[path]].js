// Personal Pastebin - Pages Function
// Binding required: KV namespace named "PASTES"

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/paste\/?/, '');
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key"
  };
  
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  // List pastes
  if (path === "api/list" && request.method === "GET") {
    const list = await env.PASTES.list({ limit: 100 });
    const pastes = await Promise.all(
      list.keys.map(async (key) => {
        const meta = await env.PASTES.getWithMetadata(key.name);
        return {
          id: key.name,
          created: key.metadata?.created || "unknown",
          expires: key.metadata?.expires || "never",
          title: key.metadata?.title || "Untitled",
          size: meta.value?.length || 0
        };
      })
    );
    return new Response(JSON.stringify(pastes), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  
  // Create paste
  if ((path === "api/paste" || path === "") && request.method === "POST") {
    const body = await request.text();
    const id = generateId();
    const expires = url.searchParams.get("expires") || "7d";
    const title = url.searchParams.get("title") || "Untitled";
    const syntax = url.searchParams.get("syntax") || "text";
    const expirationSeconds = parseExpiration(expires);
    
    await env.PASTES.put(id, body, {
      expirationTtl: expirationSeconds,
      metadata: {
        created: new Date().toISOString(),
        expires,
        title,
        syntax
      }
    });
    
    const baseUrl = url.origin + "/paste";
    const acceptHeader = request.headers.get("Accept") || "";
    if (acceptHeader.includes("application/json")) {
      return new Response(JSON.stringify({
        id,
        url: `${baseUrl}/${id}`,
        raw: `${baseUrl}/raw/${id}`,
        expires
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } else {
      return new Response(`${baseUrl}/${id}`, {
        headers: { ...corsHeaders, "Content-Type": "text/plain" }
      });
    }
  }
  
  // Raw view
  if (path.startsWith("raw/") && request.method === "GET") {
    const id = path.slice(4);
    const paste = await env.PASTES.get(id);
    if (!paste) {
      return new Response("Paste not found", { status: 404 });
    }
    return new Response(paste, {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
  }
  
  // View paste with syntax highlighting
  if (path && request.method === "GET" && !path.includes("/")) {
    const paste = await env.PASTES.getWithMetadata(path);
    if (!paste.value) {
      return new Response("Paste not found", { status: 404 });
    }
    const html = generateViewer(paste.value, paste.metadata, path, url.origin);
    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
    });
  }
  
  // Delete paste
  if (path && request.method === "DELETE") {
    const apiKey = request.headers.get("X-API-Key");
    if (apiKey !== (env.API_KEY || "your-secret-key-here")) {
      return new Response("Unauthorized", { status: 401 });
    }
    await env.PASTES.delete(path);
    return new Response("Deleted", { headers: corsHeaders });
  }
  
  // Homepage
  if (!path && request.method === "GET") {
    return new Response(generateHomePage(url.origin + "/paste"), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  
  return new Response("Not found", { status: 404 });
}

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function parseExpiration(expires) {
  const units = { m: 60, h: 3600, d: 86400, w: 604800, M: 2592000 };
  const match = expires.match(/^(\d+)([mhdwM])$/);
  if (!match) return 604800;
  return parseInt(match[1]) * units[match[2]];
}

function generateViewer(content, metadata, id, origin) {
  const baseUrl = origin + "/paste";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${metadata?.title || "Paste"} - Personal Pastebin</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a1a; 
      color: #e0e0e0;
    }
    .header { 
      background: #2a2a2a; 
      padding: 1rem; 
      border-bottom: 1px solid #444;
    }
    .meta { 
      display: flex; 
      gap: 2rem; 
      font-size: 0.9rem; 
      color: #999;
    }
    .actions { 
      margin-top: 0.5rem; 
      display: flex; 
      gap: 1rem;
    }
    .btn { 
      background: #3a3a3a; 
      color: #fff; 
      padding: 0.3rem 0.8rem; 
      border-radius: 4px; 
      text-decoration: none;
      font-size: 0.9rem;
      transition: background 0.2s;
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: #4a4a4a; }
    .content { padding: 1.5rem; }
    pre { 
      background: #2d2d2d !important; 
      padding: 1rem !important; 
      border-radius: 6px;
      overflow-x: auto;
    }
    code { font-family: 'SF Mono', Monaco, monospace !important; }
  </style>
</head>
<body>
  <div class="header">
    <h3>${metadata?.title || "Untitled Paste"}</h3>
    <div class="meta">
      <span>Created: ${new Date(metadata?.created || Date.now()).toLocaleString()}</span>
      <span>Expires: ${metadata?.expires || "Never"}</span>
      <span>Syntax: ${metadata?.syntax || "Plain Text"}</span>
    </div>
    <div class="actions">
      <a href="${baseUrl}/raw/${id}" class="btn">View Raw</a>
      <button class="btn" onclick="copyToClipboard()">Copy</button>
      <button class="btn" onclick="copyLink()">Copy Link</button>
    </div>
  </div>
  <div class="content">
    <pre><code class="language-${metadata?.syntax || "text"}">${escapeHtml(content)}</code></pre>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"><\/script>
  <script>
    function copyToClipboard() {
      navigator.clipboard.writeText(${JSON.stringify(content)});
      alert('Copied to clipboard!');
    }
    function copyLink() {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied!');
    }
  <\/script>
</body>
</html>`;
}

function generateHomePage(origin) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Personal Pastebin</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px; 
      margin: 2rem auto; 
      padding: 0 1rem;
      background: #1a1a1a;
      color: #e0e0e0;
    }
    h1 { margin-bottom: 2rem; }
    .section { 
      background: #2a2a2a; 
      padding: 1.5rem; 
      border-radius: 8px; 
      margin-bottom: 1.5rem;
    }
    code { 
      background: #3a3a3a; 
      padding: 0.2rem 0.4rem; 
      border-radius: 3px;
      font-size: 0.9rem;
    }
    pre { 
      background: #1a1a1a; 
      padding: 1rem; 
      overflow-x: auto;
      border-radius: 6px;
    }
    .quick-paste { margin-top: 1.5rem; }
    textarea {
      width: 100%;
      min-height: 200px;
      background: #1a1a1a;
      color: #e0e0e0;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 1rem;
      font-family: 'SF Mono', Monaco, monospace;
      resize: vertical;
    }
    .paste-btn {
      background: #4CAF50;
      color: white;
      padding: 0.8rem 2rem;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      margin-top: 1rem;
    }
    .paste-btn:hover { background: #45a049; }
  </style>
</head>
<body>
  <h1>🚀 Personal Pastebin</h1>
  
  <div class="section">
    <h2>Quick Paste</h2>
    <div class="quick-paste">
      <textarea id="pasteContent" placeholder="Paste your text here..."></textarea>
      <button class="paste-btn" onclick="createPaste()">Create Paste</button>
    </div>
  </div>

  <div class="section">
    <h2>Command Line Usage</h2>
    <pre><code># Quick upload
curl -X POST ${origin} --data-binary @file.txt

# With options
curl -X POST "${origin}?title=MyCode&expires=1d&syntax=javascript" \\
  --data-binary @script.js</code></pre>
  </div>

  <div class="section">
    <h2>API Endpoints</h2>
    <p><strong>POST /paste</strong> - Create paste</p>
    <p><strong>GET /paste/{id}</strong> - View paste with syntax highlighting</p>
    <p><strong>GET /paste/raw/{id}</strong> - Get raw text</p>
    <p><strong>GET /paste/api/list</strong> - List recent pastes</p>
    <p><strong>DELETE /paste/{id}</strong> - Delete paste (requires API key)</p>
  </div>

  <div class="section">
    <h2>Query Parameters</h2>
    <p><code>?expires=</code> - 1h, 1d, 7d (default), 1w, 1M</p>
    <p><code>?title=</code> - Name your paste</p>
    <p><code>?syntax=</code> - javascript, python, json, etc.</p>
  </div>

  <script>
    async function createPaste() {
      const content = document.getElementById('pasteContent').value;
      if (!content) {
        alert('Please enter some text');
        return;
      }
      
      const response = await fetch('${origin}', {
        method: 'POST',
        body: content
      });
      
      const url = await response.text();
      window.location.href = url;
    }
  <\/script>
</body>
</html>`;
}

function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
