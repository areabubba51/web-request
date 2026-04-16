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

      const pageResp = await fetch(tenorUrl)
      const html = await pageResp.text()

      const preview = extractMeta(html, "og:image")
      const mp4 = extractMeta(html, "og:video")
      const gif = extractGif(html)

      return json({
        ok: true,
        preview,
        mp4,
        gif
      })
    } catch (err: any) {
      return json({ ok: false, error: err.message }, 500)
    }
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    }
  })
}

function extractMeta(html: string, property: string) {
  const match = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)`)
  )
  return match ? match[1] : ""
}

function extractGif(html: string) {
  const match = html.match(/https:\/\/media\d*\.tenor\.com\/[^"' ]+\.gif/)
  return match ? match[0] : ""
}