export default async function handler(req, res) {
  // 1. Handling CORS & Methods
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "AGNES_API_KEY Missing in Vercel Env!" });
  }

  // 2. ACTION 1: CREATE VIDEO (POST Request)
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const prompt = String(body?.prompt || "").trim();

      if (!prompt) {
        return res.status(400).json({ success: false, error: "Prompt is required." });
      }

      // Start Scene 1
      const p1 = `${prompt}\n\n[SCENE 1 of 2]: 3D Pixar Style Cartoon Animation. Introduce main characters and setting. Widescreen 16:9, high detail.`;
      const scene1Id = await startAgnesTask(apiKey, p1);

      // Short delay to avoid API rate limits
      await new Promise(r => setTimeout(r, 1200));

      // Start Scene 2
      const p2 = `${prompt}\n\n[SCENE 2 of 2]: 3D Pixar Style Cartoon Animation. Continuation of Scene 1. Same character models, clothing, and environment. Climax and conclusion. Widescreen 16:9.`;
      const scene2Id = await startAgnesTask(apiKey, p2);

      // Encode Job Token
      const jobToken = Buffer.from(JSON.stringify({ s1: scene1Id, s2: scene2Id })).toString("base64url");

      return res.status(200).json({
        success: true,
        job_id: jobToken
      });

    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 3. ACTION 2: CHECK STATUS (GET Request)
  if (req.method === "GET") {
    try {
      const { job_id } = req.query;
      if (!job_id) return res.status(400).json({ success: false, error: "job_id query param missing" });

      const { s1, s2 } = JSON.parse(Buffer.from(job_id, "base64url").toString("utf8"));

      const res1 = await checkAgnesTask(apiKey, s1);
      const res2 = await checkAgnesTask(apiKey, s2);

      if (res1.failed) return res.status(200).json({ status: "failed", error: "Scene 1 render failed." });
      if (res2.failed) return res.status(200).json({ status: "failed", error: "Scene 2 render failed." });

      if (!res1.url) {
        return res.status(200).json({ status: "scene1", message: "Generating Scene 1..." });
      }

      if (!res2.url) {
        return res.status(200).json({ status: "scene2", message: "Scene 1 Done! Generating Scene 2..." });
      }

      // Both Ready!
      return res.status(200).json({
        status: "completed",
        scene1_url: res1.url,
        scene2_url: res2.url
      });

    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

// Helper: Start Agnes Video
async function startAgnesTask(apiKey, prompt) {
  const resp = await fetch("https://apihub.agnes-ai.com/v1/videos", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "agnes-video-v2.0",
      prompt: prompt,
      width: 1152,
      height: 768,
      num_frames: 441,
      frame_rate: 24
    })
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.message || data?.error || "Agnes API error");
  
  const id = data?.video_id || data?.id || data?.data?.id;
  if (!id) throw new Error("Could not get Video ID from Agnes");
  return id;
}

// Helper: Check Agnes Status
async function checkAgnesTask(apiKey, videoId) {
  const resp = await fetch(`https://apihub.agnes-ai.com/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=agnes-video-v2.0`, {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });

  const data = await resp.json();
  if (!resp.ok) return { failed: true };

  const url = data?.url || data?.video_url || data?.data?.url || data?.data?.video_url;
  const status = (data?.status || data?.data?.status || "").toLowerCase();

  if (url) return { completed: true, url };
  if (status === "failed" || status === "error") return { failed: true };

  return { completed: false };
}
