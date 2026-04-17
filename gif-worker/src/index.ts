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
  return url.trim().replace(/\s+/g, "")
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
        cf: {
          image: {
            width: 256,
            height: 256,
            fit: "scale-down",
            format: "png",
            anim: false,
          },
        },
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

      const bytes = await upstream.arrayBuffer()

      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/png",
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