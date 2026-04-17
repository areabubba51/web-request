import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon/workerd";

export interface Env {}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function parseResize(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(1024, Math.floor(n)));
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const imageUrl = url.searchParams.get("url");
    const resizeTo = parseResize(url.searchParams.get("resize"));

    if (!imageUrl) {
      return json({ error: "Missing ?url= parameter" }, 400);
    }

    try {
      const imageRes = await fetch(imageUrl, {
        headers: {
          "Accept": "image/*",
          "User-Agent": "Mozilla/5.0 (compatible; CFWorker)",
        },
      });

      if (!imageRes.ok) {
        const text = await imageRes.text().catch(() => "");
        return json(
          {
            error: `Image fetch failed with status ${imageRes.status}`,
            body: text.slice(0, 300),
            finalUrl: imageRes.url || imageUrl,
          },
          502
        );
      }

      const inputBytes = new Uint8Array(await imageRes.arrayBuffer());
      let photonImage = PhotonImage.new_from_byteslice(inputBytes);



      const width = photonImage.get_width();
      const height = photonImage.get_height();
      const rawPixels = photonImage.get_raw_pixels();

      const pixels: number[][][] = [];

      for (let y = 0; y < height; y++) {
        const row: number[][] = [];
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;

          const r = rawPixels[idx];
          const g = rawPixels[idx + 1];
          const b = rawPixels[idx + 2];
          const a = rawPixels[idx + 3] / 255;

          const rBlended = Math.round(r * a + (1 - a) * 255);
          const gBlended = Math.round(g * a + (1 - a) * 255);
          const bBlended = Math.round(b * a + (1 - a) * 255);

          row.push([rBlended, gBlended, bBlended]);
        }
        pixels.push(row);
      }

      photonImage.free();

      return json({
        width,
        height,
        pixels,
      });
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        500
      );
    }
  },
};