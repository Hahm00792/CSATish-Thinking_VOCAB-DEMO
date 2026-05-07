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

  const prompt = `You are grading a Korean vocabulary test. Be generous.

English word: ${word}
Correct answer: ${correctKo}
Student wrote: ${studentAnswer}

Rules:
- If the student wrote ANY ONE of the correct meanings, mark as correct
- If the meaning is similar or synonymous, mark as correct
- Only mark wrong if completely different meaning
- Be generous, favor the student

Reply with ONLY this JSON, nothing else:
{"correct":true,"reason":"이유"}
or
{"correct":false,"reason":"이유"}`;

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
      return res.status(500).json({ error: 'No response', raw: JSON.stringify(data) });
    }

    let text = data.candidates[0].content.parts[0].text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
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
