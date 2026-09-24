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

    const prompt = String(
      req.body?.prompt || ""
    ).trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "Prompt is required."
      });
    }

    // =========================
    // SCENE 1
    // =========================

    const scene1Prompt =
      prompt +
      "\n\n" +
      "This is SCENE 1 of a two-scene cartoon film. " +
      "Establish the characters, environment and story clearly. " +
      "Keep the main characters visually consistent. " +
      "Use cinematic 3D cartoon animation, smooth movement, " +
      "detailed background and 16:9 composition.";

    const scene1Id = await createAgnesTask(
      apiKey,
      scene1Prompt
    );

    // =========================
    // SCENE 2
    // =========================

    const scene2Prompt =
      prompt +
      "\n\n" +
      "This is SCENE 2 and the continuation of the same cartoon film. " +
      "Continue naturally from the first scene and move the story " +
      "toward a satisfying ending. " +
      "Keep the same characters, clothing, colors and visual style. " +
      "Use cinematic 3D cartoon animation, smooth movement, " +
      "detailed background and 16:9 composition.";

    const scene2Id = await createAgnesTask(
      apiKey,
      scene2Prompt
    );

    // =========================
    // CREATE JOB ID
    // =========================

    const jobData = {
      scene1_id: String(scene1Id),
      scene2_id: String(scene2Id)
    };

    const encodedJob = Buffer
      .from(JSON.stringify(jobData))
      .toString("base64url");

    const jobId = "multi_" + encodedJob;

    // =========================
    // RESPONSE
    // =========================

    return res.status(200).json({
      success: true,
      pending: true,
      job_id: jobId,
      scene_count: 2,
      message: "Both video scenes have been started."
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
// CREATE AGNES VIDEO TASK
// =====================================

async function createAgnesTask(apiKey, prompt) {

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

        // 441 frames / 24 FPS = 18.375 seconds
        num_frames: 441,

        frame_rate: 24
      })
    }
  );

  const rawText =
    await response.text();

  let data;

  try {
    data = JSON.parse(rawText);
  } catch {

    throw new Error(
      "Agnes returned a non-JSON response. HTTP " +
      response.status
    );
  }

  if (!response.ok) {

    throw new Error(
      data?.error ||
      data?.message ||
      "Agnes video request failed."
    );
  }

  const videoId =
    data?.video_id ||
    data?.id ||
    data?.data?.video_id ||
    data?.data?.id;

  if (!videoId) {

    throw new Error(
      "Agnes did not return a video ID."
    );
  }

  return String(videoId);
      }
