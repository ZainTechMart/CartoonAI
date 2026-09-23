module.exports = async function handler(req, res) {
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
    const apiKey = process.env.AGNES_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "AGNES_API_KEY is not configured."
      });
    }

    const prompt = String(
      req.body?.prompt || ""
    ).trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required."
      });
    }

    const response = await fetch(
      "https://apihub.agnes-ai.com/v1/videos",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          model: "agnes-video-v2.0",
          prompt: prompt,
          width: 1152,
          height: 768,
          num_frames: 121,
          frame_rate: 24
        })
      }
    );

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        error: "Agnes returned a non-JSON response.",
        provider_status: response.status,
        provider_response: rawText.substring(0, 1000)
      });
    }

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
};
