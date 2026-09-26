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

    const jobId = String(req.body?.job_id || "").trim();

    if (!jobId || !jobId.startsWith("multi_")) {
      return res.status(400).json({
        success: false,
        error: "Invalid job_id."
      });
    }

    const encodedJob = jobId.substring(6);
    let jobData;

    try {
      // Decode Base64URL
      let base64 = encodedJob.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) { base64 += "="; }
      jobData = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    } catch {
      return res.status(400).json({
        success: false,
        error: "Could not decode job_id."
      });
    }

    const scene1Id = String(jobData?.scene1_id || "").trim();
    const scene2Id = String(jobData?.scene2_id || "").trim();

    if (!scene1Id || !scene2Id) {
      return res.status(400).json({
        success: false,
        error: "Scene IDs are missing."
      });
    }

    const scene1 = await checkAgnesVideo(apiKey, scene1Id);
    const scene2 = await checkAgnesVideo(apiKey, scene2Id);

    if (scene1.failed) {
      return res.status(200).json({
        success: false,
        status: "failed",
        error: scene1.error || "Scene 1 failed."
      });
    }

    if (scene2.failed) {
      return res.status(200).json({
        success: false,
        status: "failed",
        error: scene2.error || "Scene 2 failed."
      });
    }

    // Scene 1 processing
    if (!scene1.video_url) {
      return res.status(200).json({
        success: true,
        pending: true,
        status: "scene1",
        job_id: jobId
      });
    }

    // Scene 2 processing
    if (!scene2.video_url) {
      return res.status(200).json({
        success: true,
        pending: true,
        status: "scene2",
        job_id: jobId
      });
    }

    // BOTH COMPLETED! Return status = completed to Frontend
    return res.status(200).json({
      success: true,
      pending: false,
      status: "completed",
      video_url: scene1.video_url,
      scene1_url: scene1.video_url,
      scene2_url: scene2.video_url,
      job_id: jobId
    });

  } catch (error) {
    console.error("Status Route Error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Server error."
    });
  }
}

async function checkAgnesVideo(apiKey, videoId) {
  const url = "https://apihub.agnes-ai.com/agnesapi?video_id=" + encodeURIComponent(videoId) + "&model_name=agnes-video-v2.0";

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  });

  const rawText = await response.text();
  let data;

  try { data = JSON.parse(rawText); } 
  catch { return { failed: true, error: "Invalid Agnes status response." }; }

  if (!response.ok) {
    return { failed: true, error: data?.error || data?.message || "Agnes status failed." };
  }

  const videoUrl = data?.url || data?.video_url || data?.videoUrl || data?.data?.url || data?.data?.video_url || data?.data?.videoUrl;
  const status = String(data?.status || data?.data?.status || "").toLowerCase();

  if (videoUrl) {
    return { failed: false, completed: true, video_url: videoUrl };
  }

  if (status === "failed" || status === "error" || status === "cancelled") {
    return { failed: true, error: data?.message || "Agnes video failed." };
  }

  return { failed: false, completed: false, status: status || "processing" };
}
