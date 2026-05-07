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

  const prompt = `You are grading a Korean high school vocabulary test. Apply these rules strictly:

CORRECT if:
- Student wrote any ONE of the correct meanings (e.g. correct="분리, 격리", student wrote "분리" → CORRECT)
- Student wrote a true synonym with the same core meaning (e.g. "예상하다" and "예측하다" → CORRECT)
- Only grammatical form differs but meaning is identical (e.g. "즉흥적" vs "즉흥적인" → CORRECT)

INCORRECT if:
- Words sound similar but have different meanings (e.g. "즉흥적인"(impromptu) vs "즉각적인"(immediate) → INCORRECT)
- Meaning is only vaguely related but clearly different (e.g. "자발적인"(voluntary) vs "자동적인"(automatic) → INCORRECT)
- Student's answer is in a completely different semantic category

English word: ${word}
Correct Korean meaning(s): ${correctKo}
Student's answer: ${studentAnswer}

Respond with ONLY valid JSON, no other text:
{"correct":true,"reason":"one sentence reason in Korean"}
or
{"correct":false,"reason":"one sentence reason in Korean"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0 }
        })
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      return res.status(500).json({ error: 'No response', raw: JSON.stringify(data) });
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
