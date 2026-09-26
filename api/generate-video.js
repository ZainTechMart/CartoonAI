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

    // SCENE 1 TASK
    const scene1Prompt = `${prompt}\n\nThis is SCENE 1 of a two-scene cartoon film. Establish the characters, environment and story clearly. Keep main characters visually consistent. Use 3D cartoon animation, smooth movement, detailed background and 16:9 composition.`;
    const scene1Id = await createAgnesTask(apiKey, scene1Prompt);

    // Rate Limit Gap
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // SCENE 2 TASK
    const scene2Prompt = `${prompt}\n\nThis is SCENE 2 and the continuation of Scene 1. Continue naturally from the first scene to a satisfying ending. Keep the same characters, clothing, colors and visual style.`;
    const scene2Id = await createAgnesTask(apiKey, scene2Prompt);

    // ENCODE JOB ID
    const jobData = {
      scene1_id: String(scene1Id),
      scene2_id: String(scene2Id)
    };

    const base64Str = Buffer.from(JSON.stringify(jobData), "utf8")
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const jobId = "multi_" + base64Str;

    return res.status(200).json({
      success: true,
      pending: true,
      job_id: jobId,
      scene_count: 2,
      message: "Both video scenes have been started successfully."
    });

  } catch (error) {
    console.error("Generate Route Error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Server error occurred."
    });
  }
}

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

  try { data = JSON.parse(rawText); } 
  catch { throw new Error("Agnes API returned non-JSON response: " + rawText.substring(0, 150)); }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || "Agnes video request failed.");
  }

  const videoId = data?.video_id || data?.id || data?.data?.video_id || data?.data?.id;
  if (!videoId) { throw new Error("Agnes did not return a valid video ID."); }

  return String(videoId);
}
