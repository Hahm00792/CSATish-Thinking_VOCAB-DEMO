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

  // 1단계: 직접 문자열 비교 (AI 전에 먼저)
  const correctParts = correctKo.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  const studentTrimmed = studentAnswer.trim();

  const directMatch = correctParts.some(part =>
    part === studentTrimmed ||
    part.includes(studentTrimmed) ||
    studentTrimmed.includes(part)
  );

  if (directMatch) {
    return res.status(200).json({ correct: true, reason: '정답입니다!' });
  }

  // 2단계: AI 채점 (직접 비교 실패시)
  const prompt = `You are grading a Korean vocabulary test. Be very generous.

English word: ${word}
Correct meanings: ${correctKo}
Student's answer: ${studentAnswer}

Rules (STRICTLY follow these):
- If student wrote any ONE of the correct meanings → CORRECT
- If meaning is synonymous or similar → CORRECT  
- If meaning is partially correct → CORRECT
- Only mark INCORRECT if the meaning is completely unrelated
- When in doubt → mark as CORRECT

Respond ONLY with valid JSON, no other text:
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

    // JSON 파싱 실패시 텍스트로 판단
    const isCorrect = text.includes('"correct":true') || text.includes('"correct": true');
    return res.status(200).json({ correct: isCorrect, reason: '채점 완료' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
