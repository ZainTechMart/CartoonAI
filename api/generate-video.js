export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Only POST requests are allowed."
    });
  }

  try {
    // API key must come from Vercel Environment Variables
    const apiKey = process.env.AGNES_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "AGNES_API_KEY is not configured."
      });
    }

    const body = req.body || {};

    const prompt = String(body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required."
      });
    }

    // Keep first test simple: 16:9, about 5 seconds
    const width = 1152;
    const height = 768;
    const numFrames = 121;
    const frameRate = 24;

    const response = await fetch(
      "https://apihub.agnes-ai.com/v1/videos",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "agnes-video-v2.0",
          prompt: prompt,
          width: width,
          height: height,
          num_frames: numFrames,
          frame_rate: frameRate
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          data?.error ||
          data?.message ||
          "Agnes video request failed.",
        provider_response: data
      });
    }

    // Agnes documentation allows video_id/task_id
    const videoId =
      data?.video_id ||
      data?.task_id ||
      data?.id ||
      data?.data?.video_id ||
      data?.data?.task_id ||
      data?.data?.id;

    if (!videoId) {
      return res.status(502).json({
        success: false,
        error: "Agnes did not return a video ID.",
        provider_response: data
      });
    }

    return res.status(200).json({
      success: true,
      pending: true,
      video_id: String(videoId),
      message: "Video generation started."
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Server error."
    });
  }
  }
