export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { word, correctKo, studentAnswer } = req.body;

  if (!word || !correctKo || !studentAnswer) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `수능 영어 단어 시험 채점관입니다.

채점 기준:
- 정답에 여러 뜻이 있을 경우 (예: "부서지기 쉬운, 취약한"), 그 중 하나만 써도 정답
- 핵심 의미가 맞으면 정답
- 유사어/동의어도 정답
- 띄어쓰기나 조사가 살짝 틀려도 정답
- 애매한 경우 무조건 정답으로 판단 (학생 배려)
- 완전히 다른 의미일 때만 오답

단어: ${word}
정답: ${correctKo}
학생 답변: ${studentAnswer}

JSON만 응답 (다른 텍스트 없이): {"correct": true또는false, "reason": "한 문장"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 100, temperature: 0.1 }
        })
      }
    );

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text
      .trim()
      .replace(/```json|```/g, '')
      .trim();

    const result = JSON.parse(text);
    return res.status(200).json(result);

  } catch (error) {
    return res.status(500).json({ error: 'Grading failed', detail: error.message });
  }
}
