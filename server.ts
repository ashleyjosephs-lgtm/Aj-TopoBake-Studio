import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MODELS = new Set([
  "gemini-3-pro-image-preview",
  "gemini-nano-banana-2.1",
]);

const ALLOWED_SIZES = new Set(["1K", "2K", "4K"]);
const ALLOWED_RATIOS = new Set([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "21:9",
]);

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please select or configure your API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ai/image", async (req, res) => {
    try {
      const {
        prompt,
        model = "gemini-3-pro-image-preview",
        imageSize = "1K",
        aspectRatio = "1:1",
        mode = "diffuse-texture",
        referenceImageBase64,
        referenceMimeType = "image/png",
      } = req.body ?? {};

      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        res.status(400).json({ error: "A text prompt is required." });
        return;
      }

      const selectedModel = ALLOWED_MODELS.has(model)
        ? model
        : "gemini-3-pro-image-preview";
      const selectedSize = ALLOWED_SIZES.has(imageSize) ? imageSize : "1K";
      const selectedRatio = ALLOWED_RATIOS.has(aspectRatio) ? aspectRatio : "1:1";

      const systemPrefix =
        mode === "diffuse-texture"
          ? "Generate a clean, evenly-lit, flat albedo/diffuse PBR material texture map with zero harsh directional shadows, suitable for 3D UV mapping. Style and surface details: "
          : "Generate a studio-quality 3D product turntable showcase photograph with realistic softbox reflections, subtle contact shadow on a dark slate studio plinth, and crisp surface detail based on the provided 3D asset reference. Direction: ";

      const parts: Array<
        | { text: string }
        | { inlineData: { data: string; mimeType: string } }
      > = [];

      if (
        referenceImageBase64 &&
        typeof referenceImageBase64 === "string" &&
        referenceImageBase64.length > 0
      ) {
        const cleanedBase64 = referenceImageBase64.replace(
          /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
          ""
        );
        parts.push({
          inlineData: {
            data: cleanedBase64,
            mimeType: referenceMimeType || "image/png",
          },
        });
      }

      parts.push({
        text: `${systemPrefix}${prompt.trim()}`,
      });

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: selectedRatio,
            imageSize: selectedSize,
          },
        },
      });

      let imageDataUrl: string | null = null;
      let mimeType = "image/png";
      let notes = "";

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          mimeType = part.inlineData.mimeType ?? "image/png";
          imageDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
        } else if (part.text) {
          notes += (notes ? "\n" : "") + part.text;
        }
      }

      if (!imageDataUrl) {
        res.status(502).json({
          error:
            "The model completed without returning an image payload. Try refining your prompt.",
          notes,
        });
        return;
      }

      res.json({
        imageDataUrl,
        mimeType,
        notes,
        model: selectedModel,
        aspectRatio: selectedRatio,
        imageSize: selectedSize,
      });
    } catch (err: unknown) {
      const errorObj = err as { status?: number; message?: string };
      const statusCode =
        typeof errorObj?.status === "number" && errorObj.status >= 400
          ? errorObj.status
          : 500;
      const message =
        errorObj?.message || "Failed to generate image via Gemini API.";
      console.error("[/api/ai/image] Error:", message);
      res.status(statusCode).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`TopoBake Studio server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
