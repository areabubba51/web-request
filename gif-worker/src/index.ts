export interface Env {}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  })
}

function normalizeUrl(url: string) {
  url = url.trim()

  // strip spaces
  url = url.replace(/\s+/g, "")

  // Discord cleanup if someone pastes one anyway
  if (/^https:\/\/media\.discordapp\.net\//i.test(url)) {
    url = url.replace(/^https:\/\/media\.discordapp\.net\//i, "https://cdn.discordapp.com/")
  }

  return url
}

export default {
  async fetch(request: Request): Promise<Response> {
    const reqUrl = new URL(request.url)
    let imageUrl = reqUrl.searchParams.get("url")

    if (!imageUrl) {
      return json({ ok: false, error: "Missing url" }, 400)
    }

    imageUrl = normalizeUrl(imageUrl)

    if (!/^https?:\/\//i.test(imageUrl)) {
      return json({ ok: false, error: "URL must start with http or https" }, 400)
    }

    try {
      const upstream = await fetch(imageUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0",
          "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "pragma": "no-cache",
        },
      })

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "")
        return json(
          {
            ok: false,
            error: `Fetch failed: ${upstream.status}`,
            finalUrl: upstream.url || imageUrl,
            body: text.slice(0, 300),
          },
          502
        )
      }

      const contentType = upstream.headers.get("content-type") || ""

      if (!contentType.startsWith("image/")) {
        const text = await upstream.text().catch(() => "")
        return json(
          {
            ok: false,
            error: "Response was not an image",
            finalUrl: upstream.url || imageUrl,
            contentType,
            body: text.slice(0, 300),
          },
          400
        )
      }

      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=3600",
          "access-control-allow-origin": "*",
        },
      })
    } catch (err) {
      return json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Unknown worker error",
          finalUrl: imageUrl,
        },
        500
      )
    }
  },
}