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

function isDirectImageUrl(url: string) {
  return /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(url)
}

export default {
  async fetch(request: Request): Promise<Response> {
    const reqUrl = new URL(request.url)
    const imageUrl = reqUrl.searchParams.get("url")

    if (!imageUrl) {
      return json({ ok: false, error: "Missing url" }, 400)
    }

    if (!isDirectImageUrl(imageUrl)) {
      return json({ ok: false, error: "Only direct image URLs are supported" }, 400)
    }

    try {
      const upstream = await fetch(imageUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0",
          "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      })

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "")
        return json(
          {
            ok: false,
            error: `Fetch failed: ${upstream.status}`,
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
            error: "Not an image response",
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
        },
        500
      )
    }
  },
}