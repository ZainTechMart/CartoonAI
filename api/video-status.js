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

    const jobId = String(
      req.body?.job_id || ""
    ).trim();

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "job_id is required."
      });
    }

    if (!jobId.startsWith("multi_")) {
      return res.status(400).json({
        success: false,
        error: "Invalid job_id."
      });
    }

    // Decode job ID
    const encodedJob = jobId.substring(6);

    let jobData;

    try {
      jobData = JSON.parse(
        Buffer
          .from(encodedJob, "base64url")
          .toString("utf8")
      );
    } catch {
      return res.status(400).json({
        success: false,
        error: "Could not decode job_id."
      });
    }

    const scene1Id = String(
      jobData?.scene1_id || ""
    ).trim();

    const scene2Id = String(
      jobData?.scene2_id || ""
    ).trim();

    if (!scene1Id || !scene2Id) {
      return res.status(400).json({
        success: false,
        error: "Scene IDs are missing."
      });
    }

    // Check both scenes
    const scene1 = await checkAgnesVideo(
      apiKey,
      scene1Id
    );

    const scene2 = await checkAgnesVideo(
      apiKey,
      scene2Id
    );

    // Scene 1 failed
    if (scene1.failed) {
      return res.status(200).json({
        success: false,
        status: "failed",
        scene: 1,
        error:
          scene1.error ||
          "Scene 1 generation failed."
      });
    }

    // Scene 2 failed
    if (scene2.failed) {
      return res.status(200).json({
        success: false,
        status: "failed",
        scene: 2,
        error:
          scene2.error ||
          "Scene 2 generation failed."
      });
    }

    // Scene 1 still processing
    if (!scene1.video_url) {

      return res.status(200).json({
        success: false,
        pending: true,
        status: "scene1",
        scene1: "processing",
        scene2:
          scene2.video_url
            ? "completed"
            : "processing",
        job_id: jobId
      });
    }

    // Scene 2 still processing
    if (!scene2.video_url) {

      return res.status(200).json({
        success: false,
        pending: true,
        status: "scene2",
        scene1: "completed",
        scene2: "processing",
        job_id: jobId
      });
    }

    // Both scenes completed
    //
    // At this stage we have both video URLs.
    // The final single-video merge will be handled
    // by the next step.

    return res.status(200).json({
      success: false,
      pending: true,
      status: "merging",

      scene1_url: scene1.video_url,
      scene2_url: scene2.video_url,

      scene1: "completed",
      scene2: "completed",

      job_id: jobId,

      message:
        "Both scenes are ready. Preparing final video."
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Server error."
    });
  }
}


// =====================================
// CHECK ONE AGNES VIDEO
// =====================================

async function checkAgnesVideo(
  apiKey,
  videoId
) {

  const url =
    "https://apihub.agnes-ai.com/agnesapi" +
    "?video_id=" +
    encodeURIComponent(videoId) +
    "&model_name=agnes-video-v2.0";

  const response = await fetch(
    url,
    {
      method: "GET",

      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    }
  );

  const rawText =
    await response.text();

  let data;

  try {
    data = JSON.parse(rawText);
  } catch {

    return {
      failed: true,
      error:
        "Agnes returned invalid status response."
    };
  }

  if (!response.ok) {

    return {
      failed: true,
      error:
        data?.error ||
        data?.message ||
        "Agnes status request failed."
    };
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

    return {
      failed: false,
      completed: true,
      video_url: videoUrl
    };
  }

  if (
    status === "failed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "canceled"
  ) {

    return {
      failed: true,
      error:
        data?.message ||
        data?.error ||
        "Agnes video generation failed."
    };
  }

  return {
    failed: false,
    completed: false,
    status: status || "processing"
  };
        }
