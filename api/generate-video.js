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
        error: "AGNES_API_KEY is not configured in server environment."
      });
    }

    const prompt = String(req.body?.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required."
      });
    }

    // =========================
    // SCENE 1 PROMPT & TASK
    // =========================
    const scene1Prompt = `${prompt}\n\nThis is SCENE 1 of a two-scene cartoon film. Establish characters, environment and story clearly. Keep main characters visually consistent. Use 3D cartoon animation, 16:9 aspect ratio.`;

    console.log("Starting Scene 1 generation...");
    const scene1Id = await createAgnesTask(apiKey, scene1Prompt);

    // Rate-limit buffer (1 second gap to avoid API concurrency limits)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // =========================
    // SCENE 2 PROMPT & TASK
    // =========================
    const scene2Prompt = `${prompt}\n\nThis is SCENE 2 and continuation of Scene 1. Continue naturally from Scene 1 to a satisfying ending. Maintain exact visual style, character design, and background environment.`;

    console.log("Starting Scene 2 generation...");
    const scene2Id = await createAgnesTask(apiKey, scene2Prompt);

    // =========================
    // CREATE ENCODED JOB ID
    // =========================
    const jobData = {
      scene1_id: String(scene1Id),
      scene2_id: String(scene2Id)
    };

    // Safe Base64URL Encoding
    const jsonStr = JSON.stringify(jobData);
    const base64Str = Buffer.from(jsonStr, "utf8")
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const jobId = "multi_" + base64Str;

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      pending: true,
      job_id: jobId,
      scene_count: 2,
      message: "Both video scenes have been successfully started!"
    });

  } catch (error) {
    console.error("Video Generation Route Error:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error occurred."
    });
  }
}

// =====================================
// HELPER: CREATE AGNES VIDEO TASK
// =====================================
async function createAgnesTask(apiKey, prompt) {
  const response = await fetch("https://apihub.agnes-ai.com/v1/videos", {
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
      num_frames: 441,
      frame_rate: 24
    })
  });

  const rawText = await response.text();
  let data;

  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Agnes returned non-JSON response (HTTP ${response.status}): ${rawText.substring(0, 150)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || data?.detail || `Agnes API Error (HTTP ${response.status})`
    );
  }

  const videoId =
    data?.video_id ||
    data?.id ||
    data?.data?.video_id ||
    data?.data?.id ||
    data?.task_id;

  if (!videoId) {
    throw new Error("Agnes API did not return a valid video/task ID.");
  }

  return String(videoId);
}
