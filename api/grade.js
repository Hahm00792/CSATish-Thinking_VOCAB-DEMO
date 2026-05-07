export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, correctKo, studentAnswer } = req.body;
  if (!word || !correctKo || !studentAnswer) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'No API key' });

  // 1단계: 직접 문자열 비교 (완전 일치 또는 정답 항목 중 하나와 일치)
  const correctParts = correctKo.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  const studentTrimmed = studentAnswer.trim();

  const directMatch = correctParts.some(part =>
    part === studentTrimmed ||
    part.replace(/\s/g,'') === studentTrimmed.replace(/\s/g,'')
  );

  if (directMatch) {
    return res.status(200).json({ correct: true, reason: '정확히 맞았습니다!' });
  }

  // 2단계: AI 채점 - 적당히 엄격하게
  const prompt = `You are grading a Korean vocabulary test. Apply MODERATE strictness.

English word: ${word}
Correct Korean meaning(s): ${correctKo}
Student's answer: ${studentAnswer}

Grading rules:
- CORRECT if student wrote any one of the correct meanings exactly or very closely
- CORRECT if the meaning is clearly synonymous (e.g. "예상하다" and "예측하다")
- CORRECT if only the grammatical form differs but meaning is the same (e.g. "분리" vs "분리하다")
- INCORRECT if the meaning is related but distinctly different (e.g. "즉흥적인" vs "즉각적인" - these mean different things)
- INCORRECT if the meaning is in a completely different semantic field
- Do NOT be too lenient - similar-sounding or vaguely related words should be marked wrong

Respond ONLY with valid JSON, no markdown, no explanation outside JSON:
{"correct":true,"reason":"한 문장 이유"}
or
{"correct":false,"reason":"한 문장 이유"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 150, temperature: 0.1 }
        })
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      return res.status(500).json({ error: 'No response from Gemini', raw: JSON.stringify(data) });
    }

    let text = data.candidates[0].content.parts[0].text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return res.status(200).json(result);
    }

    const isCorrect = text.includes('"correct":true') || text.includes('"correct": true');
    return res.status(200).json({ correct: isCorrect, reason: '채점 완료' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
