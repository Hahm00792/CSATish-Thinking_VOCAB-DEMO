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

  // ── 1단계: 직접 비교 (AI 없이) ──
  function norm(s) {
    return s.trim()
      .replace(/\s+/g, '')
      .replace(/하다$|한$|하는$|된$|되다$|인$|적인$|스러운$|적$|함$|임$/, '');
  }

  const correctParts = correctKo.split(/[,，、\/]/).map(s => s.trim()).filter(Boolean);
  const studentParts = studentAnswer.split(/[,，、\/]/).map(s => s.trim()).filter(Boolean);

  const directMatch = studentParts.some(sp =>
    correctParts.some(cp =>
      norm(sp) === norm(cp) ||
      norm(cp).includes(norm(sp)) ||
      norm(sp).includes(norm(cp))
    )
  );

  if (directMatch) {
    return res.status(200).json({ correct: true, reason: '정답의 의미를 포함하고 있습니다!' });
  }

  // ── 2단계: AI 채점 ──
  const prompt = `You are grading a Korean vocabulary test.

English word: ${word}
Correct meaning(s): ${correctKo}
Student's answer: ${studentAnswer}

RULES:
- CORRECT if student wrote any ONE of the correct meanings
- CORRECT if true synonym with same core meaning
- CORRECT if only grammatical form differs but meaning is same
- INCORRECT if words are different in meaning even if related
- INCORRECT if completely different meaning

Reply ONLY with JSON, no other text:
{"correct":true,"reason":"reason in Korean"}
or
{"correct":false,"reason":"reason in Korean"}`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
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

    // thinking 모드 대비: parts 중 text가 있는 것만 찾기
    const parts = data.candidates[0].content.parts;
    const textPart = parts.find(p => p.text && p.text.trim().length > 0);
    if (!textPart) {
      return res.status(500).json({ error: 'No text in response' });
    }

    let text = textPart.text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = text.match(/\{[^{}]*"correct"[^{}]*\}/);
    if (jsonMatch) {
      return res.status(200).json(JSON.parse(jsonMatch[0]));
    }

    const isCorrect = text.includes('"correct":true') || text.includes('"correct": true');
    return res.status(200).json({ correct: isCorrect, reason: '채점 완료' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
