export interface Env {}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  })
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\s+/g, "")
}

function detectImageType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png"
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    return "image/gif"
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp"
  }

  return null
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

      const bytes = new Uint8Array(await upstream.arrayBuffer())
      const headerType = upstream.headers.get("content-type") || ""
      const detectedType = detectImageType(bytes)
      const finalType = headerType.startsWith("image/") ? headerType : detectedType

      if (!finalType) {
        let preview = ""
        try {
          preview = new TextDecoder().decode(bytes.slice(0, 300))
        } catch {
          preview = "[binary response]"
        }

        return json(
          {
            ok: false,
            error: "Response was not an image",
            finalUrl: upstream.url || imageUrl,
            contentType: headerType,
            body: preview,
          },
          400
        )
      }

      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": finalType,
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=3600",
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