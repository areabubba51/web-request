export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)

      if (url.pathname === "/") {
        return json({
          ok: true,
          message: "Tenor resolver worker is running",
          usage: "/resolve?url=https://tenor.com/view/..."
        })
      }

      if (url.pathname !== "/resolve") {
        return json({ ok: false, error: "Not found" }, 404)
      }

      const tenorUrl = url.searchParams.get("url")
      if (!tenorUrl) {
        return json({ ok: false, error: "Missing url query param" }, 400)
      }

      const parsed = safeUrl(tenorUrl)
      if (!parsed) {
        return json({ ok: false, error: "Invalid URL" }, 400)
      }

      const host = parsed.hostname.toLowerCase()
      const allowed =
        host === "tenor.com" ||
        host === "www.tenor.com" ||
        host === "tenor.co" ||
        host.endsWith(".tenor.com")

      if (!allowed) {
        return json({ ok: false, error: "Only Tenor URLs are allowed" }, 400)
      }

      const pageResp = await fetch(parsed.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; RobloxGifResolver/1.0)"
        }
      })

      if (!pageResp.ok) {
        return json(
          {
            ok: false,
            error: "Failed to fetch Tenor page",
            status: pageResp.status
          },
          502
        )
      }

      const html = await pageResp.text()

      const result = {
        ok: true,
        pageUrl: pageResp.url,
        title: firstNonEmpty([
          getMeta(html, "property", "og:title"),
          getMeta(html, "name", "twitter:title"),
          ""
        ]),
        preview: firstNonEmpty([
          getMeta(html, "property", "og:image"),
          getMeta(html, "name", "twitter:image"),
          ""
        ]),
        mp4: firstNonEmpty([
          getMeta(html, "property", "og:video"),
          getMeta(html, "property", "og:video:url"),
          ""
        ]),
        gif: extractDirectGif(html),
      }

      if (!result.preview && !result.mp4 && !result.gif) {
        return json(
          {
            ok: false,
            error: "Could not find usable media on the Tenor page"
          },
          422
        )
      }

      return json(result, 200, {
        "cache-control": "public, max-age=300"
      })
    } catch (err) {
      return json(
        {
          ok: false,
          error: "Worker crashed",
          details: String(err && err.message ? err.message : err)
        },
        500
      )
    }
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      ...extraHeaders,
    },
  })
}

function safeUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function firstNonEmpty(values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") {
      return v.trim()
    }
  }
  return ""
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function getMeta(html, attrName, attrValue) {
  const re = new RegExp(
    `<meta[^>]+${attrName}=["']${escapeRegex(attrValue)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  )
  const match = html.match(re)
  return match ? decodeHtml(match[1]) : ""
}

function extractDirectGif(html) {
  const patterns = [
    /https:\/\/media\d*\.tenor\.com\/[^"'\\\s>]+\.gif/ig,
    /https:\/\/c\.tenor\.com\/[^"'\\\s>]+\.gif/ig,
  ]

  for (const pattern of patterns) {
    const matches = html.match(pattern)
    if (matches && matches.length > 0) {
      return matches[0]
    }
  }

  return ""
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
