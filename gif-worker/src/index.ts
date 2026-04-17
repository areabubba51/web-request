import { decode, Image } from "imagescript";

export interface Env {}

type PixelMatrixResponse = {
  width: number;
  height: number;
  pixels: number[][][];
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\s+/g, "");
}

function parseResize(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(1024, Math.floor(n)));
}

function imageToPixelMatrix(img: Image): PixelMatrixResponse {
  const width = img.width;
  const height = img.height;
  const rgba = img.bitmap; // Uint8ClampedArray, RGBA order

  const pixels: number[][][] = [];
  let i = 0;

  for (let y = 0; y < height; y++) {
    const row: number[][] = [];
    for (let x = 0; x < width; x++) {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      row.push([r, g, b]);
      i += 4;
    }
    pixels.push(row);
  }

  return { width, height, pixels };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const reqUrl = new URL(request.url);
    let imageUrl = reqUrl.searchParams.get("url");
    const resize = parseResize(reqUrl.searchParams.get("resize"));

    if (!imageUrl) {
      return json({ error: "Missing url" }, 400);
    }

    imageUrl = normalizeUrl(imageUrl);

    if (!/^https?:\/\//i.test(imageUrl)) {
      return json({ error: "URL must start with http or https" }, 400);
    }

    try {
      const upstream = await fetch(imageUrl, {
        headers: {
          "user-agent": "Mozilla/5.0",
          "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        return json(
          {
            error: `Fetch failed: ${upstream.status}`,
            finalUrl: upstream.url || imageUrl,
            body: text.slice(0, 300),
          },
          502
        );
      }

      const bytes = new Uint8Array(await upstream.arrayBuffer());

      // decode(..., true) -> first frame for GIFs
      const decoded = await decode(bytes, true);
      const img = decoded as Image;

      if (resize) {
        img.contain(resize, resize, Image.RESIZE_NEAREST_NEIGHBOR);
      }

      return json(imageToPixelMatrix(img), 200);
    } catch (err) {
      return json(
        {
          error: err instanceof Error ? err.message : "Unknown worker error",
          finalUrl: imageUrl,
        },
        500
      );
    }
  },
};