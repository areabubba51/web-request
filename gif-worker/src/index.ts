export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)

      if (url.pathname !== "/resolve") {
        return new Response("Use /resolve?url=TENOR_LINK", { status: 200 })
      }

      const tenorUrl = url.searchParams.get("url")
      if (!tenorUrl) {
        return json({ ok: false, error: "Missing url" }, 400)
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(tenorUrl)
      } catch {
        return json({ ok: false, error: "Invalid URL: " + tenorUrl }, 400)
      }

      const pageResp = await fetch(parsedUrl.toString(), {
        headers: { "user-agent": "Mozilla/5.0" }
      })

      if (!pageResp.ok) {
        return json({ ok: false, error: "Failed to fetch page: " + pageResp.status }, 502)
      }

	const html = await pageResp.text()

	const constOgImage = extractMeta(html, "og:image")
	const constTwitterImage = extractMetaName(html, "twitter:image")

	const preview = firstStatic([
		constOgImage,
	constTwitterImage,
	extractStaticImage(html)
	])

	const mp4 =
		extractMeta(html, "og:video") ||
		extractMeta(html, "og:video:url")

	const gif = extractGif(html)

      return json({
        ok: true,
        preview,
        mp4,
        gif
      })
    } catch (err: any) {
      return json({ ok: false, error: err?.message || String(err) }, 500)
    }
  }
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    }
  })
}

function firstStatic(values: string[]): string {
  for (const value of values) {
    if (value && !/\.gif($|\?)/i.test(value)) {
      return value
    }
  }
  return ""
}

function extractMeta(html: string, property: string): string {
  const match = html.match(
    new RegExp(
      `<meta[^>]+property=["']${escapeRegex(property)}["'][^>]+content=["']([^"']+)`,
      "i"
    )
  )
  return match ? decodeHtml(match[1]) : ""
}

function extractMetaName(html: string, name: string): string {
  const match = html.match(
    new RegExp(
      `<meta[^>]+name=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)`,
      "i"
    )
  )
  return match ? decodeHtml(match[1]) : ""
}

function extractGif(html: string): string {
  const match = html.match(/https:\/\/media\d*\.tenor\.com\/[^"' ]+\.gif/i)
  return match ? match[0] : ""
}

function extractStaticImage(html: string): string {
  const patterns = [
    /https:\/\/media\d*\.tenor\.com\/[^"' ]+\.(png|jpe?g|webp)/i,
    /https:\/\/c\.tenor\.com\/[^"' ]+\.(png|jpe?g|webp)/i
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return match[0]
  }

  return ""
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}