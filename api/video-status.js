export default async function handler(req, res) {
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

    const body = req.body || {};
    const videoId = String(
      body.video_id ||
      body.videoId ||
      body.task_id ||
      body.taskId ||
      ""
    ).trim();

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: "video_id is required."
      });
    }

    const url =
      "https://apihub.agnes-ai.com/agnesapi" +
      "?video_id=" +
      encodeURIComponent(videoId) +
      "&model_name=agnes-video-v2.0";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          data?.error ||
          data?.message ||
          "Agnes status request failed.",
        provider_response: data
      });
    }

    const videoUrl =
      data?.url ||
      data?.video_url ||
      data?.videoUrl ||
      data?.data?.url ||
      data?.data?.video_url ||
      data?.data?.videoUrl;

    const status = String(
      data?.status ||
      data?.data?.status ||
      ""
    ).toLowerCase();

    if (videoUrl) {
      return res.status(200).json({
        success: true,
        status: "completed",
        video_id: videoId,
        video_url: videoUrl
      });
    }

    if (
      status === "failed" ||
      status === "error" ||
      status === "cancelled" ||
      status === "canceled"
    ) {
      return res.status(200).json({
        success: false,
        status,
        video_id: videoId,
        error: data?.message || "Video generation failed.",
        provider_response: data
      });
    }

    return res.status(200).json({
      success: false,
      pending: true,
      status: status || "processing",
      video_id: videoId
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Server error."
    });
  }
      }
